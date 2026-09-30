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

    u_uuid = uuid.UUID(user["id"])
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, name, "createdAt", "updatedAt"
            FROM "Thread"
            WHERE "deletedAt" IS NULL
              AND "userId" = $1
            ORDER BY "updatedAt" DESC
        """, u_uuid)

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
    u_uuid = uuid.UUID(user["id"])
    email = user.get("email")

    if pool:
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO "Thread" (id, name, "createdAt", "updatedAt", "userId", "userIdentifier", metadata)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            """, uuid.UUID(thread_id), data.name, now, now, u_uuid, email, json.dumps({}))

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

    async with pool.acquire() as conn:
        res = await conn.execute("""
            UPDATE "Thread"
            SET "deletedAt" = CURRENT_TIMESTAMP
            WHERE id = $1 AND "userId" = $2
        """, t_uuid, u_uuid)
        if res == "UPDATE 0":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversa não encontrada ou você não tem permissão para excluí-la.",
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

    async with pool.acquire() as conn:
        res = await conn.execute("""
            UPDATE "Thread"
            SET name = $1, "updatedAt" = CURRENT_TIMESTAMP
            WHERE id = $2 AND "userId" = $3
        """, data.name, t_uuid, u_uuid)
        if res == "UPDATE 0":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversa não encontrada ou você não tem permissão para alterá-la.",
            )

    return {"status": "updated", "id": thread_id, "name": data.name}
