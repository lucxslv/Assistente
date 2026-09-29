"""Gerenciador do pool de banco de dados (Supabase / PostgreSQL)."""

import logging
from typing import Optional
import asyncpg
from config import config

logger = logging.getLogger("charlie.api.db")

_pool: Optional[asyncpg.Pool] = None


async def init_db_pool() -> Optional[asyncpg.Pool]:
    global _pool
    if _pool is None:
        db_url = config.database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
        if not db_url or "postgres" not in db_url:
            logger.warning("DATABASE_URL ausente ou inválida.")
            return None
        try:
            _pool = await asyncpg.create_pool(db_url, min_size=1, max_size=5)
            logger.info("Pool de conexões Supabase estabelecido com sucesso.")
        except Exception as e:
            logger.error(f"Falha ao conectar no Supabase: {e}")
            return None
    return _pool


async def get_or_init_db_pool() -> Optional[asyncpg.Pool]:
    global _pool
    if _pool is None or getattr(_pool, "_closed", False):
        return await init_db_pool()
    return _pool


async def close_db_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("Pool de conexões Supabase encerrado.")


def get_db_pool() -> Optional[asyncpg.Pool]:
    return _pool
