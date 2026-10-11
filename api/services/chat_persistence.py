"""Serviço de persistência real de conversas e retenção contínua de memória (chat_sessions, chat_messages, UserMemory, UserPreference)."""

import asyncio
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
    cleaned = prompt.strip().replace("\n", " ")
    words = cleaned.split()
    if not words:
        return "Nova Conversa"

    # Pega até 8 palavras mantendo limite de 46 caracteres
    title_words = words[:8]
    title = " ".join(title_words)
    if len(title) > 46:
        title = title[:46].rsplit(" ", 1)[0]

    # Remove preposições / conectivos soltos que ficaram no final da frase
    dangling_tokens = {
        "de", "do", "da", "dos", "das", "em", "no", "na", "nos", "nas",
        "para", "por", "com", "e", "ou", "a", "o", "as", "os", "que", "se"
    }
    parts = title.strip().split()
    while parts and parts[-1].lower().rstrip(".,;:?!") in dangling_tokens and len(parts) > 1:
        parts.pop()

    final_title = " ".join(parts).strip()
    return final_title or title.strip() or "Nova Conversa"


class _db_connection_scope:
    """Suporta tanto asyncpg.Pool quanto asyncpg.Connection transparente com context manager."""
    def __init__(self, target):
        self.target = target
        self.conn = None
        self._ctx = None

    async def __aenter__(self):
        if hasattr(self.target, "acquire"):
            acq = self.target.acquire()
            if hasattr(acq, "__aenter__"):
                self._ctx = acq
                self.conn = await self._ctx.__aenter__()
                return self.conn
            elif asyncio.iscoroutine(acq):
                self.conn = await acq
                return self.conn
            else:
                self.conn = acq
                return self.conn
        return self.target

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._ctx:
            await self._ctx.__aexit__(exc_type, exc_val, exc_tb)
        elif self.conn and hasattr(self.target, "release"):
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
                ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
                ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
                ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
                ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
                ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
                CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON public.chat_sessions(user_id);
                CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated_at ON public.chat_sessions(updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_pinned ON public.chat_sessions(user_id, is_pinned DESC, updated_at DESC);
            """)

            # 2. Garante colunas de chat_messages
            await conn.execute("""
                ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS user_id TEXT;
                ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS model TEXT;
                ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS tokens INT;
                ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';
                ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS request_id TEXT;
                ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS parent_message_id UUID;
                ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
                ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT FALSE;
                ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
                ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
                ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS error_detail TEXT;
                ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
                CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON public.chat_messages(user_id);
                CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages(session_id);
                CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(created_at ASC);
                CREATE INDEX IF NOT EXISTS idx_chat_messages_request_id ON public.chat_messages(request_id);
            """)

            # 3. Garante tabela message_feedback para avaliações 👍/👎
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS public.message_feedback (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    message_id TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    rating SMALLINT NOT NULL CHECK (rating IN (-1, 1)),
                    comment TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE (message_id, user_id)
                );
                CREATE INDEX IF NOT EXISTS idx_message_feedback_session ON public.message_feedback(session_id);
                CREATE INDEX IF NOT EXISTS idx_message_feedback_rating ON public.message_feedback(rating, created_at DESC);
            """)

            # 4. Garante colunas e índices de UserMemory e UserPreference
            await conn.execute("""
                ALTER TABLE public."UserMemory" ADD COLUMN IF NOT EXISTS fact TEXT;
                CREATE INDEX IF NOT EXISTS idx_usermemory_user_id_created ON public."UserMemory"(user_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_userpreference_user_id ON public."UserPreference"(user_id);
            """)
        logger.info("[chat_persistence] Schema de persistência validado com sucesso.")
    except Exception as e:
        logger.warning(f"[chat_persistence] Aviso ao validar schema de persistência: {e}")


# Armazenamento em memória sincronizado para operação offline e suítes de testes determinísticas
_in_memory_sessions: Dict[str, Dict[str, Any]] = {}  # session_id -> {id, title, user_id, user_email, is_pinned, is_archived, created_at, updated_at}
_in_memory_messages: Dict[str, List[Dict[str, Any]]] = {}  # session_id -> list of message dicts
_in_memory_feedback: Dict[str, Dict[str, Any]] = {}  # f"{message_id}:{user_id}" -> {message_id, session_id, user_id, rating, comment, updated_at}


