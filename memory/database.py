"""Banco de Dados de Memória do Charlie integrado ao Supabase (PostgreSQL + pgvector).

Suporta Memória Semântica (fatos, preferências, regras), Memória Episódica (marcos e acontecimentos),
pesquisa vetorial com ordenação por relevância + importância, desduplicação e reforço contínuo.
"""

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
    """Gerenciador de Memória Duradoura, RAG Semântico e Memória Episódica no Supabase."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_config()
        return cls._instance

    def _init_config(self):
        from api.db import get_normalized_db_url
        self.db_url = get_normalized_db_url()

    def _get_connection(self):
        return psycopg.connect(self.db_url, autocommit=True)

    # ================= Pipeline de Armazenamento, Desduplicação e Reforço =================

    def add_or_reinforce_memory(
        self,
        content: str,
        memory_type: str = "semantic_fact",
        importance: float = 0.5,
        confidence: float = 0.8,
        user_id: str = "default",
        metadata: Optional[Dict[str, Any]] = None,
        action: str = "reinforce",
    ) -> Dict[str, Any]:
        """Insere uma memória ou reforça uma similaridade existente (> 0.82) para evitar duplicatas."""
        content = content.strip()
        if not content:
            return {"action": "ignored", "reason": "empty_content"}

        meta = metadata or {}
        embedding = generate_embedding(content)
        vec_str = "[" + ",".join(map(str, embedding)) + "]" if embedding else None

        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    # 1. Verifica se já existe uma memória semanticamente idêntica ou muito próxima
                    if embedding:
                        cur.execute(
                            """
                            SELECT id, content, confidence, importance, metadata
                            FROM match_memories(%s::vector, 0.82, 1, %s)
                            """,
                            (vec_str, user_id),
                        )
                        similar = cur.fetchone()
                        if similar:
                            sim_id, sim_content, old_conf, old_imp, sim_meta = similar
                            is_contradiction = (
                                action == "supersede"
                                or any(w in content.lower() for w in ["em vez de", "não prefere mais", "parou de usar", "mudou para", "agora prefere"])
                            )

                            if is_contradiction:
                                # Substitui memória antiga em caso de contradição ou evolução de preferência
                                cur.execute(
                                    """
                                    UPDATE "UserMemory"
                                    SET content = %s,
                                        confidence = %s,
                                        importance = %s,
                                        metadata = %s,
                                        last_confirmed_at = NOW(),
                                        updated_at = NOW()
                                    WHERE id = %s
                                    """,
                                    (content, confidence, importance, json.dumps({**(sim_meta or {}), **meta, "superseded": True}), sim_id),
                                )
                                logger.info(
                                    f"[MemoryDB] Memória contraditória atualizada/superseded (ID={sim_id}): '{content[:40]}...'"
                                )
                                return {"action": "superseded", "id": str(sim_id)}

                            # Caso contrário, reforça memória existente aumentando confiança e renovando confirmação
                            new_conf = min(0.99, round(float(old_conf or 0.8) + 0.05, 3))
                            new_imp = max(float(old_imp or 0.5), round(importance, 3))
                            
                            updated_content = content if len(content) > len(sim_content) else sim_content
                            merged_meta = {**(sim_meta or {}), **meta, "reinforcement_count": (sim_meta or {}).get("reinforcement_count", 0) + 1}

                            cur.execute(
                                """
                                UPDATE "UserMemory"
                                SET content = %s,
                                    confidence = %s,
                                    importance = %s,
                                    metadata = %s,
                                    last_confirmed_at = NOW(),
                                    updated_at = NOW()
                                WHERE id = %s
                                """,
                                (updated_content, new_conf, new_imp, json.dumps(merged_meta), sim_id),
                            )
                            logger.info(
                                f"[MemoryDB] Memória reforçada (ID={sim_id}): conf={new_conf}, imp={new_imp} -> '{updated_content[:40]}...'"
                            )
                            return {"action": "reinforced", "id": str(sim_id), "confidence": new_conf}

                    # 2. Se não encontrou similar, insere como nova memória
                    cur.execute(
                        """
                        INSERT INTO "UserMemory" (
                            user_id, content, category, memory_type,
                            confidence, importance, metadata, embedding,
                            last_confirmed_at, created_at, updated_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), NOW())
                        RETURNING id
                        """,
                        (
                            user_id,
                            content,
                            memory_type.split("_")[0] if "_" in memory_type else "fact",
                            memory_type,
                            confidence,
                            importance,
                            json.dumps(meta),
                            vec_str,
                        ),
                    )
                    new_id = cur.fetchone()[0]
                    logger.info(f"[MemoryDB] Nova memória criada ({memory_type}): '{content[:40]}...' (ID={new_id})")
                    return {"action": "created", "id": str(new_id)}
        except Exception as e:
            logger.error(f"[MemoryDB] Erro ao salvar/reforçar memória: {e}")
            return {"action": "error", "error": str(e)}

    def add_fact(self, fact: str, user_id: str = "default") -> None:
        """Compatibilidade reversa: adiciona fato genérico."""
        self.add_or_reinforce_memory(
            content=fact,
            memory_type="semantic_fact",
            importance=0.6,
            confidence=0.85,
            user_id=user_id,
        )

    def add_memory(self, content: str, category: str = "fact", user_id: str = "default") -> None:
        """Compatibilidade reversa: adiciona memória por categoria."""
        m_type = "episodic_event" if category == "event" else f"semantic_{category}"
        self.add_or_reinforce_memory(
            content=content,
            memory_type=m_type,
            importance=0.65,
            confidence=0.85,
            user_id=user_id,
        )

    def get_all_facts(self, user_id: str = "default") -> List[str]:
        """Retorna todos os fatos conhecidos do usuário."""
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        'SELECT content FROM "UserMemory" WHERE user_id = %s ORDER BY importance DESC, created_at ASC',
                        (user_id,),
                    )
                    return [row[0] for row in cur.fetchall()]
        except Exception as e:
            logger.error("Erro ao buscar fatos no Supabase: %s", e)
            return []

    # ================= Busca Semântica & Recuperação com Score Ponderado =================

    def search_memories(
        self, query: str, limit: int = 6, threshold: float = 0.35, user_id: str = "default"
    ) -> List[Dict[str, Any]]:
        """Busca memórias semanticamente relevantes usando pgvector com balanceamento relevância + importância."""
        query_emb = generate_embedding(query)
        if not query_emb:
            return []

        vec_str = "[" + ",".join(map(str, query_emb)) + "]"

        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT id, content, category, similarity, memory_type, confidence, importance, metadata, created_at
                        FROM match_memories(%s::vector, %s, %s, %s)
                        """,
                        (vec_str, threshold, limit, user_id),
                    )
                    rows = cur.fetchall()
                    results = []
                    matched_ids = []
                    for r in rows:
                        results.append(
                            {
                                "id": str(r[0]),
                                "content": r[1],
                                "category": r[2],
                                "similarity": float(r[3]),
                                "memory_type": r[4] or "semantic_fact",
                                "confidence": float(r[5] or 0.8),
                                "importance": float(r[6] or 0.5),
                                "metadata": r[7] if isinstance(r[7], dict) else json.loads(r[7] or "{}"),
                                "created_at": r[8].isoformat() if hasattr(r[8], "isoformat") else str(r[8]),
                            }
                        )
                        matched_ids.append(r[0])

                    # Registra acesso (last_used_at)
                    if matched_ids:
                        cur.execute(
                            """
                            UPDATE "UserMemory"
                            SET last_used_at = NOW()
                            WHERE id = ANY(%s)
                            """,
                            (matched_ids,),
                        )

                    return results
        except Exception as e:
            logger.error(f"[MemoryDB] Erro ao realizar busca semântica no Supabase: {e}")
            return []

    # ================= Preferências Chave-Valor =================

    def set_preference(self, key: str, value: str, user_id: str = "default") -> None:
        """Salva ou atualiza uma preferência rápida do usuário."""
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
        """Limpa todos os fatos, preferências e modelo do usuário."""
        try:
            with self._get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute('DELETE FROM "UserMemory" WHERE user_id = %s', (user_id,))
                    cur.execute('DELETE FROM "UserPreference" WHERE user_id = %s', (user_id,))
                    cur.execute('DELETE FROM "UserModel" WHERE user_id = %s', (user_id,))
                    try:
                        from brain.personality.user_model import user_model_manager
                        user_model_manager.invalidate_user(user_id)
                    except Exception:
                        pass
                    logger.info("Memórias limpas com sucesso no Supabase para user_id: %s", user_id)
        except Exception as e:
            logger.error("Erro ao limpar memórias no Supabase: %s", e)


# Instância global compartilhada
db = MemoryDatabase()
