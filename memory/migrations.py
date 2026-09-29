"""Migração e sincronização de tabelas de memória e pgvector no Supabase."""

import asyncio
import logging
import os
import sqlite3
import asyncpg
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("charlie.memory.migration")

load_dotenv()


MIGRATION_SQL = """
-- 1. Habilita pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabela de Memórias de Longo Prazo (Fatos, Reflexões, Notas)
CREATE TABLE IF NOT EXISTS "UserMemory" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'fact',
    embedding vector(768),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Índice HNSW para busca semântica ultrarrápida
CREATE INDEX IF NOT EXISTS "idx_user_memory_embedding" 
ON "UserMemory" USING hnsw (embedding vector_cosine_ops);

-- Índice de usuário
CREATE INDEX IF NOT EXISTS "idx_user_memory_user_id" 
ON "UserMemory" (user_id);

-- 3. Tabela de Preferências Chave-Valor
CREATE TABLE IF NOT EXISTS "UserPreference" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL DEFAULT 'default',
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uq_user_preference_key" UNIQUE (user_id, key)
);

-- 4. Função RPC para busca semântica por similaridade de cosseno
CREATE OR REPLACE FUNCTION match_memories(
    query_embedding vector(768),
    match_threshold float DEFAULT 0.3,
    match_count int DEFAULT 5,
    p_user_id text DEFAULT 'default'
)
RETURNS TABLE (
    id uuid,
    content text,
    category text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.content,
        m.category,
        (1 - (m.embedding <=> query_embedding))::float AS similarity
    FROM "UserMemory" m
    WHERE m.user_id = p_user_id
      AND m.embedding IS NOT NULL
      AND (1 - (m.embedding <=> query_embedding)) > match_threshold
    ORDER BY m.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
"""


async def run_migrations():
    url = os.getenv("DATABASE_URL", "").replace("postgresql+asyncpg://", "postgresql://", 1)
    if not url:
        raise ValueError("DATABASE_URL não configurada no .env")

    logger.info("Executando migrações de memória no Supabase...")
    conn = await asyncpg.connect(url)

    try:
        await conn.execute(MIGRATION_SQL)
        logger.info("Tabelas 'UserMemory', 'UserPreference', índices HNSW e função RPC criados com sucesso!")

        # Migração de dados legados do SQLite (se houver)
        sqlite_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "charlie_memory.db")
        if os.path.exists(sqlite_path):
            logger.info("Migrando dados existentes do SQLite local para o Supabase...")
            sq_conn = sqlite3.connect(sqlite_path)
            sq_cursor = sq_conn.cursor()

            # Migra preferências
            try:
                sq_cursor.execute("SELECT key, value FROM preferences")
                prefs = sq_cursor.fetchall()
                for key, val in prefs:
                    await conn.execute("""
                        INSERT INTO "UserPreference" (user_id, key, value)
                        VALUES ('default', $1, $2)
                        ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value
                    """, key, val)
                logger.info(f"{len(prefs)} preferência(s) migrada(s).")
            except Exception as e:
                logger.warning(f"Aviso ao migrar preferências do SQLite: {e}")

            # Migra fatos
            try:
                sq_cursor.execute("SELECT fact FROM facts")
                facts = sq_cursor.fetchall()
                for (fact_text,) in facts:
                    # Verifica se o fato já existe
                    exists = await conn.fetchrow(
                        'SELECT id FROM "UserMemory" WHERE user_id = $1 AND content = $2',
                        'default', fact_text
                    )
                    if not exists:
                        await conn.execute("""
                            INSERT INTO "UserMemory" (user_id, content, category)
                            VALUES ('default', $1, 'fact')
                        """, fact_text)
                logger.info(f"{len(facts)} fato(s) migrado(s).")
            except Exception as e:
                logger.warning(f"Aviso ao migrar fatos do SQLite: {e}")

            sq_conn.close()

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(run_migrations())
