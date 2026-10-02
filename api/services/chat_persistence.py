"""Serviço de persistência real de conversas e retenção contínua de memória (chat_sessions, chat_messages, UserMemory, UserPreference)."""

import datetime
import json
import logging
import math
import uuid
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


async def ensure_chat_persistence_schema(pool: asyncpg.Pool) -> None:
    """Garante de forma idempotente que as tabelas de sessão, mensagens e memória estejam configuradas."""
    if not pool:
        return
    try:
        async with pool.acquire() as conn:
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
        async with pool.acquire() as conn:
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
        async with pool.acquire() as conn:
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
) -> str:
    """Salva um fato ou conhecimento duradouro sobre o usuário na tabela UserMemory."""
    if not pool or not fact or not fact.strip():
        return ""

    clean_fact = fact.strip()
    cat = (category or "general").strip()
    mem_id = uuid.uuid4()
    now = datetime.datetime.now(datetime.timezone.utc)

    vec_str = None
    try:
        from memory.embeddings import generate_embedding
        emb = generate_embedding(clean_fact)
        if emb:
            vec_str = "[" + ",".join(map(str, emb)) + "]"
    except Exception:
        pass

    try:
        async with pool.acquire() as conn:
            if vec_str:
                await conn.execute(
                    """
                    INSERT INTO public."UserMemory" (
                        id, user_id, content, fact, category, memory_type, confidence, importance, embedding, created_at, updated_at, last_confirmed_at
                    )
                    VALUES ($1, $2, $3, $3, $4, 'semantic_fact', 0.90, 0.70, $5::vector, $6, $6, $6)
                    """,
                    mem_id, str(user_id), clean_fact, cat, vec_str, now
                )
            else:
                await conn.execute(
                    """
                    INSERT INTO public."UserMemory" (
                        id, user_id, content, fact, category, memory_type, confidence, importance, created_at, updated_at, last_confirmed_at
                    )
                    VALUES ($1, $2, $3, $3, $4, 'semantic_fact', 0.90, 0.70, $5, $5, $5)
                    """,
                    mem_id, str(user_id), clean_fact, cat, now
                )
        logger.info(f"[chat_persistence] Fato gravado no UserMemory para {user_id}: '{clean_fact[:50]}'")
        return str(mem_id)
    except Exception as e:
        logger.error(f"[chat_persistence] Falha ao gravar UserMemory para {user_id}: {e}")
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
        async with pool.acquire() as conn:
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
    """Busca as memórias ativas mais recentes do usuário com isolamento estrito."""
    if not pool or not user_id:
        return []
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT content
                FROM public."UserMemory"
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT $2
                """,
                str(user_id), limit
            )
            return [r["content"] for r in rows if r["content"] and r["content"].strip()]
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
        async with pool.acquire() as conn:
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
        async with pool.acquire() as conn:
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
