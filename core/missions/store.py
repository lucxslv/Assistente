"""Persistência multi-tenant para missões e permissões."""

import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

import asyncpg

from core.missions.models import AgentSession, AgentPermission

logger = logging.getLogger(__name__)


async def _serialize_for_json(obj: Any) -> Any:
    """Serializa objetos para JSON compatível com asyncpg."""
    if isinstance(obj, (datetime, uuid.UUID)):
        return str(obj)
    if isinstance(obj, dict):
        return {k: await _serialize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [await _serialize_for_json(v) for v in obj]
    return obj


async def save_session(pool: asyncpg.Pool, session: AgentSession) -> None:
    """Upsert de sessão de missão."""
    graph_json = await _serialize_for_json(session.graph_json)
    state_json = await _serialize_for_json(session.state_json)
    
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO agent_sessions (id, user_id, thread_id, goal, status, graph_json, state_json, created_at, updated_at, completed_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (id) DO UPDATE SET
                user_id = EXCLUDED.user_id,
                thread_id = EXCLUDED.thread_id,
                goal = EXCLUDED.goal,
                status = EXCLUDED.status,
                graph_json = EXCLUDED.graph_json,
                state_json = EXCLUDED.state_json,
                updated_at = EXCLUDED.updated_at,
                completed_at = EXCLUDED.completed_at
        """, session.id, session.user_id, session.thread_id, session.goal, session.status,
           json.dumps(graph_json), json.dumps(state_json),
           session.created_at, session.updated_at, session.completed_at)
    logger.debug(f"Sessão salva: {session.id} ({session.status})")


async def load_session(pool: asyncpg.Pool, session_id: str) -> Optional[AgentSession]:
    """Carrega sessão de missão por ID."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow("""
            SELECT id, user_id, thread_id, goal, status, graph_json, state_json, created_at, updated_at, completed_at
            FROM agent_sessions WHERE id = $1
        """, session_id)
        if not row:
            return None
        return AgentSession(
            id=row['id'],
            user_id=row['user_id'],
            thread_id=row['thread_id'],
            goal=row['goal'],
            status=row['status'],
            graph_json=row['graph_json'] or {},
            state_json=row['state_json'] or {},
            created_at=row['created_at'],
            updated_at=row['updated_at'],
            completed_at=row['completed_at']
        )


async def list_user_sessions(pool: asyncpg.Pool, user_id: str, status: Optional[str] = None) -> List[AgentSession]:
    """Lista sessões do usuário, opcionalmente filtradas por status."""
    async with pool.acquire() as conn:
        if status:
            rows = await conn.fetch("""
                SELECT id, user_id, thread_id, goal, status, graph_json, state_json, created_at, updated_at, completed_at
                FROM agent_sessions WHERE user_id = $1 AND status = $2
                ORDER BY updated_at DESC
            """, user_id, status)
        else:
            rows = await conn.fetch("""
                SELECT id, user_id, thread_id, goal, status, graph_json, state_json, created_at, updated_at, completed_at
                FROM agent_sessions WHERE user_id = $1
                ORDER BY updated_at DESC
            """, user_id)
        
        return [
            AgentSession(
                id=row['id'],
                user_id=row['user_id'],
                thread_id=row['thread_id'],
                goal=row['goal'],
                status=row['status'],
                graph_json=row['graph_json'] or {},
                state_json=row['state_json'] or {},
                created_at=row['created_at'],
                updated_at=row['updated_at'],
                completed_at=row['completed_at']
            )
            for row in rows
        ]


async def update_session_state(pool: asyncpg.Pool, session_id: str, state_json: Dict[str, Any], graph_json: Optional[Dict[str, Any]] = None) -> None:
    """Atualiza estado (e opcionalmente grafo) da sessão."""
    state_json_serialized = await _serialize_for_json(state_json)
    
    async with pool.acquire() as conn:
        if graph_json is not None:
            graph_json_serialized = await _serialize_for_json(graph_json)
            await conn.execute("""
                UPDATE agent_sessions SET state_json = $1, graph_json = $2, updated_at = NOW()
                WHERE id = $3
            """, json.dumps(state_json_serialized), json.dumps(graph_json_serialized), session_id)
        else:
            await conn.execute("""
                UPDATE agent_sessions SET state_json = $1, updated_at = NOW()
                WHERE id = $2
            """, json.dumps(state_json_serialized), session_id)
    logger.debug(f"Estado da sessão atualizado: {session_id}")


async def mark_session_status(pool: asyncpg.Pool, session_id: str, status: str) -> None:
    """Marca status da sessão (running, paused, completed, failed)."""
    completed_at = datetime.now() if status in ("completed", "failed") else None
    
    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE agent_sessions SET status = $1, completed_at = $2, updated_at = NOW()
            WHERE id = $3
        """, status, completed_at, session_id)
    logger.info(f"Status da sessão {session_id} alterado para {status}")


async def save_permission(pool: asyncpg.Pool, permission: AgentPermission) -> None:
    """Salva permissão (upsert)."""
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO agent_permissions (id, session_id, task_id, tool, risk_level, status, requested_at, resolved_at, resolved_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE SET
                status = EXCLUDED.status,
                resolved_at = EXCLUDED.resolved_at,
                resolved_by = EXCLUDED.resolved_by
        """, permission.id, permission.session_id, permission.task_id, permission.tool,
           permission.risk_level, permission.status, permission.requested_at,
           permission.resolved_at, permission.resolved_by)
    logger.debug(f"Permissão salva: {permission.id} ({permission.status})")


async def get_pending_permissions(pool: asyncpg.Pool, session_id: str) -> List[AgentPermission]:
    """Lista permissões pendentes de uma sessão."""
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, session_id, task_id, tool, risk_level, status, requested_at, resolved_at, resolved_by
            FROM agent_permissions WHERE session_id = $1 AND status = 'pending'
            ORDER BY requested_at
        """, session_id)
        
        return [
            AgentPermission(
                id=row['id'],
                session_id=row['session_id'],
                task_id=row['task_id'],
                tool=row['tool'],
                risk_level=row['risk_level'],
                status=row['status'],
                requested_at=row['requested_at'],
                resolved_at=row['resolved_at'],
                resolved_by=row['resolved_by']
            )
            for row in rows
        ]


async def resolve_permission(pool: asyncpg.Pool, permission_id: str, approved: bool, resolved_by: str) -> bool:
    """Resolve uma permissão (approve/reject)."""
    status = "approved" if approved else "rejected"
    async with pool.acquire() as conn:
        result = await conn.execute("""
            UPDATE agent_permissions SET status = $1, resolved_at = NOW(), resolved_by = $2
            WHERE id = $3 AND status = 'pending'
        """, status, resolved_by, permission_id)
        return result == "UPDATE 1"