def reset_in_memory_chat_store() -> None:
    """Limpa o armazenamento em memória de sessões, mensagens e feedbacks (útil para testes)."""
    _in_memory_sessions.clear()
    _in_memory_messages.clear()
    _in_memory_feedback.clear()


async def ensure_session_record(
    pool: Optional[asyncpg.Pool],
    session_id: str,
    user_id: str,
    user_email: Optional[str] = None,
    prompt: Optional[str] = None,
) -> str:
    """Garante a existência da sessão em chat_sessions e sincroniza com a tabela Thread com validação de titularidade."""
    try:
        s_uuid = uuid.UUID(session_id)
    except (ValueError, TypeError):
        s_uuid = uuid.uuid4()
        session_id = str(s_uuid)

    title = generate_session_title(prompt)
    now = datetime.datetime.now(datetime.timezone.utc)
    u_id_str = str(user_id)

    # Se não houver pool, verifica e atualiza titularidade em memória
    if not pool:
        mem_sess = _in_memory_sessions.get(session_id)
        if mem_sess:
            mem_owner = mem_sess.get("user_id")
            mem_email = mem_sess.get("user_email")
            if mem_owner and mem_owner != u_id_str and (not user_email or mem_owner != user_email) and (not mem_email or mem_email != user_email):
                raise PermissionError("Acesso negado: esta conversa pertence a outro usuário.")
            if mem_sess.get("title") in ("Nova Conversa", "Novo Chat", "Conversa sem título", None, "") and prompt and prompt.strip():
                mem_sess["title"] = title
            mem_sess["updated_at"] = now.isoformat()
        else:
            _in_memory_sessions[session_id] = {
                "id": session_id,
                "title": title,
                "user_id": u_id_str,
                "user_email": user_email,
                "is_pinned": False,
                "is_archived": False,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
            }
        return session_id

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
                    s_uuid, title, u_id_str, now
                )
            else:
                existing_user = existing["user_id"]
                if existing_user and existing_user != u_id_str and existing_user != user_email:
                    logger.warning(
                        f"[chat_persistence] Violação de titularidade: Usuário '{user_id}' tentou acessar sessão '{session_id}' pertencente a '{existing_user}'"
                    )
                    raise PermissionError("Acesso negado: esta conversa pertence a outro usuário.")

                if existing["title"] in ("Nova Conversa", "Novo Chat", "Conversa sem título", None, "") and prompt and prompt.strip():
                    await conn.execute(
                        "UPDATE public.chat_sessions SET title = $1, updated_at = $2, user_id = COALESCE(user_id, $3) WHERE id = $4 AND (user_id IS NULL OR user_id = $3)",
                        title, now, u_id_str, s_uuid
                    )
                else:
                    await conn.execute(
                        "UPDATE public.chat_sessions SET updated_at = $1, user_id = COALESCE(user_id, $2) WHERE id = $3 AND (user_id IS NULL OR user_id = $2)",
                        now, u_id_str, s_uuid
                    )

            # Sincroniza espelho em memória após validação no banco
            _in_memory_sessions[session_id] = {
                "id": session_id,
                "title": title,
                "user_id": u_id_str,
                "user_email": user_email,
                "is_pinned": False,
                "is_archived": False,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
            }

            # 2. Sincroniza Thread para manter total compatibilidade com UI do Web Chat e Desktop
            try:
                u_uuid = None
                try:
                    u_uuid = uuid.UUID(u_id_str)
                except (ValueError, TypeError):
                    pass

                thread_row = await conn.fetchrow('SELECT id, name, "userId", "userIdentifier" FROM "Thread" WHERE id = $1', s_uuid)
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
                    t_uid = str(thread_row.get("userId") or "").strip()
                    t_uident = str(thread_row.get("userIdentifier") or "").strip()
                    uid_mismatch = bool(t_uid and t_uid != u_id_str and (not u_uuid or t_uid != str(u_uuid)))
                    uident_mismatch = bool(t_uident and t_uident != (user_email or "") and t_uident != u_id_str)
                    # Se qualquer identificador de proprietário estiver preenchido e pertencer a outro usuário, bloqueia!
                    if (t_uid and uid_mismatch and (not t_uident or uident_mismatch)) or (not t_uid and t_uident and uident_mismatch):
                        logger.warning(
                            f"[chat_persistence] Violação de titularidade em Thread: req={user_id}, owner={t_uid}/{t_uident}"
                        )
                        raise PermissionError("Acesso negado: esta conversa pertence a outro usuário.")

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
            except PermissionError:
                raise
            except Exception as th_err:
                logger.debug("Aviso não-crítico ao sincronizar Thread: %s", th_err)

    except PermissionError:
        raise
    except Exception as e:
        logger.error(f"[chat_persistence] Falha ao registrar sessão {session_id}: {e}")

    return session_id


