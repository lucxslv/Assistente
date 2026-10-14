"""Rotas de busca, edição, truncamento e avaliação de mensagens com validação estrita de propriedade."""

import json
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from api.db import get_or_init_db_pool
from api.routes.auth import get_current_user
from api.services.chat_persistence import (
    _in_memory_sessions,
    _in_memory_messages,
    recover_stale_in_progress_messages,
    edit_and_truncate_message_record,
    delete_from_message_record,
    save_message_feedback_record,
    get_message_feedback_map,
)

router = APIRouter(prefix="/messages", tags=["Messages"])


class EditMessagePayload(BaseModel):
    thread_id: str = Field(..., min_length=1)
    content: str = Field(..., min_length=1, max_length=32000)
    truncate_subsequent: bool = True
    truncate_after: Optional[bool] = None


class FeedbackMessagePayload(BaseModel):
    thread_id: str = Field(..., min_length=1)
    rating: int | str = Field(..., description="+1/'up' para positivo, -1/'down' para negativo")
    comment: Optional[str] = Field(None, max_length=1000)


@router.get("")
async def list_messages(
    thread_id: str = Query(..., description="ID da conversa"),
    user: dict = Depends(get_current_user),
):
    """Retorna todas as mensagens da conversa informada, garantindo que pertença ao usuário autenticado."""
    pool = await get_or_init_db_pool()
    email = user.get("email")
    u_id_str = str(user["id"])

    # Recupera request_ids ativos nesta thread para não marcar streams ativos como órfãos
    active_req_ids: set[str] = set()
    try:
        from api.routes.chat import get_active_request_ids_for_thread
        active_req_ids = get_active_request_ids_for_thread(thread_id)
    except Exception:
        pass

    await recover_stale_in_progress_messages(
        pool,
        session_id=thread_id,
        active_request_ids=active_req_ids,
        stale_after_seconds=0.0,
    )

    feedback_map = await get_message_feedback_map(pool, thread_id, u_id_str)

    if not pool:
        mem_sess = _in_memory_sessions.get(thread_id)
        if not mem_sess:
            return []
        if mem_sess.get("user_id") not in (u_id_str, email):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversa não encontrada ou acesso negado.",
            )
        mem_msgs = _in_memory_messages.get(thread_id, [])
        return [
            {
                "id": str(m["id"]),
                "name": "Usuário" if m.get("role") == "user" else "Charlie",
                "type": "user_message" if m.get("role") == "user" else "assistant_message",
                "role": m.get("role", "assistant"),
                "content": m.get("content", ""),
                "status": m.get("status", "completed"),
                "request_id": m.get("request_id"),
                "parent_message_id": m.get("parent_message_id"),
                "version": m.get("version", 1),
                "is_edited": bool(m.get("is_edited", False)),
                "edited_at": m.get("edited_at"),
                "attachments": m.get("attachments", []),
                "error_detail": m.get("error_detail"),
                "feedback": feedback_map.get(str(m["id"])),
                "createdAt": m.get("created_at"),
            }
            for m in mem_msgs
            if m.get("role") in ("user", "assistant")
        ]

    try:
        t_uuid = uuid.UUID(thread_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="ID de conversa inválido.")

    u_uuid = None
    try:
        u_uuid = uuid.UUID(u_id_str)
    except (ValueError, TypeError):
        pass

    async with pool.acquire() as conn:
        chat_sess = await conn.fetchrow("""
            SELECT id FROM public.chat_sessions
            WHERE id = $1 AND (user_id = $2 OR user_id = $3)
        """, t_uuid, u_id_str, email)

        if not chat_sess:
            thread_owner = await conn.fetchrow("""
                SELECT id FROM "Thread"
                WHERE id = $1 
                  AND (($2::uuid IS NOT NULL AND "userId" = $2::uuid) OR ("userIdentifier" IS NOT NULL AND "userIdentifier" = $3) OR (metadata->>'user_id' = $4))
                  AND "deletedAt" IS NULL
            """, t_uuid, u_uuid, email, u_id_str)

            if not thread_owner:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Conversa não encontrada ou acesso negado.",
                )

        # 1. Prioriza leitura completa das mensagens em chat_messages
        try:
            msg_rows = await conn.fetch("""
                SELECT id, role, content, status, request_id, parent_message_id,
                       version, is_edited, edited_at, attachments, error_detail,
                       model, tokens, created_at
                FROM public.chat_messages
                WHERE session_id = $1 AND role IN ('user', 'assistant')
                  AND content != 'Comando de dispositivo enviado para execução no seu computador.'
                ORDER BY created_at ASC
            """, t_uuid)
        except Exception:
            msg_rows = await conn.fetch("""
                SELECT id, role, content, created_at
                FROM public.chat_messages
                WHERE session_id = $1 AND role IN ('user', 'assistant')
                  AND content != 'Comando de dispositivo enviado para execução no seu computador.'
                ORDER BY created_at ASC
            """, t_uuid)

        if msg_rows:
            results = []
            for r in msg_rows:
                r_dict = dict(r)
                raw_atts = r_dict.get("attachments")
                parsed_atts = []
                if isinstance(raw_atts, str):
                    try:
                        parsed_atts = json.loads(raw_atts)
                    except Exception:
                        parsed_atts = []
                elif isinstance(raw_atts, list):
                    parsed_atts = raw_atts

                msg_id_str = str(r_dict["id"])
                results.append({
                    "id": msg_id_str,
                    "name": "Usuário" if r_dict["role"] == "user" else "Charlie",
                    "type": "user_message" if r_dict["role"] == "user" else "assistant_message",
                    "role": r_dict["role"],
                    "content": r_dict["content"] or "",
                    "status": r_dict.get("status") or "completed",
                    "request_id": r_dict.get("request_id"),
                    "parent_message_id": str(r_dict["parent_message_id"]) if r_dict.get("parent_message_id") else None,
                    "version": int(r_dict.get("version") or 1),
                    "is_edited": bool(r_dict.get("is_edited") or False),
                    "edited_at": r_dict["edited_at"].isoformat() if r_dict.get("edited_at") else None,
                    "attachments": parsed_atts,
                    "error_detail": r_dict.get("error_detail"),
                    "model": r_dict.get("model"),
                    "tokens": r_dict.get("tokens"),
                    "feedback": feedback_map.get(msg_id_str),
                    "createdAt": r_dict["created_at"].isoformat() if r_dict.get("created_at") else None,
                })
            return results

        # 2. Fallback para Step em caso de mensagens legadas
        rows = await conn.fetch("""
            SELECT id, name, type, output, "createdAt"
            FROM "Step"
            WHERE "threadId" = $1 AND type IN ('user_message', 'assistant_message')
              AND output != 'Comando de dispositivo enviado para execução no seu computador.'
            ORDER BY "createdAt" ASC
        """, t_uuid)

        return [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "type": r["type"],
                "role": "user" if r["type"] == "user_message" else "assistant",
                "content": r["output"],
                "status": "completed",
                "attachments": [],
                "feedback": feedback_map.get(str(r["id"])),
                "createdAt": r["createdAt"].isoformat() if r["createdAt"] else None,
            }
            for r in rows
        ]


