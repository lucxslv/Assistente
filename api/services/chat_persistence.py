"""Serviço de persistência real de conversas e retenção contínua de memória (chat_sessions, chat_messages, UserMemory, UserPreference)."""

import datetime
import json
import logging
import math
import uuid
import re
from typing import Any, Dict, List, Optional
import asyncpg

logger = logging.getLogger("charlie.persistence")


def generate_session_title(prompt: Optional[str]) -> str:
    """Gera um título natural e conciso para a sessão a partir das primeiras palavras do prompt."""
    if not prompt or not prompt.strip():
        return "Nova Conversa"
    words = prompt.strip().split()
    if not words:
        return "Nova Conversa"
    title = " ".join(words[:6])
    if len(title) > 38:
        title = title[:38].rsplit(" ", 1)[0]
    return title.strip() or "Nova Conversa"


class _db_connection_scope:
    """Suporta tanto asyncpg.Pool quanto asyncpg.Connection transparente com context manager."""
    def __init__(self, target):
        self.target = target
        self.conn = None

    async def __aenter__(self):
        if hasattr(self.target, "acquire"):
            self.conn = await self.target.acquire()
            return self.conn
        return self.target

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.conn and hasattr(self.target, "release"):
            try:
                await self.target.release(self.conn)
            except Exception:
                pass


async def ensure_chat_persistence_schema(pool: asyncpg.Pool) -> None:
    """Garante de forma idempotente que as tabelas de sessão, mensagens e memória estejam configuradas."""
    if not pool:
        return
    try:
        async with _db_connection_scope(pool) as conn:
            # 1. Garante colunas de chat_sessions
            await conn.execute("""
                ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS user_id TEXT;
                ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
                CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON public.chat_sessions(user_id);
                CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON public.chat_sessions(updated_at DESC);
            """)

            # 2. Garante colunas de chat_messages
            await conn.execute("""
                ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS user_id TEXT;
                ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS model TEXT;
                ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS tokens INT;
                CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON public.chat_messages(user_id);
                CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages(session_id);
                CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at ASC);
            """)

            # 3. Garante colunas e índices de UserMemory e UserPreference
            await conn.execute("""
                ALTER TABLE public."UserMemory" ADD COLUMN IF NOT EXISTS fact TEXT;
                CREATE INDEX IF NOT EXISTS idx_usermemory_user_id_created ON public."UserMemory"(user_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_userpreference_user_id ON public."UserPreference"(user_id);
            """)
        logger.info("[chat_persistence] Schema de persistência validado com sucesso.")
    except Exception as e:
        logger.warning(f"[chat_persistence] Aviso ao validar schema de persistência: {e}")


