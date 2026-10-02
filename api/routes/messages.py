"""Rotas de busca de mensagens de conversas com validação de posse do usuário."""

import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from api.db import get_or_init_db_pool
from api.routes.auth import get_current_user

router = APIRouter(prefix="/messages", tags=["Messages"])


@router.get("")
async def list_messages(
    thread_id: str = Query(..., description="ID da conversa"),
    user: dict = Depends(get_current_user),
):
    """Retorna todas as mensagens da conversa informada, garantindo que pertença ao usuário autenticado."""
    pool = await get_or_init_db_pool()
    if not pool:
        return []

    try:
        t_uuid = uuid.UUID(thread_id)
        u_uuid = uuid.UUID(user["id"])
    except ValueError:
        raise HTTPException(status_code=400, detail="ID de conversa inválido.")

    async with pool.acquire() as conn:
        # Valida que a thread existe e pertence ao usuário autenticado
        email = user.get("email")
        thread_owner = await conn.fetchrow("""
            SELECT id FROM "Thread"
            WHERE id = $1 
              AND ("userId" = $2 OR ("userIdentifier" IS NOT NULL AND "userIdentifier" = $3))
              AND "deletedAt" IS NULL
        """, t_uuid, u_uuid, email)

        if not thread_owner:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversa não encontrada ou acesso negado.",
            )

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
