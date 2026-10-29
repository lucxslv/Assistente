"""Rotas do host executor — heartbeat autenticado, claim de calls e post de resultados."""

import logging
import time
import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Header, Request, status

from api.db import get_or_init_db_pool
from api.routes.pair import get_authorized_device_async
from api.routes.auth import verify_supabase_token

logger = logging.getLogger("charlie.host")


router = APIRouter(prefix="/host", tags=["HostExecutor"])


class HeartbeatRequest(BaseModel):
    host_id: Optional[str] = None
    name: str
    capabilities: List[str]
    telemetry: Optional[Dict[str, Any]] = None


class PendingCallsRequest(BaseModel):
    limit: int = 10


class ToolResultRequest(BaseModel):
    call_id: str
    status: str
    output: str
    duration_ms: Optional[int] = None
    error_type: Optional[str] = None


async def _resolve_caller(authorization: Optional[str]) -> str:
    """Resolve caller user_id via device token ou user token (Zero Trust)."""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação obrigatória. Forneça token de dispositivo ou credencial de usuário."
        )
    
    clean_token = authorization.replace("Bearer ", "").strip()
    
    # 1. Tenta dispositivo móvel pareado
    device = await get_authorized_device_async(clean_token)
    if device:
        return str(device.get("user_id") or "default")
    
    # 2. Tenta token de usuário Supabase
    user = await verify_supabase_token(clean_token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de dispositivo ou usuário inválido ou revogado. Pareie novamente."
        )
    
    return str(user.get("id") or "default")


@router.post("/heartbeat")
async def heartbeat(
    req: HeartbeatRequest,
    authorization: Optional[str] = Header(None),
    request: Request = None
) -> Dict[str, Any]:
    """
    Heartbeat do host executor — upsert em agent_hosts.
    
    Body: {host_id?, name, capabilities[], telemetry?}
    Response: {host_id, server_time, poll_interval_ms: 2000}
    """
    user_id = await _resolve_caller(authorization)
    pool = await get_or_init_db_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Banco indisponível")
    
    host_id = req.host_id or f"host_{uuid.uuid4().hex[:8]}"
    now_ts = time.time()
    now_dt = time.strftime("%Y-%m-%d %H:%M:%S")
    
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO agent_hosts (id, user_id, name, capabilities, telemetry, last_seen_at, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO UPDATE SET
                user_id = EXCLUDED.user_id,
                name = EXCLUDED.name,
                capabilities = EXCLUDED.capabilities,
                telemetry = EXCLUDED.telemetry,
                last_seen_at = EXCLUDED.last_seen_at
        """, host_id, user_id, req.name, req.capabilities, req.telemetry or {}, now_ts, now_dt)
    
    return {
        "host_id": host_id,
        "server_time": now_dt,
        "poll_interval_ms": 2000
    }


@router.get("/pending-calls")
async def pending_calls(
    limit: int = 10,
    authorization: Optional[str] = Header(None),
    request: Request = None
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Claim atômico de calls pendentes — FOR UPDATE SKIP LOCKED.
    
    Response: {calls: [{call_id, tool, args}]}
    """
    user_id = await _resolve_caller(authorization)
    pool = await get_or_init_db_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Banco indisponível")
    
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            UPDATE agent_tool_calls
            SET status = 'delivered', host_id = $1
            WHERE call_id IN (
                SELECT call_id FROM agent_tool_calls
                WHERE user_id = $2 AND status = 'queued'
                ORDER BY created_at
                LIMIT $3
                FOR UPDATE SKIP LOCKED
                RETURNING call_id
            )
            RETURNING call_id, tool, args
        """, f"host_{uuid.uuid4().hex[:8]}", user_id, limit)
        
        calls = [
            {"call_id": row["call_id"], "tool": row["tool"], "args": row["args"]}
            for row in rows
        ]
    
    return {"calls": calls}


@router.post("/tool-results")
async def tool_results(
    req: ToolResultRequest,
    authorization: Optional[str] = Header(None),
    request: Request = None
) -> Dict[str, str]:
    """
    Host posta resultado de execução de tool.
    
    Body: {call_id, status, output, duration_ms?, error_type?}
    Atualiza agent_tool_calls onde call_id=$1 AND user_id=$2.
    404 se 0 linhas atualizadas.
    """
    user_id = await _resolve_caller(authorization)
    pool = await get_or_init_db_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="Banco indisponível")
    
    async with pool.acquire() as conn:
        result = await conn.execute("""
            UPDATE agent_tool_calls
            SET status = $1, result = $2, updated_at = $3
            WHERE call_id = $4 AND user_id = $5
        """, req.status, {"output": req.output, "error_type": req.error_type, "duration_ms": req.duration_ms}, time.time(), req.call_id, user_id)
    
    if result == "UPDATE 0":
        raise HTTPException(status_code=404, detail="Call não encontrado ou não pertence ao usuário.")
    
    return {"status": "ok"}