"""Rotas de gerenciamento de conversas (Threads) com isolamento estrito por usuário."""

import asyncio
import datetime
import json
import time
import uuid
from typing import Dict, Optional, Tuple
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from api.db import get_or_init_db_pool
from api.routes.auth import get_current_user

router = APIRouter(prefix="/threads", tags=["Threads"])

# Controle de concorrência e idempotência por usuário para criação de conversas
_user_create_locks: Dict[str, asyncio.Lock] = {}
_recent_thread_creations: Dict[str, Tuple[float, dict]] = {}  # key -> (timestamp, response_dict)
_thread_owners: Dict[str, str] = {}  # thread_id -> owner user_id


class ThreadCreate(BaseModel):
    name: Optional[str] = "Novo Chat"
    idempotency_key: Optional[str] = None
    reuse_empty: Optional[bool] = True


class ThreadUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    is_pinned: Optional[bool] = None
    is_archived: Optional[bool] = None


@router.get("")
async def list_threads(
    q: Optional[str] = Query(default=None, description="Busca opcional por título ou conteúdo das mensagens"),
    include_archived: bool = Query(default=True, description="Incluir conversas arquivadas"),
    user: dict = Depends(get_current_user),
):
    """Lista exclusivamente as conversas do usuário autenticado ordenadas por fixadas e mais recentes."""
    pool = await get_or_init_db_pool()
    if not pool:
        return []

    u_uuid = None
    try:
        u_uuid = uuid.UUID(str(user["id"]))
    except (ValueError, TypeError):
        pass
    email = user.get("email")
    u_id_str = str(user["id"])
    search_term = (q or "").strip()

    async with pool.acquire() as conn:
        try:
            if search_term:
                like_pattern = f"%{search_term}%"
                rows = await conn.fetch("""
                    SELECT DISTINCT ON (COALESCE(t.id, cs.id))
                           COALESCE(t.id, cs.id) as id,
                           COALESCE(t.name, cs.title) as name,
                           COALESCE(t."createdAt", cs.created_at) as "createdAt",
                           COALESCE(t."updatedAt", cs.updated_at) as "updatedAt",
                           COALESCE(cs.is_pinned, FALSE) as is_pinned,
                           cs.pinned_at as pinned_at,
                           COALESCE(cs.is_archived, FALSE) as is_archived,
                           cs.archived_at as archived_at
                    FROM public.chat_sessions cs
                    FULL OUTER JOIN "Thread" t ON t.id = cs.id
                    LEFT JOIN public.chat_messages cm ON cm.session_id = COALESCE(t.id, cs.id)
                    WHERE t."deletedAt" IS NULL
                      AND (
                        cs.user_id = $1 OR cs.user_id = $2
                        OR (t."userId" IS NOT NULL AND t."userId" = $3)
                        OR (t."userIdentifier" IS NOT NULL AND t."userIdentifier" = $2)
                      )
                      AND (
                        COALESCE(t.name, cs.title, '') ILIKE $4
                        OR COALESCE(cm.content, '') ILIKE $4
                      )
                """, u_id_str, email, u_uuid, like_pattern)
                # Ordena em Python após DISTINCT ON
                rows = sorted(
                    rows,
                    key=lambda r: (
                        bool(r["is_pinned"]),
                        r["updatedAt"].timestamp() if r["updatedAt"] else 0.0,
                    ),
                    reverse=True,
                )
            else:
                rows = await conn.fetch("""
                    SELECT COALESCE(t.id, cs.id) as id,
                           COALESCE(t.name, cs.title) as name,
                           COALESCE(t."createdAt", cs.created_at) as "createdAt",
                           COALESCE(t."updatedAt", cs.updated_at) as "updatedAt",
                           COALESCE(cs.is_pinned, FALSE) as is_pinned,
                           cs.pinned_at as pinned_at,
                           COALESCE(cs.is_archived, FALSE) as is_archived,
                           cs.archived_at as archived_at
                    FROM public.chat_sessions cs
                    FULL OUTER JOIN "Thread" t ON t.id = cs.id
                    WHERE t."deletedAt" IS NULL
                      AND (
                        cs.user_id = $1 OR cs.user_id = $2
                        OR (t."userId" IS NOT NULL AND t."userId" = $3)
                        OR (t."userIdentifier" IS NOT NULL AND t."userIdentifier" = $2)
                      )
                    ORDER BY COALESCE(cs.is_pinned, FALSE) DESC, "updatedAt" DESC NULLS LAST
                """, u_id_str, email, u_uuid)
        except Exception:
            # Fallback caso colunas novas ainda não existam no banco
            rows = await conn.fetch("""
                SELECT COALESCE(t.id, cs.id) as id,
                       COALESCE(t.name, cs.title) as name,
                       COALESCE(t."createdAt", cs.created_at) as "createdAt",
                       COALESCE(t."updatedAt", cs.updated_at) as "updatedAt"
                FROM public.chat_sessions cs
                FULL OUTER JOIN "Thread" t ON t.id = cs.id
                WHERE t."deletedAt" IS NULL
                  AND (
                    cs.user_id = $1 OR cs.user_id = $2
                    OR (t."userId" IS NOT NULL AND t."userId" = $3)
                    OR (t."userIdentifier" IS NOT NULL AND t."userIdentifier" = $2)
                  )
                ORDER BY "updatedAt" DESC NULLS LAST
            """, u_id_str, email, u_uuid)

        results = []
        for r in rows:
            is_arch = bool(r["is_archived"]) if "is_archived" in r else False
            if not include_archived and is_arch:
                continue
            results.append({
                "id": str(r["id"]),
                "name": r["name"] or "Sem título",
                "createdAt": r["createdAt"].isoformat() if r["createdAt"] else None,
                "updatedAt": r["updatedAt"].isoformat() if r["updatedAt"] else None,
                "is_pinned": bool(r["is_pinned"]) if "is_pinned" in r else False,
                "pinnedAt": r["pinned_at"].isoformat() if ("pinned_at" in r and r["pinned_at"]) else None,
                "is_archived": is_arch,
                "archivedAt": r["archived_at"].isoformat() if ("archived_at" in r and r["archived_at"]) else None,
            })
        return results


