"""Persistência multi-tenant de missões no Postgres."""

import json
from datetime import datetime
from typing import Optional, List
from uuid import uuid4

from core.missions.models import AgentSession


async def save_session(pool, session: AgentSession) -> None:
    """Upsert de sessão de missão."""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO agent_sessions 
            (id, user_id, thread_id, goal, status, graph_json, state_json, created_at, updated_at, completed_at)
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
            """,
            session.id,
            session.user_id,
            session.thread_id,
            session.goal,
            session.status,
            json.dumps(session.graph_json),
            json.dumps(session.state_json),
            session.created_at,
            session.updated_at,
            session.completed_at,
        )


async def load_session(pool, session_id: str) -> Optional[AgentSession]:
    """Carrega sessão por ID."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM agent_sessions WHERE id = $1",
            session_id
        )
        if not row:
            return None
        return AgentSession(
            id=row["id"],
            user_id=row["user_id"],
            thread_id=row["thread_id"],
            goal=row["goal"],
            status=row["status"],
            graph_json=row["graph_json"],
            state_json=row["state_json"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            completed_at=row["completed_at"],
        )


async def list_user_sessions(pool, user_id: str, status: Optional[str] = None) -> List[AgentSession]:
    """Lista sessões do usuário, opcionalmente filtradas por status."""
    async with pool.acquire() as conn:
        if status:
            rows = await conn.fetch(
                "SELECT * FROM agent_sessions WHERE user_id = $1 AND status = $2 ORDER BY updated_at DESC",
                user_id, status
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM agent_sessions WHERE user_id = $1 ORDER BY updated_at DESC",
                user_id
            )
        
        return [
            AgentSession(
                id=row["id"],
                user_id=row["user_id"],
                thread_id=row["thread_id"],
                goal=row["goal"],
                status=row["status"],
                graph_json=row["graph_json"],
                state_json=row["state_json"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                completed_at=row["completed_at"],
            )
            for row in rows
        ]


async def update_session_state(pool, session_id: str, state_json: dict, graph_json: Optional[dict] = None) -> None:
    """Atualiza state_json e opcionalmente graph_json da sessão."""
    async with pool.acquire() as conn:
        if graph_json is not None:
            await conn.execute(
                """
                UPDATE agent_sessions 
                SET state_json = $1, graph_json = $2, updated_at = NOW()
                WHERE id = $3
                """,
                json.dumps(state_json), json.dumps(graph_json), session_id
            )
        else:
            await conn.execute(
                """
                UPDATE agent_sessions 
                SET state_json = $1, updated_at = NOW()
                WHERE id = $2
                """,
                json.dumps(state_json), session_id
            )


async def mark_session_status(pool, session_id: str, status: str) -> None:
    """Atualiza status da sessão; define completed_at se completed/failed."""
    async with pool.acquire() as conn:
        if status in ("completed", "failed"):
            await conn.execute(
                """
                UPDATE agent_sessions 
                SET status = $1, completed_at = NOW(), updated_at = NOW()
                WHERE id = $2
                """,
                status, session_id
            )
        else:
            await conn.execute(
                """
                UPDATE agent_sessions 
                SET status = $1, updated_at = NOW()
                WHERE id = $2
                """,
                status, session_id
            )
