"""Rotas de gerenciamento de conversas (Threads) com isolamento estrito por usuário."""

import datetime
import json
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from api.db import get_or_init_db_pool
from api.routes.auth import get_current_user

router = APIRouter(prefix="/threads", tags=["Threads"])


class ThreadCreate(BaseModel):
    name: Optional[str] = "Novo Chat"


@router.get("")
async def list_threads(user: dict = Depends(get_current_user)):
    """Lista exclusivamente as conversas do usuário autenticado ordenadas pela mais recente."""
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

    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT COALESCE(t.id, cs.id) as id,
                   COALESCE(t.name, cs.title) as name,
                   COALESCE(t."createdAt", cs.created_at) as "createdAt",
                   COALESCE(t."updatedAt", cs.updated_at) as "updatedAt"
            FROM public.chat_sessions cs
            FULL OUTER JOIN "Thread" t ON t.id = cs.id
            WHERE (t."deletedAt" IS NULL OR t."deletedAt" IS NULL)
              AND (
                cs.user_id = $1 OR cs.user_id = $2
                OR (t."userId" IS NOT NULL AND t."userId" = $3)
                OR (t."userIdentifier" IS NOT NULL AND t."userIdentifier" = $2)
              )
            ORDER BY "updatedAt" DESC NULLS LAST
        """, u_id_str, email, u_uuid)

        return [
            {
                "id": str(r["id"]),
                "name": r["name"] or "Sem título",
                "createdAt": r["createdAt"].isoformat() if r["createdAt"] else None,
                "updatedAt": r["updatedAt"].isoformat() if r["updatedAt"] else None,
            }
            for r in rows
        ]


@router.post("")
async def create_thread(data: ThreadCreate, user: dict = Depends(get_current_user)):
    """Cria uma nova conversa vinculada obrigatoriamente à conta do usuário autenticado."""
    pool = await get_or_init_db_pool()
    thread_id = str(uuid.uuid4())
    now = datetime.datetime.now(datetime.timezone.utc)
    email = user.get("email")

    if pool:
        from api.services.chat_persistence import ensure_session_record
        await ensure_session_record(
            pool=pool,
            session_id=thread_id,
            user_id=str(user["id"]),
            user_email=email,
            prompt=data.name,
        )

    return {
        "id": thread_id,
        "name": data.name,
        "createdAt": now.isoformat(),
        "updatedAt": now.isoformat(),
    }


@router.delete("/{thread_id}")
async def delete_thread(thread_id: str, user: dict = Depends(get_current_user)):
    """Marca uma conversa como excluída (soft delete), garantindo que pertença ao usuário."""
    pool = await get_or_init_db_pool()
    if not pool:
        return {"status": "ok"}

    try:
        t_uuid = uuid.UUID(thread_id)
        u_uuid = uuid.UUID(user["id"])
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de conversa inválido.")

    email = user.get("email")
    u_id_str = str(user["id"])
    async with pool.acquire() as conn:
        res = await conn.execute("""
            UPDATE "Thread"
            SET "deletedAt" = CURRENT_TIMESTAMP
            WHERE id = $1 AND ("userId" = $2 OR ("userIdentifier" IS NOT NULL AND "userIdentifier" = $3))
        """, t_uuid, u_uuid, email)

        await conn.execute("""
            DELETE FROM public.chat_sessions
            WHERE id = $1 AND (user_id = $2 OR user_id = $3)
        """, t_uuid, u_id_str, email)

        if res == "UPDATE 0":
            # Se não atualizou Thread, verifica se foi excluído em chat_sessions
            sess_chk = await conn.fetchval("SELECT 1 FROM public.chat_sessions WHERE id = $1", t_uuid)
            if sess_chk:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Você não tem permissão para excluir esta conversa.",
                )

    return {"status": "deleted", "id": thread_id}


class ThreadUpdate(BaseModel):
    name: str


@router.patch("/{thread_id}")
@router.put("/{thread_id}")
async def update_thread(thread_id: str, data: ThreadUpdate, user: dict = Depends(get_current_user)):
    """Atualiza o nome de uma conversa garantindo que pertença ao usuário."""
    pool = await get_or_init_db_pool()
    if not pool:
        return {"id": thread_id, "name": data.name}

    try:
        t_uuid = uuid.UUID(thread_id)
        u_uuid = uuid.UUID(user["id"])
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de conversa inválido.")

    email = user.get("email")
    u_id_str = str(user["id"])
    async with pool.acquire() as conn:
        res = await conn.execute("""
            UPDATE "Thread"
            SET name = $1, "updatedAt" = CURRENT_TIMESTAMP
            WHERE id = $2 AND ("userId" = $3 OR ("userIdentifier" IS NOT NULL AND "userIdentifier" = $4))
        """, data.name, t_uuid, u_uuid, email)

        await conn.execute("""
            UPDATE public.chat_sessions
            SET title = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2 AND (user_id = $3 OR user_id = $4)
        """, data.name, t_uuid, u_id_str, email)

        if res == "UPDATE 0":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversa não encontrada ou você não tem permissão para alterá-la.",
            )

    return {"status": "updated", "id": thread_id, "name": data.name}
