"""Migração para tabelas de missões: agent_sessions, agent_permissions."""

import asyncio
import logging
from api.db import get_or_init_db_pool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("charlie.missions_migration")

SCHEMA = """
-- Tabela de sessões de missões (multi-tenant, persistência de grafo + estado)
CREATE TABLE IF NOT EXISTS agent_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    goal TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    graph_json JSONB NOT NULL DEFAULT '{}',
    state_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_id_status ON agent_sessions(user_id, status);

-- Tabela de permissões pendentes/resolvidas por sessão
CREATE TABLE IF NOT EXISTS agent_permissions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    tool TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_permissions_session_id_status ON agent_permissions(session_id, status);
"""

async def up(pool) -> None:
    """Executa a migração criando as tabelas se não existirem."""
    async with pool.acquire() as conn:
        for stmt in SCHEMA.strip().split(';'):
            stmt = stmt.strip()
            if stmt:
                await conn.execute(stmt)
    logger.info("Migração de missões concluída: 2 tabelas + 2 índices criados/verificados.")


async def main():
    pool = await get_or_init_db_pool()
    if not pool:
        logger.error("Não foi possível conectar ao banco Supabase.")
        return
    await up(pool)


if __name__ == "__main__":
    asyncio.run(main())
