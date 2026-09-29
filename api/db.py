"""Gerenciador do pool de banco de dados (Supabase / PostgreSQL)."""

import logging
from typing import Optional
import asyncpg
from config import config

logger = logging.getLogger("charlie.api.db")

_pool: Optional[asyncpg.Pool] = None
_last_db_error: Optional[str] = None


async def init_db_pool() -> Optional[asyncpg.Pool]:
    global _pool, _last_db_error
    if _pool is None or getattr(_pool, "_closed", False):
        import os
        import urllib.parse
        db_url = os.getenv("DATABASE_URL", config.database_url)
        db_url = db_url.replace("postgresql+asyncpg://", "postgresql://", 1)
        if not db_url or "postgres" not in db_url:
            _last_db_error = "DATABASE_URL ausente no ambiente da Vercel."
            logger.warning(_last_db_error)
            return None

        # Conexões diretas db.<ref>.supabase.co são IPv6-only e falham na Vercel/Lambda com [Errno 99].
        # Convertemos automaticamente para o Connection Pooler IPv4 oficial:
        if ".supabase.co" in db_url and "pooler.supabase.com" not in db_url:
            try:
                parsed = urllib.parse.urlsplit(db_url)
                if parsed.hostname and parsed.hostname.startswith("db."):
                    ref = parsed.hostname.split(".")[1]
                    user = parsed.username or "postgres"
                    pooler_user = user if f".{ref}" in user else f"{user}.{ref}"
                    db_url = f"postgresql://{pooler_user}:{parsed.password or ''}@aws-0-us-east-1.pooler.supabase.com:6543{parsed.path or '/postgres'}"
                    logger.info("DATABASE_URL ajustada automaticamente para Supabase Pooler IPv4.")
            except Exception as e:
                logger.warning(f"Não foi possível converter URL para pooler: {e}")

        try:
            _pool = await asyncpg.create_pool(
                db_url,
                min_size=1,
                max_size=3,
                command_timeout=15,
                timeout=10,
                statement_cache_size=0,
            )
            _last_db_error = None
            logger.info("Pool de conexões Supabase estabelecido com sucesso.")
        except Exception as e:
            _last_db_error = f"{type(e).__name__}: {str(e)}"
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


def get_last_db_error() -> Optional[str]:
    return _last_db_error
