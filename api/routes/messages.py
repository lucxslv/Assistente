"""Rotas de busca de mensagens de conversas."""

import uuid
from fastapi import APIRouter, HTTPException, Query
from api.db import get_db_pool

router = APIRouter(prefix="/messages", tags=["Messages"])


@router.get("")
async def list_messages(thread_id: str = Query(..., description="ID da conversa")):
    """Retorna todas as mensagens da conversa informada."""
    pool = get_db_pool()
    if not pool:
        return []

    try:
        t_uuid = uuid.UUID(thread_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de conversa inválido.")

    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT id, name, type, output, "createdAt"
            FROM "Step"
            WHERE "threadId" = $1 AND type IN ('user_message', 'assistant_message')
            ORDER BY "createdAt" ASC
        """, t_uuid)

        return [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "type": r["type"],
                "content": r["output"],
                "createdAt": r["createdAt"].isoformat() if r["createdAt"] else None,
            }
            for r in rows
        ]