@router.get("/search")
async def search_threads(
    q: str = Query(..., min_length=1, description="Termo de busca por título ou conteúdo de mensagem"),
    user: dict = Depends(get_current_user),
):
    """Busca conversas do usuário autenticado por título ou conteúdo de mensagens."""
    return await list_threads(q=q, include_archived=True, user=user)


@router.post("")
async def create_thread(data: ThreadCreate, user: dict = Depends(get_current_user)):
    """Cria uma nova conversa vinculada obrigatoriamente à conta do usuário autenticado com proteção de idempotência."""
    u_id_str = str(user["id"])
    email = user.get("email")
    title = (data.name or "Novo Chat").strip() or "Novo Chat"

    lock = _user_create_locks.get(u_id_str)
    if lock is None:
        lock = asyncio.Lock()
        _user_create_locks[u_id_str] = lock

    async with lock:
        now_ts = time.time()
        idem_key = (data.idempotency_key or "").strip()
        cache_key = f"{u_id_str}:{idem_key}" if idem_key else f"{u_id_str}::default::{title}"

        # 1. Verifica idempotência em memória para cliques rápidos repetidos (< 1.5s sem key, ou < 60s com idempotency_key)
        cached = _recent_thread_creations.get(cache_key)
        ttl = 60.0 if idem_key else 1.5
        if cached and (now_ts - cached[0]) < ttl:
            return cached[1]

        pool = await get_or_init_db_pool()
        now = datetime.datetime.now(datetime.timezone.utc)

        if pool:
            async with pool.acquire() as conn:
                # 2. Se idempotency_key foi enviada, verifica no banco se já existe
                if idem_key:
                    try:
                        existing_idem = await conn.fetchrow("""
                            SELECT id, title, created_at, updated_at,
                                   COALESCE(is_pinned, FALSE) as is_pinned,
                                   COALESCE(is_archived, FALSE) as is_archived
                            FROM public.chat_sessions
                            WHERE (user_id = $1 OR user_id = $2) AND idempotency_key = $3
                            LIMIT 1
                        """, u_id_str, email, idem_key)
                        if existing_idem:
                            resp = {
                                "id": str(existing_idem["id"]),
                                "name": existing_idem["title"] or title,
                                "createdAt": existing_idem["created_at"].isoformat() if existing_idem["created_at"] else now.isoformat(),
                                "updatedAt": existing_idem["updated_at"].isoformat() if existing_idem["updated_at"] else now.isoformat(),
                                "is_pinned": bool(existing_idem["is_pinned"]),
                                "is_archived": bool(existing_idem["is_archived"]),
                                "reused": True,
                            }
                            _recent_thread_creations[cache_key] = (now_ts, resp)
                            return resp
                    except Exception:
                        pass

                # 3. Se for criação padrão ("Novo Chat" / "Nova conversa") e reuse_empty=True,
                # verifica se já existe uma sessão vazia recém-criada pelo usuário nos últimos 30 segundos
                if data.reuse_empty and title.lower() in ("novo chat", "nova conversa", "new chat"):
                    try:
                        empty_sess = await conn.fetchrow("""
                            SELECT cs.id, cs.title, cs.created_at, cs.updated_at
                            FROM public.chat_sessions cs
                            LEFT JOIN public.chat_messages cm ON cm.session_id = cs.id
                            LEFT JOIN "Thread" t ON t.id = cs.id
                            WHERE (cs.user_id = $1 OR cs.user_id = $2)
                              AND (t."deletedAt" IS NULL)
                              AND cs.created_at >= (CURRENT_TIMESTAMP - INTERVAL '30 seconds')
                            GROUP BY cs.id, cs.title, cs.created_at, cs.updated_at
                            HAVING COUNT(cm.id) = 0
                            ORDER BY cs.created_at DESC
                            LIMIT 1
                        """, u_id_str, email)
                        if empty_sess:
                            resp = {
                                "id": str(empty_sess["id"]),
                                "name": empty_sess["title"] or title,
                                "createdAt": empty_sess["created_at"].isoformat() if empty_sess["created_at"] else now.isoformat(),
                                "updatedAt": empty_sess["updated_at"].isoformat() if empty_sess["updated_at"] else now.isoformat(),
                                "is_pinned": False,
                                "is_archived": False,
                                "reused": True,
                            }
                            _recent_thread_creations[cache_key] = (now_ts, resp)
                            return resp
                    except Exception:
                        pass

        thread_id = str(uuid.uuid4())
        if pool:
            from api.services.chat_persistence import ensure_session_record
            await ensure_session_record(
                pool=pool,
                session_id=thread_id,
                user_id=u_id_str,
                user_email=email,
                prompt=title,
            )
            if idem_key:
                try:
                    async with pool.acquire() as conn:
                        await conn.execute(
                            "UPDATE public.chat_sessions SET idempotency_key = $1 WHERE id = $2",
                            idem_key,
                            uuid.UUID(thread_id),
                        )
                except Exception:
                    pass

        resp = {
            "id": thread_id,
            "name": title,
            "createdAt": now.isoformat(),
            "updatedAt": now.isoformat(),
            "is_pinned": False,
            "is_archived": False,
        }
        _recent_thread_creations[cache_key] = (now_ts, resp)
        _thread_owners[thread_id] = u_id_str
        return resp


