"""Rotas de gerenciamento de conversas (Threads)."""

import datetime
import json
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from api.db import get_db_pool

router = APIRouter(prefix="/threads", tags=["Threads"])


class ThreadCreate(BaseModel):
    name: Optional[str] = "Novo Chat"


@router.get("")
async def list_threads():
    """Lista todas as conversas do usuário ordenadas pela mais recente."""
    pool = get_db_pool()
    if not pool:
        return []

    async with pool.acquire() as conn:
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
async def create_thread(data: ThreadCreate):
    """Cria uma nova conversa limpa."""
    pool = get_db_pool()
    thread_id = str(uuid.uuid4())
    now = datetime.datetime.now(datetime.timezone.utc)

    if pool:
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO "Thread" (id, name, "createdAt", "updatedAt", metadata)
                VALUES ($1, $2, $3, $4, $5)
            """, uuid.UUID(thread_id), data.name, now, now, json.dumps({}))

    return {"id": thread_id, "name": data.name}


@router.delete("/{thread_id}")
async def delete_thread(thread_id: str):
    """Marca uma conversa como excluída (soft delete)."""
    pool = get_db_pool()
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
