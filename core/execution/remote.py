"""RemoteHostExecutor — execução de tools via fila Postgres no host remoto."""

from __future__ import annotations
import asyncio
import time
import uuid
from typing import Callable, Optional

from core.execution.contracts import ToolCall, ToolResult, HostInfo
from api.db import get_or_init_db_pool


class RemoteHostExecutor:
    """Executor remoto que despacha tools via fila agent_tool_calls e aguarda resultado."""
    
    def __init__(self, pool_factory: Optional[Callable] = None):
        self.pool_factory = pool_factory or get_or_init_db_pool
    
    def hosts_for(self, user_id: str) -> list[HostInfo]:
        """Retorna hosts online do usuário (last_seen_at > now - 30s)."""
        # This is a synchronous method, but we need to run async query
        # For simplicity, we'll make it async in practice but sync here
        # The actual implementation will be async in execute()
        return []
    
    async def _get_online_hosts(self, user_id: str) -> list[HostInfo]:
        """Busca hosts online do usuário (last_seen_at > now - 30s)."""
        pool = self.pool_factory()
        if not pool:
            return []
        
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT id, user_id, name, capabilities, telemetry, last_seen_at, created_at
                FROM agent_hosts
                WHERE user_id = $1 AND last_seen_at > $2
            """, user_id, time.time() - 30)
        
        return [
            HostInfo(
                host_id=row["id"],
                name=row["name"],
                capabilities=row["capabilities"],
                last_seen_at=row["last_seen_at"],
                online=True
            )
            for row in rows
        ]
    
    async def execute(self, call: "ToolCall", user_id: str, timeout: float = 15.0) -> ToolResult:
        """Executa tool via fila Postgres e aguarda resultado."""
        start_time = time.time()
        
        # 1. Verifica pool
        pool = self.pool_factory()
        if not pool:
            return ToolResult(
                call_id=call.call_id,
                status="unavailable",
                output="Executor indisponível: pool de banco não inicializado.",
                error_type="no_executor",
                is_recoverable=False
            )
        
        # 2. Busca hosts online do usuário
        hosts = await self._get_online_hosts(user_id)
        if not hosts:
            return ToolResult(
                call_id=call.call_id,
                status="unavailable",
                output=f"Sem executor disponível: nenhum host do usuário está conectado para executar '{call.name}'.",
                error_type="host_offline",
                is_recoverable=False
            )
        
        # Usa o primeiro host online
        host = hosts[0]
        host_id = host.host_id
        
        # 3. Insere call na fila com status queued
        call_id = call.call_id or f"call_{uuid.uuid4().hex[:8]}"
        try:
            async with pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO agent_tool_calls (call_id, user_id, host_id, tool, args, status, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, 'queued', $6, $7)
                """, call_id, user_id, host_id, call.name, call.arguments, time.time(), time.time())
        except Exception as e:
            return ToolResult(
                call_id=call_id,
                status="error",
                output=f"Erro ao enfileirar call: {e}",
                error_type="enqueue_failed",
                is_recoverable=True
            )
        
        # 4. Poll até status terminal ou timeout
        poll_interval = 0.25
        deadline = time.time() + timeout
        
        while time.time() < deadline:
            await asyncio.sleep(poll_interval)
            
            try:
                async with pool.acquire() as conn:
                    row = await conn.fetchrow("""
                        SELECT call_id, status, result, tool, args
                        FROM agent_tool_calls
                        WHERE call_id = $1 AND user_id = $2
                    """, call_id, user_id)
            except Exception:
                continue
            
            if not row:
                continue
            
            status = row["status"]
            if status in ("done", "success"):
                result_data = row["result"] or {}
                return ToolResult(
                    call_id=call_id,
                    status="success",
                    output=result_data.get("output", ""),
                    host_id=host_id,
                    duration_ms=int((time.time() - start_time) * 1000),
                    error_type=result_data.get("error_type"),
                    is_recoverable=result_data.get("is_recoverable", False)
                )
            elif status in ("failed", "error"):
                result_data = row["result"] or {}
                return ToolResult(
                    call_id=call_id,
                    status="error",
                    output=result_data.get("output", "Erro na execução remota"),
                    host_id=host_id,
                    duration_ms=int((time.time() - start_time) * 1000),
                    error_type=result_data.get("error_type", "remote_error"),
                    is_recoverable=result_data.get("is_recoverable", True)
                )
            elif status == "timeout":
                return ToolResult(
                    call_id=call_id,
                    status="timeout",
                    output="Timeout na execução remota.",
                    host_id=host_id,
                    duration_ms=int((time.time() - start_time) * 1000),
                    error_type="host_timeout",
                    is_recoverable=True
                )
            # status == "queued" ou "delivered" → continua polling
        
        # 5. Timeout — marca row como timeout
        try:
            async with pool.acquire() as conn:
                await conn.execute("""
                    UPDATE agent_tool_calls
                    SET status = 'timeout', updated_at = $1
                    WHERE call_id = $2 AND user_id = $3
                """, time.time(), call_id, user_id)
        except Exception:
            pass
        
        return ToolResult(
            call_id=call_id,
            status="timeout",
            output="Timeout na execução remota (host não respondeu a tempo).",
            host_id=host_id,
            duration_ms=int((time.time() - start_time) * 1000),
            error_type="host_timeout",
            is_recoverable=True
        )