@router.delete("/{thread_id}")
async def delete_thread(thread_id: str, user: dict = Depends(get_current_user)):
    """Marca uma conversa como excluída (soft delete), garantindo estritamente que pertença ao usuário."""
    u_id_str = str(user["id"])
    mem_owner = _thread_owners.get(thread_id)
    if mem_owner and mem_owner != u_id_str:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não tem permissão para excluir esta conversa.",
        )

    pool = await get_or_init_db_pool()
    if not pool:
        _thread_owners.pop(thread_id, None)
        return {"status": "ok"}

    try:
        t_uuid = uuid.UUID(thread_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="ID de conversa inválido.")

    u_uuid = None
    try:
        u_uuid = uuid.UUID(str(user["id"]))
    except (ValueError, TypeError):
        pass

    email = user.get("email")
    async with pool.acquire() as conn:
        res_thread = await conn.execute("""
            UPDATE "Thread"
            SET "deletedAt" = CURRENT_TIMESTAMP
            WHERE id = $1
              AND "deletedAt" IS NULL
              AND (
                ($2::uuid IS NOT NULL AND "userId" = $2::uuid)
                OR ("userIdentifier" IS NOT NULL AND "userIdentifier" = $3)
                OR (metadata->>'user_id' = $4)
              )
        """, t_uuid, u_uuid, email, u_id_str)

        res_cs = await conn.execute("""
            DELETE FROM public.chat_sessions
            WHERE id = $1 AND (user_id = $2 OR user_id = $3)
        """, t_uuid, u_id_str, email)

        if res_thread == "UPDATE 0" and res_cs == "DELETE 0":
            # Verifica se a conversa pertence a outro usuário (403) ou se não existe (404)
            foreign_exists = await conn.fetchval("""
                SELECT 1 FROM public.chat_sessions WHERE id = $1
                UNION ALL
                SELECT 1 FROM "Thread" WHERE id = $1 AND "deletedAt" IS NULL
                LIMIT 1
            """, t_uuid)
            if foreign_exists:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Você não tem permissão para excluir esta conversa.",
                )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversa não encontrada.",
            )

    # Limpa cache de criação recente do usuário
    for k in [k for k, v in _recent_thread_creations.items() if v[1].get("id") == thread_id]:
        _recent_thread_creations.pop(k, None)
    _thread_owners.pop(thread_id, None)

    return {"status": "deleted", "id": thread_id}


