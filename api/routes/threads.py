"""Rotas de gerenciamento de conversas (Threads)."""

import datetime
import json
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from api.db import get_or_init_db_pool
from api.routes.auth import get_current_user_optional

router = APIRouter(prefix="/threads", tags=["Threads"])


class ThreadCreate(BaseModel):
    name: Optional[str] = "Novo Chat"


@router.get("")
async def list_threads(user: Optional[dict] = Depends(get_current_user_optional)):
    """Lista todas as conversas do usuário ordenadas pela mais recente."""
    pool = await get_or_init_db_pool()
    if not pool:
        return []

    async with pool.acquire() as conn:
        if user and user.get("id"):
            u_uuid = uuid.UUID(user["id"])
            rows = await conn.fetch("""
                SELECT id, name, "createdAt", "updatedAt"
                FROM "Thread"
                WHERE "deletedAt" IS NULL
                  AND ("userId" = $1 OR "userId" IS NULL)
                ORDER BY "updatedAt" DESC
            """, u_uuid)
        else:
            rows = await conn.fetch("""
                SELECT id, name, "createdAt", "updatedAt"
                FROM "Thread"
                WHERE "deletedAt" IS NULL
                ORDER BY "updatedAt" DESC
            """)

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
async def create_thread(data: ThreadCreate, user: Optional[dict] = Depends(get_current_user_optional)):
    """Cria uma nova conversa limpa vinculada ao usuário caso autenticado."""
    pool = await get_or_init_db_pool()
    thread_id = str(uuid.uuid4())
    now = datetime.datetime.now(datetime.timezone.utc)

    if pool:
        async with pool.acquire() as conn:
            if user and user.get("id"):
                u_uuid = uuid.UUID(user["id"])
                await conn.execute("""
                    INSERT INTO "Thread" (id, name, "createdAt", "updatedAt", "userId", "userIdentifier", metadata)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                """, uuid.UUID(thread_id), data.name, now, now, u_uuid, user.get("email"), json.dumps({}))
            else:
                await conn.execute("""
                    INSERT INTO "Thread" (id, name, "createdAt", "updatedAt", metadata)
                    VALUES ($1, $2, $3, $4, $5)
                """, uuid.UUID(thread_id), data.name, now, now, json.dumps({}))

    return {"id": thread_id, "name": data.name}


@router.delete("/{thread_id}")
async def delete_thread(thread_id: str):
    """Marca uma conversa como excluída (soft delete)."""
    pool = await get_or_init_db_pool()
    if not pool:
        return {"status": "ok"}

    try:
        t_uuid = uuid.UUID(thread_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de conversa inválido.")

    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE "Thread"
            SET "deletedAt" = CURRENT_TIMESTAMP
            WHERE id = $1
        """, t_uuid)

    return {"status": "deleted", "id": thread_id}


class ThreadUpdate(BaseModel):
    name: str


@router.patch("/{thread_id}")
@router.put("/{thread_id}")
async def update_thread(thread_id: str, data: ThreadUpdate):
    """Atualiza o nome de uma conversa."""
    pool = await get_or_init_db_pool()
    if not pool:
        return {"id": thread_id, "name": data.name}

    try:
        t_uuid = uuid.UUID(thread_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de conversa inválido.")

    async with pool.acquire() as conn:
        await conn.execute("""
            UPDATE "Thread"
            SET name = $1, "updatedAt" = CURRENT_TIMESTAMP
            WHERE id = $2
        """, data.name, t_uuid)

    return {"status": "updated", "id": thread_id, "name": data.name}

