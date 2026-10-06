"""Gerenciador do pool de banco de dados (Supabase / PostgreSQL)."""

import logging
from typing import Optional
import asyncpg
from config import config

logger = logging.getLogger("charlie.api.db")

_pool: Optional[asyncpg.Pool] = None
_last_db_error: Optional[str] = None


def get_normalized_db_url() -> str:
    """Retorna a URL do banco ajustada para o Connection Pooler IPv4 oficial do Supabase.
    
    Evita falhas de IPv6 no ambiente serverless da Vercel ([Errno 99] Cannot assign requested address).
    """
    import os
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
    global _pool, _last_db_error
    if _pool is None or getattr(_pool, "_closed", False):
        db_url = get_normalized_db_url()
        if not db_url:
            _last_db_error = "DATABASE_URL ausente no ambiente da Vercel."
            logger.warning(_last_db_error)
            return None

        try:
            _pool = await asyncpg.create_pool(
                db_url,
                min_size=2,
                max_size=10,
                command_timeout=20,
                timeout=10,
                max_inactive_connection_lifetime=60.0,
                statement_cache_size=0,
            )
            _last_db_error = None
            logger.info("Pool de conexões Supabase estabelecido com sucesso (min=2, max=10, timeout=20s).")

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
                            last_heartbeat DOUBLE PRECISION NOT NULL,
                            telemetry JSONB NOT NULL,
                            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                        );
                        CREATE TABLE IF NOT EXISTS device_pending_commands (
                            id TEXT PRIMARY KEY,
                            action TEXT NOT NULL,
                            level INTEGER,
                            key TEXT,
                            target TEXT,
                            command TEXT,
                            params JSONB,
                            executed BOOLEAN DEFAULT FALSE,
                            created_at DOUBLE PRECISION NOT NULL
                        );
                        CREATE INDEX IF NOT EXISTS idx_device_cmd_pending ON device_pending_commands(executed, created_at);

                        CREATE TABLE IF NOT EXISTS device_pairing_sessions (
                            pairing_id TEXT PRIMARY KEY,
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
                        CREATE INDEX IF NOT EXISTS idx_device_pairing_pin ON device_pairing_sessions(pin);

                        CREATE TABLE IF NOT EXISTS device_authorized_devices (
                            device_id TEXT PRIMARY KEY,
                            device_name TEXT NOT NULL,
                            platform TEXT,
                            token TEXT UNIQUE NOT NULL,
                            paired_at DOUBLE PRECISION NOT NULL,
                            last_seen DOUBLE PRECISION NOT NULL,
                            permissions JSONB
                        );
                        CREATE INDEX IF NOT EXISTS idx_device_auth_token ON device_authorized_devices(token);
                    """)
            except Exception as dev_err:
                logger.warning(f"Aviso ao inicializar schema de device e pairing: {dev_err}")

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
