"""Restaura colunas user_id em UserMemory, UserPreference e userId em Thread (necessárias pelo código da main)."""

import asyncio
import logging
from api.db import get_or_init_db_pool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("charlie.restore_columns")

RESTORE_SQL = """
-- Restaura coluna user_id em UserMemory
ALTER TABLE public."UserMemory" ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Restaura coluna user_id em UserPreference  
ALTER TABLE public."UserPreference" ADD COLUMN IF NOT EXISTS user_id TEXT;

-- Restaura coluna userId em Thread
ALTER TABLE "Thread" ADD COLUMN IF NOT EXISTS "userId" UUID;

-- Recria índices para performance
CREATE INDEX IF NOT EXISTS idx_usermemory_user_id ON public."UserMemory"(user_id);
CREATE INDEX IF NOT EXISTS idx_userpreference_user_id ON public."UserPreference"(user_id);
CREATE INDEX IF NOT EXISTS idx_thread_user_id ON "Thread"("userId");
"""

async def restore(pool) -> None:
    """Restaura as colunas que foram removidas pelo cleanup."""
    async with pool.acquire() as conn:
        for stmt in RESTORE_SQL.strip().split(';'):
            stmt = stmt.strip()
            if stmt:
                try:
                    await conn.execute(stmt)
                    logger.info(f"Executado: {stmt[:80]}...")
                except Exception as e:
                    logger.warning(f"Erro ao executar (pode já existir): {stmt[:80]}... - {e}")
    logger.info("Restauração de colunas concluída.")


async def main():
    pool = await get_or_init_db_pool()
    if not pool:
        logger.error("Não foi possível conectar ao banco Supabase.")
        return
    await restore(pool)


if __name__ == "__main__":
    asyncio.run(main())