async def ensure_session_record(
    pool: asyncpg.Pool,
    session_id: str,
    user_id: str,
    user_email: Optional[str] = None,
    prompt: Optional[str] = None,
) -> str:
    """Garante a existência da sessão em chat_sessions e sincroniza com a tabela Thread."""
    if not pool:
        return session_id

    try:
        s_uuid = uuid.UUID(session_id)
    except (ValueError, TypeError):
        s_uuid = uuid.uuid4()
        session_id = str(s_uuid)

    title = generate_session_title(prompt)
    now = datetime.datetime.now(datetime.timezone.utc)

    try:
        async with _db_connection_scope(pool) as conn:
            # 1. chat_sessions
            existing = await conn.fetchrow("SELECT id, title, user_id FROM public.chat_sessions WHERE id = $1", s_uuid)
            if not existing:
                await conn.execute(
                    """
                    INSERT INTO public.chat_sessions (id, title, user_id, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $4)
                    ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at
                    """,
                    s_uuid, title, str(user_id), now
                )
            else:
                if existing["title"] in ("Nova Conversa", "Novo Chat", "Conversa sem título", None, "") and prompt and prompt.strip():
                    await conn.execute(
                        "UPDATE public.chat_sessions SET title = $1, updated_at = $2, user_id = COALESCE(user_id, $3) WHERE id = $4",
                        title, now, str(user_id), s_uuid
                    )
                else:
                    await conn.execute(
                        "UPDATE public.chat_sessions SET updated_at = $1, user_id = COALESCE(user_id, $2) WHERE id = $3",
                        now, str(user_id), s_uuid
                    )

            # 2. Sincroniza Thread para manter total compatibilidade com UI do Web Chat e Desktop
            try:
                u_uuid = None
                try:
                    u_uuid = uuid.UUID(str(user_id))
                except (ValueError, TypeError):
                    pass

                thread_row = await conn.fetchrow('SELECT id, name, "userId" FROM "Thread" WHERE id = $1', s_uuid)
                if not thread_row:
                    await conn.execute(
                        """
                        INSERT INTO "Thread" (id, name, "createdAt", "updatedAt", "userId", "userIdentifier", metadata)
                        VALUES ($1, $2, $3, $3, $4, $5, '{}')
                        ON CONFLICT (id) DO UPDATE SET "updatedAt" = EXCLUDED."updatedAt"
                        """,
                        s_uuid, title, now, u_uuid, user_email
                    )
                else:
                    if thread_row["name"] in ("Nova Conversa", "Novo Chat", "Conversa sem título", None, "") and prompt and prompt.strip():
                        await conn.execute(
                            'UPDATE "Thread" SET name = $1, "updatedAt" = $2 WHERE id = $3',
                            title, now, s_uuid
                        )
                    else:
                        await conn.execute(
                            'UPDATE "Thread" SET "updatedAt" = $1 WHERE id = $2',
                            now, s_uuid
                        )
            except Exception as th_err:
                logger.debug("Aviso não-crítico ao sincronizar Thread: %s", th_err)

    except Exception as e:
        logger.error(f"[chat_persistence] Falha ao registrar sessão {session_id}: {e}")

    return session_id


