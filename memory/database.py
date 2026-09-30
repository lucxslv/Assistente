"""Banco de Dados de Memória do Charlie integrado ao Supabase (PostgreSQL + pgvector)."""

import json
import logging
import os
from typing import Any, Dict, List, Optional
import psycopg
from dotenv import load_dotenv
from memory.embeddings import generate_embedding

logger = logging.getLogger("charlie.memory.db")
load_dotenv()


class MemoryDatabase:
    """Gerenciador de Memória Duradoura e RAG Semântico no Supabase."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_config()
        return cls._instance

    def _init_config(self):
        raw_url = os.getenv("DATABASE_URL", "")
        self.db_url = raw_url.replace("postgresql+asyncpg://", "postgresql://", 1)

    def _get_connection(self):
        return psycopg.connect(self.db_url, autocommit=True)

    # ================= Fatos & Memórias Vetoriais =================

    def add_fact(self, fact: str, user_id: str = "default") -> None:
        """Salva um fato gerando automaticamente seu embedding vetorial."""
        self.add_memory(content=fact, category="fact", user_id=user_id)

    def add_memory(self, content: str, category: str = "fact", user_id: str = "default") -> None:
        """Insere uma nova memória com vetor semântico no Supabase."""
        content = content.strip()
        if not content:
            return

        embedding = generate_embedding(content)
        vec_str = "[" + ",".join(map(str, embedding)) + "]" if embedding else None

        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    # Verifica duplicata exata
                    cur.execute(
                        'SELECT id FROM "UserMemory" WHERE user_id = %s AND content = %s',
                        (user_id, content),
                    )
                    if cur.fetchone():
                        logger.info("Memória já existente, ignorando inserção.")
                        return

                    cur.execute(
                        """
                        INSERT INTO "UserMemory" (user_id, content, category, embedding)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (user_id, content, category, vec_str),
                    )
                    logger.info("Nova memória salva com sucesso no Supabase: %s", content[:40])
        except Exception as e:
            logger.error("Erro ao salvar memória no Supabase: %s", e)

    def get_all_facts(self, user_id: str = "default") -> List[str]:
        """Retorna todos os fatos conhecidos do usuário."""
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        'SELECT content FROM "UserMemory" WHERE user_id = %s ORDER BY created_at ASC',
                        (user_id,),
                    )
                    return [row[0] for row in cur.fetchall()]
        except Exception as e:
            logger.error("Erro ao buscar fatos no Supabase: %s", e)
            return []

    def search_memories(
        self, query: str, limit: int = 5, threshold: float = 0.35, user_id: str = "default"
    ) -> List[Dict[str, Any]]:
        """Busca memórias semanticamente relevantes usando similaridade de cosseno (RAG)."""
        query_emb = generate_embedding(query)
        if not query_emb:
            return []

        vec_str = "[" + ",".join(map(str, query_emb)) + "]"

        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT id, content, category, similarity
                        FROM match_memories(%s::vector, %s, %s, %s)
                        """,
                        (vec_str, threshold, limit, user_id),
                    )
                    rows = cur.fetchall()
                    return [
                        {
                            "id": str(r[0]),
                            "content": r[1],
                            "category": r[2],
                            "similarity": float(r[3]),
                        }
                        for r in rows
                    ]
        except Exception as e:
            logger.error("Erro ao realizar busca semântica no Supabase: %s", e)
            return []

    # ================= Preferências Chave-Valor =================

    def set_preference(self, key: str, value: str, user_id: str = "default") -> None:
        """Salva ou atualiza uma preferência do usuário."""
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO "UserPreference" (user_id, key, value, updated_at)
                        VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
                        ON CONFLICT (user_id, key) DO UPDATE 
                        SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
                        """,
                        (user_id, key, value),
                    )
                    logger.info("Preferência atualizada: %s = %s", key, value)
        except Exception as e:
            logger.error("Erro ao salvar preferência no Supabase: %s", e)

    def get_all_preferences(self, user_id: str = "default") -> Dict[str, str]:
        """Retorna todas as preferências salvas do usuário."""
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        'SELECT key, value FROM "UserPreference" WHERE user_id = %s',
                        (user_id,),
                    )
                    return {row[0]: row[1] for row in cur.fetchall()}
        except Exception as e:
            logger.error("Erro ao buscar preferências no Supabase: %s", e)
            return {}

    def clear_all_memories(self, user_id: str = "default") -> None:
        """Limpa todos os fatos e preferências do usuário."""
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute('DELETE FROM "UserMemory" WHERE user_id = %s', (user_id,))
                    cur.execute('DELETE FROM "UserPreference" WHERE user_id = %s', (user_id,))
                    logger.info("Memórias limpas com sucesso no Supabase para user_id: %s", user_id)
        except Exception as e:
            logger.error("Erro ao limpar memórias no Supabase: %s", e)


# Instância global compartilhada
db = MemoryDatabase()