async def save_chat_message_record(
    pool: Optional[asyncpg.Pool],
    session_id: str,
    user_id: str,
    role: str,
    content: str,
    model: Optional[str] = None,
    tokens: Optional[int] = None,
    tool_name: Optional[str] = None,
    tool_call_id: Optional[str] = None,
    tool_calls: Optional[dict] = None,
    status: str = "completed",
    request_id: Optional[str] = None,
    parent_message_id: Optional[str] = None,
    version: int = 1,
    is_edited: bool = False,
    attachments: Optional[List[Dict[str, Any]]] = None,
    error_detail: Optional[str] = None,
    message_id: Optional[str] = None,
) -> Optional[str]:
    """Persiste a mensagem em chat_messages com máquina de estados, idempotência por request_id e anexos."""
    clean_content = (content or "").strip()
    has_attachments = bool(attachments and len(attachments) > 0)
    if not clean_content and status != "in_progress" and not has_attachments:
        return None

    try:
        s_uuid = uuid.UUID(session_id)
    except (ValueError, TypeError):
        return None

    u_id_str = str(user_id)
    now = datetime.datetime.now(datetime.timezone.utc)
    now_iso = now.isoformat()
    safe_attachments = attachments if isinstance(attachments, list) else []

    if tokens is None or tokens <= 0:
        tokens = max(1, math.ceil(len(clean_content) / 3.8)) if clean_content else 0

    # 1. Deduplicação em memória por (session_id, role, request_id) ou message_id
    sess_msgs = _in_memory_messages.setdefault(session_id, [])
    existing_mem = None
    if message_id:
        for m in sess_msgs:
            if m["id"] == str(message_id):
                existing_mem = m
                break
    if not existing_mem and request_id:
        for m in sess_msgs:
            if m.get("request_id") == request_id and m.get("role") == role:
                existing_mem = m
                break

    if existing_mem:
        msg_uuid_str = existing_mem["id"]
        try:
            msg_id = uuid.UUID(msg_uuid_str)
        except (ValueError, TypeError):
            msg_id = uuid.uuid4()
            msg_uuid_str = str(msg_id)
        if clean_content or status != "in_progress":
            existing_mem["content"] = clean_content or existing_mem.get("content", "")
        existing_mem["status"] = status
        if model:
            existing_mem["model"] = model
        if tokens:
            existing_mem["tokens"] = tokens
        if safe_attachments:
            existing_mem["attachments"] = safe_attachments
        if error_detail is not None:
            existing_mem["error_detail"] = error_detail
        existing_mem["updated_at"] = now_iso
    else:
        try:
            msg_id = uuid.UUID(str(message_id)) if message_id else uuid.uuid4()
        except (ValueError, TypeError):
            msg_id = uuid.uuid4()
        msg_uuid_str = str(msg_id)
        sess_msgs.append({
            "id": msg_uuid_str,
            "session_id": session_id,
            "user_id": u_id_str,
            "role": role,
            "content": clean_content,
            "model": model,
            "tokens": tokens,
            "status": status,
            "request_id": request_id,
            "parent_message_id": str(parent_message_id) if parent_message_id else None,
            "version": int(version or 1),
            "is_edited": bool(is_edited),
            "edited_at": now_iso if is_edited else None,
            "attachments": safe_attachments,
            "error_detail": error_detail,
            "created_at": now_iso,
            "updated_at": now_iso,
        })

    if not pool:
        return msg_uuid_str

    jsonb_tool_calls = json.dumps(tool_calls) if tool_calls else None
    jsonb_attachments = json.dumps(safe_attachments, ensure_ascii=False)
    p_uuid = None
    if parent_message_id:
        try:
            p_uuid = uuid.UUID(str(parent_message_id))
        except (ValueError, TypeError):
            p_uuid = None

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
                    s_uuid, generate_session_title(clean_content or "Nova Conversa"), u_id_str, now
                )

            # Deduplicação por request_id no banco
            if request_id:
                try:
                    existing_db_id = await conn.fetchval(
                        """
                        SELECT id FROM public.chat_messages
                        WHERE session_id = $1 AND role = $2 AND request_id = $3
                        LIMIT 1
                        """,
                        s_uuid, role, request_id
                    )
                    if existing_db_id:
                        await conn.execute(
                            """
                            UPDATE public.chat_messages
                            SET content = CASE WHEN $1 != '' THEN $1 ELSE content END,
                                status = $2,
                                model = COALESCE($3, model),
                                tokens = COALESCE($4, tokens),
                                error_detail = COALESCE($5, error_detail),
                                updated_at = $6
                            WHERE id = $7
                            """,
                            clean_content, status, model, tokens, error_detail, now, existing_db_id
                        )
                        return str(existing_db_id)
                except Exception:
                    pass

            # 1. Gravação oficial em chat_messages (com fallback se schema antigo em mock)
            try:
                await conn.execute(
                    """
                    INSERT INTO public.chat_messages (
                        id, session_id, user_id, role, content, model, tokens,
                        tool_name, tool_call_id, tool_calls,
                        status, request_id, parent_message_id, version, is_edited,
                        attachments, error_detail, created_at, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18, $18)
                    ON CONFLICT (id) DO UPDATE SET
                        content = EXCLUDED.content,
                        status = EXCLUDED.status,
                        model = COALESCE(EXCLUDED.model, public.chat_messages.model),
                        tokens = COALESCE(EXCLUDED.tokens, public.chat_messages.tokens),
                        error_detail = COALESCE(EXCLUDED.error_detail, public.chat_messages.error_detail),
                        updated_at = EXCLUDED.updated_at
                    """,
                    msg_id, s_uuid, u_id_str, role, clean_content, model, tokens,
                    tool_name, tool_call_id, jsonb_tool_calls,
                    status, request_id, p_uuid, int(version or 1), bool(is_edited),
                    jsonb_attachments, error_detail, now
                )
            except Exception:
                await conn.execute(
                    """
                    INSERT INTO public.chat_messages (
                        id, session_id, user_id, role, content, model, tokens, tool_name, tool_call_id, tool_calls, created_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    """,
                    msg_id, s_uuid, u_id_str, role, clean_content, model, tokens, tool_name, tool_call_id, jsonb_tool_calls, now
                )

            # 2. Sincroniza Step para a UI do histórico da web e desktop (quando houver conteúdo)
            if clean_content:
                try:
                    step_name = "Usuário" if role == "user" else "Charlie"
                    step_type = "user_message" if role == "user" else "assistant_message"
                    await conn.execute(
                        """
                        INSERT INTO "Step" (id, "threadId", name, type, output, "createdAt")
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT (id) DO UPDATE SET output = EXCLUDED.output
                        """,
                        msg_id, s_uuid, step_name, step_type, clean_content, now
                    )
                except Exception as st_err:
                    logger.debug("Aviso não-crítico ao sincronizar Step: %s", st_err)

        return msg_uuid_str
    except Exception as e:
        logger.error(f"[chat_persistence] Falha ao persistir mensagem ({role}) na sessão {session_id}: {e}")
        return msg_uuid_str


