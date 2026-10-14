"""Gerenciador do pool de banco de dados (Supabase / PostgreSQL)."""

import asyncio
import logging
import os
from typing import Optional
import asyncpg
from config import config

logger = logging.getLogger("charlie.api.db")

_pool: Optional[asyncpg.Pool] = None
_pool_loop: Optional[asyncio.AbstractEventLoop] = None
_schema_initialized: bool = False
_last_db_error: Optional[str] = None


def get_normalized_db_url() -> str:
    """Retorna a URL do banco ajustada para o Connection Pooler IPv4 oficial do Supabase.
    
    Evita falhas de IPv6 no ambiente serverless da Vercel ([Errno 99] Cannot assign requested address).
    """
    import urllib.parse
    db_url = os.getenv("DATABASE_URL", getattr(config, "database_url", ""))
    db_url = db_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    if not db_url or "postgres" not in db_url:
        return ""

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

    return db_url


async def init_db_pool() -> Optional[asyncpg.Pool]:
    global _pool, _pool_loop, _schema_initialized, _last_db_error
    if os.getenv("PYTEST_CURRENT_TEST") and os.getenv("CHARLIE_TEST_LIVE_DB") != "1":
        return _pool

    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if _pool is not None and (_pool_loop is not current_loop or getattr(_pool, "_closed", False)):
        _pool = None

    if _pool is None:
        db_url = get_normalized_db_url()
        if not db_url:
            _last_db_error = "DATABASE_URL ausente no ambiente da Vercel."
            logger.warning(_last_db_error)
            return None

        try:
            _pool = await asyncpg.create_pool(
                db_url,
                min_size=1,
                max_size=10,
                command_timeout=20,
                timeout=10,
                max_inactive_connection_lifetime=60.0,
                statement_cache_size=0,
            )
            _pool_loop = current_loop
            _last_db_error = None
            logger.info("Pool de conexões Supabase estabelecido com sucesso (min=1, max=10, timeout=20s).")

            if not _schema_initialized:
                # Inicializa schema de auditoria e telemetria de custos de forma assíncrona
                try:
                    from api.services.audit_service import ensure_audit_schema
                    await ensure_audit_schema(_pool)
                except Exception as schema_err:
                    logger.warning(f"Aviso ao inicializar audit_chat_logs: {schema_err}")

                # Inicializa schema de persistência de chat e memórias de forma assíncrona
                try:
                    from api.services.chat_persistence import ensure_chat_persistence_schema
                    await ensure_chat_persistence_schema(_pool)
                except Exception as persist_err:
                    logger.warning(f"Aviso ao inicializar schema de persistência: {persist_err}")

                # Inicializa schema de presença de dispositivos e comandos em nuvem
                try:
                    async with _pool.acquire() as conn:
                        await conn.execute("""
                        CREATE TABLE IF NOT EXISTS device_host_state (
                            device_name TEXT PRIMARY KEY,
                            user_id TEXT DEFAULT 'default',
                            last_heartbeat DOUBLE PRECISION NOT NULL,
                            telemetry JSONB NOT NULL,
                            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                        );
                        ALTER TABLE device_host_state ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default';

                        CREATE TABLE IF NOT EXISTS device_pending_commands (
                            id TEXT PRIMARY KEY,
                            user_id TEXT DEFAULT 'default',
                            action TEXT NOT NULL,
                            level INTEGER,
                            key TEXT,
                            target TEXT,
                            command TEXT,
                            params JSONB,
                            executed BOOLEAN DEFAULT FALSE,
                            created_at DOUBLE PRECISION NOT NULL
                        );
                        ALTER TABLE device_pending_commands ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default';
                        CREATE INDEX IF NOT EXISTS idx_device_cmd_pending ON device_pending_commands(executed, created_at);
                        CREATE INDEX IF NOT EXISTS idx_device_cmd_user_pending ON device_pending_commands(user_id, executed, created_at);

                        CREATE TABLE IF NOT EXISTS device_pairing_sessions (
                            pairing_id TEXT PRIMARY KEY,
                            user_id TEXT DEFAULT 'default',
                            pin TEXT NOT NULL,
                            secret TEXT NOT NULL,
                            lan_url TEXT,
                            tunnel_url TEXT,
                            name TEXT,
                            expires_at DOUBLE PRECISION NOT NULL,
                            attempts INTEGER DEFAULT 0,
                            paired BOOLEAN DEFAULT FALSE,
                            paired_at DOUBLE PRECISION,
                            device_info JSONB,
                            device_token TEXT
                        );
                        ALTER TABLE device_pairing_sessions ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default';
                        CREATE INDEX IF NOT EXISTS idx_device_pairing_pin ON device_pairing_sessions(pin);

                        CREATE TABLE IF NOT EXISTS device_authorized_devices (
                            device_id TEXT PRIMARY KEY,
                            user_id TEXT DEFAULT 'default',
                            device_name TEXT NOT NULL,
                            platform TEXT,
                            token TEXT UNIQUE NOT NULL,
                            paired_at DOUBLE PRECISION NOT NULL,
                            last_seen DOUBLE PRECISION NOT NULL,
                            permissions JSONB
                        );
                        ALTER TABLE device_authorized_devices ADD COLUMN IF NOT EXISTS user_id TEXT DEFAULT 'default';
                        CREATE INDEX IF NOT EXISTS idx_device_auth_token ON device_authorized_devices(token);

                        CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
                            bucket_key TEXT PRIMARY KEY,
                            count INT NOT NULL DEFAULT 1,
                            window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                            expires_at TIMESTAMPTZ NOT NULL
                        );

                        CREATE TABLE IF NOT EXISTS public.user_profiles (
                            user_id TEXT PRIMARY KEY,
                            email TEXT,
                            first_name TEXT,
                            last_name TEXT,
                            display_name TEXT,
                            username TEXT,
                            avatar_url TEXT,
                            banner_url TEXT,
                            website TEXT,
                            bio TEXT,
                            role TEXT NOT NULL DEFAULT 'user',
                            is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
                            suspended_at TIMESTAMPTZ,
                            suspended_reason TEXT,
                            token_version INT NOT NULL DEFAULT 1,
                            password_hash TEXT,
                            created_at TIMESTAMPTZ DEFAULT NOW(),
                            updated_at TIMESTAMPTZ DEFAULT NOW()
                        );
                        CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(LOWER(email));
                        CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON public.user_profiles(LOWER(username));

                        CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
                            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                            user_id TEXT NOT NULL,
                            email TEXT NOT NULL,
                            token_hash TEXT UNIQUE NOT NULL,
                            expires_at TIMESTAMPTZ NOT NULL,
                            used_at TIMESTAMPTZ,
                            request_ip TEXT,
                            created_at TIMESTAMPTZ DEFAULT NOW()
                        );
                        CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash ON public.password_reset_tokens(token_hash);

                        CREATE TABLE IF NOT EXISTS public.user_quotas (
                            user_id TEXT PRIMARY KEY,
                            daily_token_limit INT DEFAULT 250000,
                            daily_request_limit INT DEFAULT 300,
                            monthly_cost_limit_usd NUMERIC(10,6) DEFAULT 10.00,
                            updated_at TIMESTAMPTZ DEFAULT NOW()
                        );
                    """)
                    _schema_initialized = True
                except Exception as dev_err:
                    logger.warning(f"Aviso ao inicializar schema de device e pairing: {dev_err}")

        except Exception as e:
            _last_db_error = f"{type(e).__name__}: {str(e)}"
            logger.error(f"Falha ao conectar no Supabase: {e}")
            return None
    return _pool


async def get_or_init_db_pool() -> Optional[asyncpg.Pool]:
    global _pool, _pool_loop
    if os.getenv("PYTEST_CURRENT_TEST") and os.getenv("CHARLIE_TEST_LIVE_DB") != "1":
        return _pool
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None
    if _pool is None or _pool_loop is not current_loop or getattr(_pool, "_closed", False):
        return await init_db_pool()
    return _pool


async def close_db_pool():
    global _pool, _pool_loop
    if _pool:
        try:
            await _pool.close()
        except Exception:
            pass
        _pool = None
        _pool_loop = None
        logger.info("Pool de conexões Supabase encerrado.")


def get_db_pool() -> Optional[asyncpg.Pool]:
    if os.getenv("PYTEST_CURRENT_TEST") and os.getenv("CHARLIE_TEST_LIVE_DB") != "1":
        return _pool
    return _pool


def get_last_db_error() -> Optional[str]:
    return _last_db_error

