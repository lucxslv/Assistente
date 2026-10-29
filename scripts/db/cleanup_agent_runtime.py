"""Limpeza de tabelas legadas do device broker (substituídas pelo runtime agêntico unificado)."""

import asyncio
import logging
from api.db import get_or_init_db_pool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("charlie.agent_runtime_cleanup")

CLEANUP_SQL = """
-- Remove tabelas legadas do device broker (WS-based, substituídas por agent_*)
DROP TABLE IF EXISTS device_host_state;
DROP TABLE IF EXISTS device_pending_commands;
DROP TABLE IF EXISTS device_pairing_sessions;
DROP TABLE IF EXISTS device_authorized_devices;

-- Remove colunas user_id legadas (default hardcoded) que migrações anteriores adicionaram
ALTER TABLE "Thread" DROP COLUMN IF EXISTS "userId";
ALTER TABLE "UserMemory" DROP COLUMN IF EXISTS user_id;
ALTER TABLE "UserPreference" DROP COLUMN IF EXISTS user_id;

-- Remove índices legados
DROP INDEX IF EXISTS idx_device_cmd_pending;
DROP INDEX IF EXISTS idx_device_cmd_user_pending;
DROP INDEX IF EXISTS idx_device_pairing_pin;
DROP INDEX IF EXISTS idx_device_auth_token;
"""

async def cleanup(pool) -> None:
    """Remove tabelas e colunas legadas do device broker."""
    async with pool.acquire() as conn:
        for stmt in CLEANUP_SQL.strip().split(';'):
            stmt = stmt.strip()
            if stmt:
                try:
                    await conn.execute(stmt)
                    logger.info(f"Executado: {stmt[:80]}...")
                except Exception as e:
                    logger.warning(f"Erro ao executar (pode já não existir): {stmt[:80]}... - {e}")
    logger.info("Limpeza de tabelas legadas concluída.")


async def main():
    pool = await get_or_init_db_pool()
    if not pool:
        logger.error("Não foi possível conectar ao banco Supabase.")
        return
    await cleanup(pool)


if __name__ == "__main__":
    asyncio.run(main())