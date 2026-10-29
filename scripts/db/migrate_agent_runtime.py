"""Migração para tabelas do runtime agêntico: agent_hosts, agent_tool_calls, chat_turn_state."""

import asyncio
import logging
from api.db import get_or_init_db_pool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("charlie.agent_runtime_migration")

SCHEMA = """
-- Tabela de hosts (dispositivos do usuário que podem executar ferramentas)
CREATE TABLE IF NOT EXISTS agent_hosts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    capabilities JSONB NOT NULL DEFAULT '[]',
    telemetry JSONB NOT NULL DEFAULT '{}',
    last_seen_at DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_hosts_user_id ON agent_hosts(user_id);

-- Tabela de chamadas de ferramenta enfileiradas para execução remota
CREATE TABLE IF NOT EXISTS agent_tool_calls (
    call_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    host_id TEXT,
    tool TEXT NOT NULL,
    args JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'queued',
    result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_user_status ON agent_tool_calls(user_id, status);

-- Tabela de estado de turnos de chat retomáveis (modo cloud)
CREATE TABLE IF NOT EXISTS chat_turn_state (
    turn_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    request_id TEXT NOT NULL UNIQUE,
    state JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'open',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_turn_state_request_id ON chat_turn_state(request_id);
"""

async def up(pool) -> None:
    """Executa a migração criando as tabelas se não existirem."""
    async with pool.acquire() as conn:
        for stmt in SCHEMA.strip().split(';'):
            stmt = stmt.strip()
            if stmt:
                await conn.execute(stmt)
    logger.info("Migração agent_runtime concluída: 3 tabelas + 3 índices criados/verificados.")


async def main():
    pool = await get_or_init_db_pool()
    if not pool:
        logger.error("Não foi possível conectar ao banco Supabase.")
        return
    await up(pool)


if __name__ == "__main__":
    asyncio.run(main())