async def save_chat_message_record(
    pool: asyncpg.Pool,
    session_id: str,
    user_id: str,
    role: str,
    content: str,
    model: Optional[str] = None,
    tokens: Optional[int] = None,
    tool_name: Optional[str] = None,
    tool_call_id: Optional[str] = None,
    tool_calls: Optional[dict] = None,
) -> Optional[str]:
    """Persiste a mensagem em chat_messages com tokens e modelo, sincronizando também com a tabela Step."""
    if not pool or not content or not content.strip():
        return None

    try:
        s_uuid = uuid.UUID(session_id)
    except (ValueError, TypeError):
        return None

    clean_content = content.strip()
    msg_id = uuid.uuid4()
    now = datetime.datetime.now(datetime.timezone.utc)

    if tokens is None or tokens <= 0:
        tokens = max(1, math.ceil(len(clean_content) / 3.8))

    jsonb_tool_calls = json.dumps(tool_calls) if tool_calls else None

    try:
        async with _db_connection_scope(pool) as conn:
            # Garante que a sessão exista para evitar violação de FK
            sess_exists = await conn.fetchval("SELECT 1 FROM public.chat_sessions WHERE id = $1", s_uuid)
            if not sess_exists:
                await conn.execute(
                    """
                    INSERT INTO public.chat_sessions (id, title, user_id, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $4)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    s_uuid, generate_session_title(clean_content), str(user_id), now
                )

            # 1. Gravação oficial em chat_messages
            await conn.execute(
                """
                INSERT INTO public.chat_messages (
                    id, session_id, user_id, role, content, model, tokens, tool_name, tool_call_id, tool_calls, created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                """,
                msg_id, s_uuid, str(user_id), role, clean_content, model, tokens, tool_name, tool_call_id, jsonb_tool_calls, now
            )

            # 2. Sincroniza Step para a UI do histórico da web e desktop
            try:
                step_name = "Usuário" if role == "user" else "Charlie"
                step_type = "user_message" if role == "user" else "assistant_message"
                await conn.execute(
                    """
                    INSERT INTO "Step" (id, "threadId", name, type, output, "createdAt")
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    msg_id, s_uuid, step_name, step_type, clean_content, now
                )
            except Exception as st_err:
                logger.debug("Aviso não-crítico ao sincronizar Step: %s", st_err)

        return str(msg_id)
    except Exception as e:
        logger.error(f"[chat_persistence] Falha ao persistir mensagem ({role}) na sessão {session_id}: {e}")
        return None


async def save_user_memory_entry(
    pool: asyncpg.Pool,
    user_id: str,
    fact: str,
    category: str = "general",
    importance: float = 0.85,
    confidence: float = 0.90,
) -> str:
    """Salva um fato ou conhecimento duradouro sobre o usuário na tabela UserMemory com deduplicação semântica e filtro estrito de relevância."""
    if not pool or not fact or not fact.strip():
        return ""

    clean_fact = fact.strip()
    cat = (category or "general").strip()
    now = datetime.datetime.now(datetime.timezone.utc)

    # Filtro de qualidade: descarta fatos que não atendem ao limiar mínimo de relevância
    if float(importance) < 0.70 or float(confidence) < 0.70:
        logger.debug(f"[chat_persistence] Descartando fato por baixa relevância ({importance}) ou certeza ({confidence}): '{clean_fact}'")
        return ""

    vec_str = None
    try:
        from memory.embeddings import generate_embedding
        emb = generate_embedding(clean_fact)
        if emb:
            vec_str = "[" + ",".join(map(str, emb)) + "]"
    except Exception:
        pass

    try:
        async with _db_connection_scope(pool) as conn:
            # 1. Verifica se já existe um fato idêntico ou muito similar para este usuário
            existing = None
            if vec_str:
                existing = await conn.fetchrow(
                    """
                    SELECT id, confidence, importance, metadata, content
                    FROM public."UserMemory"
                    WHERE user_id = $1 AND (
                        content ILIKE $2
                        OR fact ILIKE $2
                        OR (embedding IS NOT NULL AND embedding <=> $3::vector < 0.16)
                    )
                    ORDER BY (CASE WHEN content ILIKE $2 THEN 0 ELSE 1 END), updated_at DESC
                    LIMIT 1
                    """,
                    str(user_id), clean_fact, vec_str
                )
            else:
                existing = await conn.fetchrow(
                    """
                    SELECT id, confidence, importance, metadata, content
                    FROM public."UserMemory"
                    WHERE user_id = $1 AND (content ILIKE $2 OR fact ILIKE $2)
                    ORDER BY updated_at DESC
                    LIMIT 1
                    """,
                    str(user_id), clean_fact
                )

            if existing:
                # Reforça a memória existente aumentando confiança e contador em vez de criar duplicata
                sim_id = existing["id"]
                old_conf = existing["confidence"] or 0.85
                old_imp = existing["importance"] or 0.70
                new_conf = min(0.99, round(float(old_conf) + 0.05, 3))
                new_imp = max(float(old_imp), float(importance))

                sim_meta = {}
                try:
                    raw_meta = existing["metadata"]
                    if raw_meta:
                        sim_meta = json.loads(raw_meta) if isinstance(raw_meta, str) else dict(raw_meta)
                except Exception:
                    sim_meta = {}

                sim_meta["reinforcement_count"] = int(sim_meta.get("reinforcement_count", 0)) + 1

                # Mantém o texto mais detalhado
                best_text = clean_fact if len(clean_fact) >= len(existing["content"] or "") else existing["content"]

                await conn.execute(
                    """
                    UPDATE public."UserMemory"
                    SET confidence = $1,
                        importance = $2,
                        metadata = $3,
                        content = $4,
                        fact = $4,
                        updated_at = $5,
                        last_confirmed_at = $5
                    WHERE id = $6
                    """,
                    new_conf, new_imp, json.dumps(sim_meta), best_text, now, sim_id
                )
                logger.info(f"[chat_persistence] Memória reforçada (ID={sim_id}) para {user_id}: '{best_text[:50]}...' (conf={new_conf}, imp={new_imp})")
                return str(sim_id)

            # 2. Se for realmente nova e relevante, insere
            mem_id = uuid.uuid4()
            final_conf = min(0.99, float(confidence))
            final_imp = min(1.0, float(importance))

            if vec_str:
                await conn.execute(
                    """
                    INSERT INTO public."UserMemory" (
                        id, user_id, content, fact, category, memory_type, confidence, importance, embedding, metadata, created_at, updated_at, last_confirmed_at
                    )
                    VALUES ($1, $2, $3, $3, $4, 'semantic_fact', $5, $6, $7::vector, '{}', $8, $8, $8)
                    """,
                    mem_id, str(user_id), clean_fact, cat, final_conf, final_imp, vec_str, now
                )
            else:
                await conn.execute(
                    """
                    INSERT INTO public."UserMemory" (
                        id, user_id, content, fact, category, memory_type, confidence, importance, metadata, created_at, updated_at, last_confirmed_at
                    )
                    VALUES ($1, $2, $3, $3, $4, 'semantic_fact', $5, $6, '{}', $7, $7, $7)
                    """,
                    mem_id, str(user_id), clean_fact, cat, final_conf, final_imp, now
                )
            logger.info(f"[chat_persistence] Novo fato relevante gravado no UserMemory para {user_id}: '{clean_fact[:50]}' (imp={final_imp})")
            return str(mem_id)
    except Exception as e:
        logger.error(f"[chat_persistence] Falha ao gravar/reforçar UserMemory para {user_id}: {e}")
        return ""


async def save_user_preference_entry(
    pool: asyncpg.Pool,
    user_id: str,
    key: str,
    value: str,
) -> str:
    """Salva ou atualiza uma preferência do usuário na tabela UserPreference."""
    if not pool or not key or not value:
        return ""

    k = key.strip().lower().replace(" ", "_")
    v = value.strip()
    pref_id = uuid.uuid4()
    now = datetime.datetime.now(datetime.timezone.utc)

    try:
        async with _db_connection_scope(pool) as conn:
            await conn.execute(
                """
                INSERT INTO public."UserPreference" (id, user_id, key, value, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $5)
                ON CONFLICT (user_id, key) DO UPDATE
                SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
                """,
                pref_id, str(user_id), k, v, now
            )
        logger.info(f"[chat_persistence] Preferência salva no UserPreference para {user_id}: {k} = {v}")
        return str(pref_id)
    except Exception as e:
        logger.error(f"[chat_persistence] Falha ao salvar UserPreference para {user_id}: {e}")
        return ""


async def get_user_memory_facts(
    pool: asyncpg.Pool,
    user_id: str,
    limit: int = 15,
) -> list[str]:
    """Busca as memórias ativas do usuário com isolamento estrito e deduplicação semântica em memória."""
    if not pool or not user_id:
        return []
    try:
        async with _db_connection_scope(pool) as conn:
            rows = await conn.fetch(
                """
                SELECT COALESCE(fact, content) as content
                FROM public."UserMemory"
                WHERE user_id = $1
                ORDER BY importance DESC, updated_at DESC
                LIMIT $2
                """,
                str(user_id), limit * 3
            )
            seen = set()
            unique_facts = []
            for r in rows:
                c = (r["content"] or "").strip()
                if not c:
                    continue
                # Normaliza para evitar repetições com pontuação ou caixa ligeiramente diferente
                norm = " ".join(c.lower().rstrip(".").split())
                if norm not in seen:
                    seen.add(norm)
                    unique_facts.append(c)
                if len(unique_facts) >= limit:
                    break
            return unique_facts
    except Exception as e:
        logger.warning(f"[chat_persistence] Erro ao buscar UserMemory para {user_id}: {e}")
        return []


async def get_user_preferences_dict(
    pool: asyncpg.Pool,
    user_id: str,
) -> dict[str, str]:
    """Busca todas as preferências ativas do usuário com isolamento estrito."""
    if not pool or not user_id:
        return {}
    try:
        async with _db_connection_scope(pool) as conn:
            rows = await conn.fetch(
                """
                SELECT key, value
                FROM public."UserPreference"
                WHERE user_id = $1
                ORDER BY updated_at DESC
                """,
                str(user_id)
            )
            return {r["key"]: r["value"] for r in rows if r["key"] and r["value"]}
    except Exception as e:
        logger.warning(f"[chat_persistence] Erro ao buscar UserPreference para {user_id}: {e}")
        return {}


async def load_chat_history(
    pool: asyncpg.Pool,
    session_id: str,
    limit: int = 30,
) -> list[dict]:
    """Carrega o histórico real de mensagens a partir de chat_messages (com fallback para Step)."""
    if not pool or not session_id:
        return []

    try:
        s_uuid = uuid.UUID(session_id)
    except (ValueError, TypeError):
        return []

    try:
        async with _db_connection_scope(pool) as conn:
            # 1. Tenta carregar prioritariamente de chat_messages
            rows = await conn.fetch(
                """
                SELECT role, content
                FROM public.chat_messages
                WHERE session_id = $1 AND role IN ('user', 'assistant')
                ORDER BY created_at ASC
                """,
                s_uuid
            )
            if rows:
                history = []
                for r in rows:
                    c = (r["content"] or "").strip()
                    if c:
                        history.append({"role": r["role"], "content": c})
                if history:
                    return history[-limit:]

            # 2. Fallback para Step em caso de sessões antigas
            s_rows = await conn.fetch(
                """
                SELECT type, output
                FROM "Step"
                WHERE "threadId" = $1 AND type IN ('user_message', 'assistant_message')
                ORDER BY "createdAt" ASC
                """,
                s_uuid
            )
            history = []
            for r in s_rows:
                role = "user" if r["type"] == "user_message" else "assistant"
                c = (r["output"] or "").strip()
                if c:
                    history.append({"role": role, "content": c})
            return history[-limit:]
    except Exception as e:
        logger.warning(f"[chat_persistence] Erro ao carregar histórico da sessão {session_id}: {e}")
        return []


async def search_user_chat_history(
    pool: asyncpg.Pool,
    user_id: str,
    query: str,
    exclude_session_id: Optional[str] = None,
    limit: int = 5,
) -> list[dict]:
    """Busca mensagens e conversas passadas do usuário em outros chats.
    Filtra estritamente por user_id garantindo isolamento total multi-tenant.
    """
    if not pool or not user_id or not query or not query.strip():
        return []

    clean_q = query.strip()
    exc_uuid = None
    if exclude_session_id:
        try:
            exc_uuid = uuid.UUID(str(exclude_session_id))
        except (ValueError, TypeError):
            exc_uuid = None

    pattern = f"%{clean_q}%"
    try:
        async with _db_connection_scope(pool) as conn:
            # 1. Busca prioritária em chat_messages
            rows = await conn.fetch(
                """
                SELECT 
                    m.session_id,
                    COALESCE(s.title, 'Conversa anterior') as session_title,
                    m.role,
                    m.content,
                    m.created_at
                FROM public.chat_messages m
                LEFT JOIN public.chat_sessions s ON m.session_id = s.id
                WHERE (m.user_id = $1 OR s.user_id = $1)
                  AND ($2::uuid IS NULL OR m.session_id != $2::uuid)
                  AND (m.content ILIKE $3 OR s.title ILIKE $3)
                  AND m.role IN ('user', 'assistant')
                ORDER BY m.created_at DESC
                LIMIT $4
                """,
                str(user_id), exc_uuid, pattern, limit
            )

            # Se não encontrou por frase exata, tenta buscar por palavras-chave principais
            if not rows and len(clean_q.split()) > 1:
                keywords = [
                    w for w in re.findall(r'\b\w+\b', clean_q.lower()) 
                    if len(w) > 3 and w not in {"para", "como", "sobre", "qual", "quais", "outro", "outra", "chat", "conversa", "lembra", "falamos"}
                ]
                if keywords:
                    kw_patterns = [f"%{k}%" for k in keywords[:4]]
                    rows = await conn.fetch(
                        """
                        SELECT 
                            m.session_id,
                            COALESCE(s.title, 'Conversa anterior') as session_title,
                            m.role,
                            m.content,
                            m.created_at
                        FROM public.chat_messages m
                        LEFT JOIN public.chat_sessions s ON m.session_id = s.id
                        WHERE (m.user_id = $1 OR s.user_id = $1)
                          AND ($2::uuid IS NULL OR m.session_id != $2::uuid)
                          AND (m.content ILIKE ANY($3) OR s.title ILIKE ANY($3))
                          AND m.role IN ('user', 'assistant')
                        ORDER BY m.created_at DESC
                        LIMIT $4
                        """,
                        str(user_id), exc_uuid, kw_patterns, limit
                    )

            results = []
            for r in rows:
                c = (r["content"] or "").strip()
                if c:
                    dt_str = r["created_at"].strftime("%d/%m/%Y %H:%M") if r["created_at"] else ""
                    results.append({
                        "session_id": str(r["session_id"]),
                        "session_title": r["session_title"],
                        "role": r["role"],
                        "content": c,
                        "date": dt_str,
                    })

            # 2. Se necessário, complementa com Step/Thread legados
            if len(results) < limit:
                needed = limit - len(results)
                try:
                    s_rows = await conn.fetch(
                        """
                        SELECT 
                            st."threadId" as session_id,
                            COALESCE(th.name, 'Conversa Desktop') as session_title,
                            (CASE WHEN st.type = 'user_message' THEN 'user' ELSE 'assistant' END) as role,
                            st.output as content,
                            st."createdAt" as created_at
                        FROM "Step" st
                        JOIN "Thread" th ON st."threadId" = th.id
                        WHERE (th."userId"::text = $1 OR th."userIdentifier" = $1)
                          AND ($2::uuid IS NULL OR st."threadId" != $2::uuid)
                          AND (st.output ILIKE $3 OR th.name ILIKE $3)
                          AND st.type IN ('user_message', 'assistant_message')
                        ORDER BY st."createdAt" DESC
                        LIMIT $4
                        """,
                        str(user_id), exc_uuid, pattern, needed
                    )
                    for r in s_rows:
                        c = (r["content"] or "").strip()
                        if c:
                            dt_str = r["created_at"].strftime("%d/%m/%Y %H:%M") if r["created_at"] else ""
                            results.append({
                                "session_id": str(r["session_id"]),
                                "session_title": r["session_title"],
                                "role": r["role"],
                                "content": c,
                                "date": dt_str,
                            })
                except Exception as st_err:
                    logger.debug(f"[chat_persistence] Step/Thread query notice: {st_err}")

            return results
    except Exception as e:
        logger.warning(f"[chat_persistence] Erro ao buscar em chats anteriores para {user_id}: {e}")
        return []


async def get_chat_session_details(
    pool: asyncpg.Pool,
    user_id: str,
    session_id: Optional[str] = None,
    session_title: Optional[str] = None,
    limit: int = 15,
) -> dict:
    """Recupera mensagens de uma sessão/chat específico do usuário por ID ou por busca no título."""
    if not pool or not user_id:
        return {}

    target_sid = None
    target_title = None

    try:
        async with _db_connection_scope(pool) as conn:
            if session_id:
                try:
                    s_uuid = uuid.UUID(str(session_id).strip())
                    s_row = await conn.fetchrow(
                        "SELECT id, title, created_at FROM public.chat_sessions WHERE id = $1 AND user_id = $2",
                        s_uuid, str(user_id)
                    )
                    if s_row:
                        target_sid = s_row["id"]
                        target_title = s_row["title"]
                except (ValueError, TypeError):
                    pass

            if not target_sid and session_title and session_title.strip():
                t_pat = f"%{session_title.strip()}%"
                s_row = await conn.fetchrow(
                    """
                    SELECT id, title, created_at 
                    FROM public.chat_sessions 
                    WHERE user_id = $1 AND title ILIKE $2 
                    ORDER BY updated_at DESC LIMIT 1
                    """,
                    str(user_id), t_pat
                )
                if s_row:
                    target_sid = s_row["id"]
                    target_title = s_row["title"]

            if not target_sid:
                return {}

            # Carrega mensagens
            msgs = await load_chat_history(pool, str(target_sid), limit=limit)
            return {
                "session_id": str(target_sid),
                "title": target_title or "Conversa",
                "messages": msgs,
            }
    except Exception as e:
        logger.warning(f"[chat_persistence] Erro ao recuperar detalhes do chat {session_id}: {e}")
        return {}