async def update_chat_message_state(
    pool: Optional[asyncpg.Pool],
    session_id: str,
    message_id: Optional[str] = None,
    request_id: Optional[str] = None,
    role: str = "assistant",
    content: Optional[str] = None,
    status: str = "completed",
    model: Optional[str] = None,
    tokens: Optional[int] = None,
    error_detail: Optional[str] = None,
) -> Optional[str]:
    """Atualiza o estado e conteúdo de uma mensagem em andamento (in_progress -> completed/cancelled/interrupted/failed)."""
    now = datetime.datetime.now(datetime.timezone.utc)
    now_iso = now.isoformat()
    clean_content = content.strip() if content is not None else None
    if tokens is None and clean_content:
        tokens = max(1, math.ceil(len(clean_content) / 3.8))

    # 1. Atualiza em memória
    sess_msgs = _in_memory_messages.get(session_id, [])
    target_mem = None
    for m in reversed(sess_msgs):
        if (message_id and m["id"] == str(message_id)) or (request_id and m.get("request_id") == request_id and m.get("role") == role):
            target_mem = m
            break

    if target_mem:
        if clean_content is not None:
            target_mem["content"] = clean_content
        target_mem["status"] = status
        if model:
            target_mem["model"] = model
        if tokens is not None:
            target_mem["tokens"] = tokens
        if error_detail is not None:
            target_mem["error_detail"] = error_detail
        target_mem["updated_at"] = now_iso
        if not message_id:
            message_id = target_mem["id"]

    if not pool:
        return str(message_id) if message_id else None

    try:
        s_uuid = uuid.UUID(session_id)
    except (ValueError, TypeError):
        return str(message_id) if message_id else None

    try:
        async with _db_connection_scope(pool) as conn:
            m_uuid = None
            if message_id:
                try:
                    m_uuid = uuid.UUID(str(message_id))
                except (ValueError, TypeError):
                    m_uuid = None

            if not m_uuid and request_id:
                m_uuid = await conn.fetchval(
                    """
                    SELECT id FROM public.chat_messages
                    WHERE session_id = $1 AND role = $2 AND request_id = $3
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    s_uuid, role, request_id
                )

            if m_uuid:
                await conn.execute(
                    """
                    UPDATE public.chat_messages
                    SET content = COALESCE($1, content),
                        status = $2,
                        model = COALESCE($3, model),
                        tokens = COALESCE($4, tokens),
                        error_detail = COALESCE($5, error_detail),
                        updated_at = $6
                    WHERE id = $7
                    """,
                    clean_content, status, model, tokens, error_detail, now, m_uuid
                )
                if clean_content:
                    try:
                        step_name = "Usuário" if role == "user" else "Charlie"
                        step_type = "user_message" if role == "user" else "assistant_message"
                        await conn.execute(
                            """
                            INSERT INTO "Step" (id, "threadId", name, type, output, "createdAt")
                            VALUES ($1, $2, $3, $4, $5, $6)
                            ON CONFLICT (id) DO UPDATE SET output = EXCLUDED.output
                            """,
                            m_uuid, s_uuid, step_name, step_type, clean_content, now
                        )
                    except Exception:
                        pass
                return str(m_uuid)
    except Exception as e:
        logger.warning(f"[chat_persistence] Aviso ao atualizar estado da mensagem em {session_id}: {e}")

    return str(message_id) if message_id else None


async def recover_stale_in_progress_messages(
    pool: Optional[asyncpg.Pool],
    session_id: str,
    active_request_ids: Optional[set[str]] = None,
    stale_after_seconds: float = 120.0,
) -> int:
    """Converte mensagens órfãs em 'in_progress' (sem stream ativo) para 'interrupted' ou 'unknown'."""
    active_ids = active_request_ids or set()
    now = datetime.datetime.now(datetime.timezone.utc)
    recovered = 0

    for m in _in_memory_messages.get(session_id, []):
        if m.get("status") == "in_progress":
            req_id = m.get("request_id")
            if req_id and req_id in active_ids:
                continue
            try:
                created_dt = datetime.datetime.fromisoformat(m["created_at"])
                age = (now - created_dt).total_seconds()
            except Exception:
                age = stale_after_seconds + 1
            if age >= stale_after_seconds or not req_id or req_id not in active_ids:
                m["status"] = "interrupted" if (m.get("content") or "").strip() else "unknown"
                m["updated_at"] = now.isoformat()
                recovered += 1

    if not pool:
        return recovered

    try:
        s_uuid = uuid.UUID(session_id)
        async with _db_connection_scope(pool) as conn:
            rows = await conn.fetch(
                """
                SELECT id, content, request_id, created_at
                FROM public.chat_messages
                WHERE session_id = $1 AND status = 'in_progress'
                """,
                s_uuid
            )
            for r in rows:
                r_req = r["request_id"]
                if r_req and r_req in active_ids:
                    continue
                new_status = "interrupted" if (r["content"] or "").strip() else "unknown"
                await conn.execute(
                    "UPDATE public.chat_messages SET status = $1, updated_at = $2 WHERE id = $3",
                    new_status, now, r["id"]
                )
                recovered += 1
    except Exception as e:
        logger.debug(f"[chat_persistence] Aviso ao recuperar mensagens in_progress em {session_id}: {e}")

    return recovered


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

    # Filtro de integridade de identidade canônica
    from brain.personality.canonical_identity import sanitize_memory_candidate
    allowed, sanitized_fact, reason = sanitize_memory_candidate(clean_fact, cat, user_id=str(user_id))
    if not allowed:
        logger.warning(f"[chat_persistence] Memória rejeitada por integridade de identidade canônica ({reason}): '{clean_fact}'")
        return ""
    clean_fact = sanitized_fact


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
        limit = int(float(limit)) if limit else 15
    except (ValueError, TypeError):
        limit = 15
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
    pool: Optional[asyncpg.Pool],
    session_id: str,
    limit: int = 30,
    user_id: Optional[str] = None,
) -> list[dict]:
    """Carrega o histórico real de mensagens com validação de titularidade do usuário."""
    if not session_id:
        return []

    try:
        limit = int(float(limit)) if limit else 30
    except (ValueError, TypeError):
        limit = 30

    if not pool:
        mem_sess = _in_memory_sessions.get(session_id)
        if user_id and mem_sess and mem_sess.get("user_id") and mem_sess["user_id"] != str(user_id):
            logger.warning(
                f"[chat_persistence] Tentativa de ler histórico em memória de outro usuário: sess={session_id}, req_user={user_id}, owner={mem_sess['user_id']}"
            )
            return []
        mem_msgs = _in_memory_messages.get(session_id, [])
        history = []
        for m in mem_msgs:
            if m.get("role") in ("user", "assistant"):
                c = (m.get("content") or "").strip()
                if c:
                    history.append({"role": m["role"], "content": c})
        return history[-limit:]

    try:
        s_uuid = uuid.UUID(session_id)
    except (ValueError, TypeError):
        return []

    try:
        async with _db_connection_scope(pool) as conn:
            # 0. Validação de Titularidade da Sessão
            if user_id:
                sess_owner = await conn.fetchrow(
                    "SELECT user_id FROM public.chat_sessions WHERE id = $1",
                    s_uuid
                )
                if sess_owner and sess_owner["user_id"] and sess_owner["user_id"] != str(user_id):
                    logger.warning(
                        f"[chat_persistence] Tentativa de ler histórico de outro usuário: sess={session_id}, req_user={user_id}, owner={sess_owner['user_id']}"
                    )
                    return []

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

    try:
        limit = int(float(limit)) if limit else 5
    except (ValueError, TypeError):
        limit = 5

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

    try:
        limit = int(float(limit)) if limit else 15
    except (ValueError, TypeError):
        limit = 15

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


async def edit_and_truncate_message_record(
    pool: Optional[asyncpg.Pool],
    session_id: str,
    message_id: str,
    user_id: str,
    new_content: str,
    truncate_subsequent: bool = True,
) -> Optional[Dict[str, Any]]:
    """Edita uma mensagem do usuário (incrementando version e marcando is_edited=True) e trunca as mensagens posteriores na mesma conversa."""
    clean_content = (new_content or "").strip()
    if not clean_content:
        return None

    u_id_str = str(user_id)
    now = datetime.datetime.now(datetime.timezone.utc)
    now_iso = now.isoformat()

    # Verifica titularidade em memória
    mem_sess = _in_memory_sessions.get(session_id)
    if mem_sess and mem_sess.get("user_id") and mem_sess["user_id"] != u_id_str:
        raise PermissionError("Acesso negado: esta conversa pertence a outro usuário.")

    updated_msg: Optional[Dict[str, Any]] = None
    sess_msgs = _in_memory_messages.get(session_id, [])
    target_idx = None
    for idx, m in enumerate(sess_msgs):
        if m["id"] == str(message_id):
            if m.get("user_id") and m["user_id"] != u_id_str:
                raise PermissionError("Acesso negado: esta mensagem pertence a outro usuário.")
            target_idx = idx
            m["content"] = clean_content
            m["is_edited"] = True
            m["edited_at"] = now_iso
            m["version"] = int(m.get("version") or 1) + 1
            m["updated_at"] = now_iso
            updated_msg = dict(m)
            break

    if target_idx is not None and truncate_subsequent:
        del sess_msgs[target_idx + 1 :]

    if not pool:
        return updated_msg

    try:
        s_uuid = uuid.UUID(session_id)
        m_uuid = uuid.UUID(str(message_id))
    except (ValueError, TypeError):
        return updated_msg

    try:
        async with _db_connection_scope(pool) as conn:
            row = await conn.fetchrow(
                "SELECT id, session_id, user_id, role, created_at, COALESCE(version, 1) AS version FROM public.chat_messages WHERE id = $1 AND session_id = $2",
                m_uuid, s_uuid
            )
            if not row:
                return updated_msg
            if row["user_id"] and str(row["user_id"]) != u_id_str:
                raise PermissionError("Acesso negado: esta mensagem pertence a outro usuário.")

            new_ver = int(row["version"] or 1) + 1
            await conn.execute(
                """
                UPDATE public.chat_messages
                SET content = $1,
                    is_edited = TRUE,
                    edited_at = $2,
                    version = $3,
                    updated_at = $2
                WHERE id = $4
                """,
                clean_content, now, new_ver, m_uuid
            )
            try:
                await conn.execute('UPDATE "Step" SET output = $1 WHERE id = $2', clean_content, m_uuid)
            except Exception:
                pass

            if truncate_subsequent and row["created_at"]:
                await conn.execute(
                    "DELETE FROM public.chat_messages WHERE session_id = $1 AND created_at > $2 AND id != $3",
                    s_uuid, row["created_at"], m_uuid
                )
                try:
                    await conn.execute(
                        'DELETE FROM "Step" WHERE "threadId" = $1 AND "createdAt" > $2 AND id != $3',
                        s_uuid, row["created_at"], m_uuid
                    )
                except Exception:
                    pass

            return {
                "id": str(m_uuid),
                "session_id": session_id,
                "role": row["role"],
                "content": clean_content,
                "is_edited": True,
                "edited_at": now_iso,
                "version": new_ver,
            }
    except PermissionError:
        raise
    except Exception as e:
        logger.warning(f"[chat_persistence] Erro ao editar/truncar mensagem {message_id}: {e}")
        return updated_msg


async def delete_from_message_record(
    pool: Optional[asyncpg.Pool],
    session_id: str,
    message_id: str,
    user_id: str,
    inclusive: bool = True,
) -> bool:
    """Remove uma mensagem (e opcionalmente todas as posteriores na mesma sessão) para suportar regeneração limpa."""
    u_id_str = str(user_id)
    mem_sess = _in_memory_sessions.get(session_id)
    if mem_sess and mem_sess.get("user_id") and mem_sess["user_id"] != u_id_str:
        raise PermissionError("Acesso negado: esta conversa pertence a outro usuário.")

    sess_msgs = _in_memory_messages.get(session_id, [])
    target_idx = None
    for idx, m in enumerate(sess_msgs):
        if m["id"] == str(message_id):
            if m.get("user_id") and m["user_id"] != u_id_str:
                raise PermissionError("Acesso negado: esta mensagem pertence a outro usuário.")
            target_idx = idx
            break

    removed_mem = False
    if target_idx is not None:
        if inclusive:
            del sess_msgs[target_idx:]
        else:
            del sess_msgs[target_idx + 1 :]
        removed_mem = True

    if not pool:
        return removed_mem

    try:
        s_uuid = uuid.UUID(session_id)
        m_uuid = uuid.UUID(str(message_id))
    except (ValueError, TypeError):
        return removed_mem

    try:
        async with _db_connection_scope(pool) as conn:
            row = await conn.fetchrow(
                "SELECT id, user_id, created_at FROM public.chat_messages WHERE id = $1 AND session_id = $2",
                m_uuid, s_uuid
            )
            if not row:
                return removed_mem
            if row["user_id"] and str(row["user_id"]) != u_id_str:
                raise PermissionError("Acesso negado: esta mensagem pertence a outro usuário.")

            if inclusive:
                if row["created_at"]:
                    await conn.execute(
                        "DELETE FROM public.chat_messages WHERE session_id = $1 AND (created_at >= $2 OR id = $3)",
                        s_uuid, row["created_at"], m_uuid
                    )
                else:
                    await conn.execute("DELETE FROM public.chat_messages WHERE id = $1", m_uuid)
            else:
                if row["created_at"]:
                    await conn.execute(
                        "DELETE FROM public.chat_messages WHERE session_id = $1 AND created_at > $2 AND id != $3",
                        s_uuid, row["created_at"], m_uuid
                    )
            return True
    except PermissionError:
        raise
    except Exception as e:
        logger.warning(f"[chat_persistence] Erro ao remover a partir da mensagem {message_id}: {e}")
        return removed_mem


async def save_message_feedback_record(
    pool: Optional[asyncpg.Pool],
    message_id: str,
    session_id: str,
    user_id: str,
    rating: int,
    comment: Optional[str] = None,
) -> Dict[str, Any]:
    """Registra ou atualiza avaliação positiva (+1) ou negativa (-1) de uma resposta do assistente."""
    norm_rating = 1 if int(rating) > 0 else -1
    u_id_str = str(user_id)
    now = datetime.datetime.now(datetime.timezone.utc)
    now_iso = now.isoformat()
    clean_comment = (comment or "").strip()[:1000] or None

    key = f"{message_id}:{u_id_str}"
    entry = {
        "message_id": str(message_id),
        "session_id": str(session_id),
        "user_id": u_id_str,
        "rating": norm_rating,
        "comment": clean_comment,
        "updated_at": now_iso,
    }
    _in_memory_feedback[key] = entry

    if pool:
        try:
            async with _db_connection_scope(pool) as conn:
                await conn.execute(
                    """
                    INSERT INTO public.message_feedback (message_id, session_id, user_id, rating, comment, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $6)
                    ON CONFLICT (message_id, user_id) DO UPDATE SET
                        rating = EXCLUDED.rating,
                        comment = COALESCE(EXCLUDED.comment, public.message_feedback.comment),
                        updated_at = EXCLUDED.updated_at
                    """,
                    str(message_id), str(session_id), u_id_str, norm_rating, clean_comment, now
                )
        except Exception as e:
            logger.warning(f"[chat_persistence] Aviso ao persistir feedback da mensagem {message_id}: {e}")

    return entry


async def get_message_feedback_map(
    pool: Optional[asyncpg.Pool],
    session_id: str,
    user_id: str,
) -> Dict[str, int]:
    """Retorna mapa message_id -> rating (+1 ou -1) das avaliações do usuário na conversa."""
    u_id_str = str(user_id)
    result: Dict[str, int] = {}
    for fb in _in_memory_feedback.values():
        if fb.get("session_id") == str(session_id) and fb.get("user_id") == u_id_str:
            result[fb["message_id"]] = int(fb["rating"])

    if pool:
        try:
            async with _db_connection_scope(pool) as conn:
                rows = await conn.fetch(
                    """
                    SELECT message_id, rating
                    FROM public.message_feedback
                    WHERE session_id = $1 AND user_id = $2
                    """,
                    str(session_id), u_id_str
                )
                for r in rows:
                    result[str(r["message_id"])] = int(r["rating"])
        except Exception:
            pass

    return result