@router.put("/{message_id}")
@router.patch("/{message_id}")
async def edit_message(
    message_id: str,
    payload: EditMessagePayload,
    user: dict = Depends(get_current_user),
):
    """Edita uma mensagem existente e trunca mensagens posteriores da mesma conversa para reenvio limpo."""
    pool = await get_or_init_db_pool()
    trunc = payload.truncate_after if payload.truncate_after is not None else payload.truncate_subsequent
    try:
        updated = await edit_and_truncate_message_record(
            pool=pool,
            session_id=payload.thread_id,
            message_id=message_id,
            user_id=str(user["id"]),
            new_content=payload.content,
            truncate_subsequent=trunc,
        )
    except PermissionError as pe:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))

    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mensagem não encontrada.")

    return {**updated, "status": "ok", "message": updated}


@router.delete("/{message_id}")
async def delete_from_message(
    message_id: str,
    thread_id: str = Query(..., description="ID da conversa"),
    inclusive: bool = Query(True, description="Se verdadeiro, remove a própria mensagem e as posteriores"),
    user: dict = Depends(get_current_user),
):
    """Remove uma mensagem e as posteriores para permitir regeneração limpa de resposta sem duplicatas."""
    pool = await get_or_init_db_pool()
    try:
        removed = await delete_from_message_record(
            pool=pool,
            session_id=thread_id,
            message_id=message_id,
            user_id=str(user["id"]),
            inclusive=inclusive,
        )
    except PermissionError as pe:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(pe))

    return {"status": "ok", "removed": removed}


@router.post("/{message_id}/feedback")
async def submit_message_feedback(
    message_id: str,
    payload: FeedbackMessagePayload,
    user: dict = Depends(get_current_user),
):
    """Registra avaliação 👍 (+1) ou 👎 (-1) em uma resposta do assistente."""
    raw_rating = payload.rating
    if raw_rating in (1, "1", "up", "positive"):
        norm_rating = 1
    elif raw_rating in (-1, "-1", "down", "negative"):
        norm_rating = -1
    else:
        raise HTTPException(status_code=400, detail="O campo 'rating' deve ser 1/'up' (positivo) ou -1/'down' (negativo).")

    pool = await get_or_init_db_pool()
    entry = await save_message_feedback_record(
        pool=pool,
        message_id=message_id,
        session_id=payload.thread_id,
        user_id=str(user["id"]),
        rating=norm_rating,
        comment=payload.comment,
    )
    return {**entry, "status": "ok", "feedback": entry}
