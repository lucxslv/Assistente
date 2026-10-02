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
        # Valida que a conversa existe e pertence ao usuário autenticado (chat_sessions ou Thread)
        email = user.get("email")
        u_id_str = str(user["id"])
        
        chat_sess = await conn.fetchrow("""
            SELECT id FROM public.chat_sessions
            WHERE id = $1 AND (user_id = $2 OR user_id = $3)
        """, t_uuid, u_id_str, email)

        if not chat_sess:
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

        # 1. Prioriza leitura das mensagens em chat_messages
        msg_rows = await conn.fetch("""
            SELECT id, role, content, created_at
            FROM public.chat_messages
            WHERE session_id = $1 AND role IN ('user', 'assistant')
            ORDER BY created_at ASC
        """, t_uuid)

        if msg_rows:
            return [
                {
                    "id": str(r["id"]),
                    "name": "Usuário" if r["role"] == "user" else "Charlie",
                    "type": "user_message" if r["role"] == "user" else "assistant_message",
                    "content": r["content"],
                    "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
                }
                for r in msg_rows
            ]

        # 2. Fallback para Step em caso de mensagens legadas
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