@router.patch("/{thread_id}")
@router.put("/{thread_id}")
async def update_thread(thread_id: str, data: ThreadUpdate, user: dict = Depends(get_current_user)):
    """Atualiza o título, fixação (pin) ou arquivamento (archive) de uma conversa garantindo titularidade."""
    u_id_str = str(user["id"])
    mem_owner = _thread_owners.get(thread_id)
    if mem_owner and mem_owner != u_id_str:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não tem permissão para editar esta conversa.",
        )

    pool = await get_or_init_db_pool()
    if not pool:
        return {
            "id": thread_id,
            "name": data.name,
            "is_pinned": data.is_pinned,
            "is_archived": data.is_archived,
        }

    try:
        t_uuid = uuid.UUID(thread_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="ID de conversa inválido.")

    u_uuid = None
    try:
        u_uuid = uuid.UUID(str(user["id"]))
    except (ValueError, TypeError):
        pass

    email = user.get("email")

    async with pool.acquire() as conn:
        # 1. Valida titularidade antes de alterar
        owns_cs = await conn.fetchrow("""
            SELECT id, title, COALESCE(is_pinned, FALSE) as is_pinned, COALESCE(is_archived, FALSE) as is_archived
            FROM public.chat_sessions
            WHERE id = $1 AND (user_id = $2 OR user_id = $3)
        """, t_uuid, u_id_str, email)

        owns_thread = await conn.fetchrow("""
            SELECT id, name
            FROM "Thread"
            WHERE id = $1
              AND "deletedAt" IS NULL
              AND (
                ($2::uuid IS NOT NULL AND "userId" = $2::uuid)
                OR ("userIdentifier" IS NOT NULL AND "userIdentifier" = $3)
                OR (metadata->>'user_id' = $4)
              )
        """, t_uuid, u_uuid, email, u_id_str)

        if not owns_cs and not owns_thread:
            foreign_exists = await conn.fetchval("""
                SELECT 1 FROM public.chat_sessions WHERE id = $1
                UNION ALL
                SELECT 1 FROM "Thread" WHERE id = $1 AND "deletedAt" IS NULL
                LIMIT 1
            """, t_uuid)
            if foreign_exists:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Você não tem permissão para alterar esta conversa.",
                )
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversa não encontrada ou você não tem permissão para alterá-la.",
            )

        new_name = data.name.strip() if data.name is not None else (
            (owns_cs["title"] if owns_cs else None) or (owns_thread["name"] if owns_thread else "Sem título")
        )
        new_pinned = data.is_pinned if data.is_pinned is not None else (bool(owns_cs["is_pinned"]) if owns_cs else False)
        new_archived = data.is_archived if data.is_archived is not None else (bool(owns_cs["is_archived"]) if owns_cs else False)

        if data.name is not None:
            await conn.execute("""
                UPDATE "Thread"
                SET name = $1, "updatedAt" = CURRENT_TIMESTAMP
                WHERE id = $2
                  AND (
                    ($3::uuid IS NOT NULL AND "userId" = $3::uuid)
                    OR ("userIdentifier" IS NOT NULL AND "userIdentifier" = $4)
                    OR (metadata->>'user_id' = $5)
                  )
            """, new_name, t_uuid, u_uuid, email, u_id_str)

        try:
            await conn.execute("""
                UPDATE public.chat_sessions
                SET title = $1,
                    is_pinned = $2,
                    pinned_at = CASE WHEN $2 = TRUE THEN COALESCE(pinned_at, CURRENT_TIMESTAMP) ELSE NULL END,
                    is_archived = $3,
                    archived_at = CASE WHEN $3 = TRUE THEN COALESCE(archived_at, CURRENT_TIMESTAMP) ELSE NULL END,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $4 AND (user_id = $5 OR user_id = $6)
            """, new_name, new_pinned, new_archived, t_uuid, u_id_str, email)
        except Exception:
            await conn.execute("""
                UPDATE public.chat_sessions
                SET title = $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2 AND (user_id = $3 OR user_id = $4)
            """, new_name, t_uuid, u_id_str, email)

    return {
        "status": "updated",
        "id": thread_id,
        "name": new_name,
        "is_pinned": new_pinned,
        "is_archived": new_archived,
    }
