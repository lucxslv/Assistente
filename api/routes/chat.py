"""Rotas de conversação (Chat REST, SSE Streaming e WebSocket)."""

import asyncio
import datetime
import json
import logging
import platform
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.db import get_or_init_db_pool
from api.routes.auth import get_current_user, get_current_user_optional
from api.state import CharlieStatus, state
from brain.broker.device_broker import device_broker
from brain.context.presence import presence_manager
from core.pipeline import AssistantPipeline
from core.streaming import StreamEvent

logger = logging.getLogger("charlie.api.chat")
router = APIRouter(prefix="/chat", tags=["Chat"])

# Instância compartilhada do pipeline
_pipeline: Optional[AssistantPipeline] = None


def get_pipeline() -> AssistantPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = AssistantPipeline()
    return _pipeline


class ChatRequest(BaseModel):
    message: str = ""
    thread_id: Optional[str] = None
    skip_tts: bool = True
    tool_results: Optional[list[dict]] = None
    history: Optional[list[dict]] = None


async def _load_thread_history(thread_id: str, limit: int = 30) -> list[dict]:
    """Carrega o histórico real de mensagens da conversa (Thread) persistido no Supabase/PostgreSQL."""
    pool = await get_or_init_db_pool()
    if not pool or not thread_id:
        return []
    try:
        t_uuid = uuid.UUID(thread_id)
    except ValueError:
        return []
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT type, output, "createdAt"
                FROM "Step"
                WHERE "threadId" = $1 AND type IN ('user_message', 'assistant_message')
                ORDER BY "createdAt" ASC
            """, t_uuid)
            history = []
            for r in rows:
                role = "user" if r["type"] == "user_message" else "assistant"
                content = r["output"] or ""
                if content.strip():
                    history.append({"role": role, "content": content})
            return history[-limit:]
    except Exception as e:
        logger.warning(f"Erro ao carregar histórico persistido da thread {thread_id}: {e}")
        return []



async def _prepare_thread_and_store_user_message(
    message: str,
    thread_id: Optional[str] = None,
    user: Optional[dict] = None,
) -> str:
    """Garante a existência da thread vinculada ao usuário autenticado e persiste a mensagem no Supabase."""
    if not user or not user.get("id"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação obrigatória para enviar mensagens.",
        )

    pool = await get_or_init_db_pool()
    now = datetime.datetime.now(datetime.timezone.utc)
    u_uuid = uuid.UUID(str(user["id"]))
    u_ident = user.get("email")

    if not thread_id:
        thread_id = str(uuid.uuid4())
    try:
        t_uuid = uuid.UUID(thread_id)
    except ValueError:
        thread_id = str(uuid.uuid4())
        t_uuid = uuid.UUID(thread_id)

    state.active_thread_id = thread_id

    if pool:
        async with pool.acquire() as conn:
            existing = await conn.fetchrow('SELECT id, name, "userId" FROM "Thread" WHERE id = $1', t_uuid)
            title = (message[:35] + ("..." if len(message) > 35 else "")) if (message and message.strip()) else "Ação do Agente"

            if not existing:
                await conn.execute("""
                    INSERT INTO "Thread" (id, name, "createdAt", "updatedAt", "userId", "userIdentifier", metadata)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                """, t_uuid, title, now, now, u_uuid, u_ident, json.dumps({}))
            else:
                # Valida que o usuário possui acesso à conversa existente
                if existing["userId"] is not None and existing["userId"] != u_uuid:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Acesso negado: esta conversa pertence a outra conta.",
                    )
                elif existing["userId"] is None:
                    # Associa thread legada ao usuário atual
                    await conn.execute("""
                        UPDATE "Thread" SET "userId" = $1, "userIdentifier" = $2 WHERE id = $3
                    """, u_uuid, u_ident, t_uuid)

                if message and message.strip() and existing["name"] in ("Novo Chat", "Nova conversa", "Conversa sem título", None, ""):
                    await conn.execute("""
                        UPDATE "Thread" SET name = $1, "updatedAt" = $2 WHERE id = $3
                    """, title, now, t_uuid)
                else:
                    await conn.execute("""
                        UPDATE "Thread" SET "updatedAt" = $1 WHERE id = $2
                    """, now, t_uuid)

            # Salva mensagem do usuário vinculada à conversa se houver texto
            if message and message.strip():
                user_msg_id = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO "Step" (id, "threadId", name, type, output, "createdAt")
                    VALUES ($1, $2, $3, $4, $5, $6)
                """, uuid.UUID(user_msg_id), t_uuid, "Usuário", "user_message", message, now)

    return thread_id


async def _store_assistant_message(thread_id: str, reply: str):
    """Persiste a resposta final do Charlie no Supabase."""
    pool = await get_or_init_db_pool()
    if pool and reply and reply.strip():
        try:
            t_uuid = uuid.UUID(thread_id)
            asst_msg_id = str(uuid.uuid4())
            asst_now = datetime.datetime.now(datetime.timezone.utc)
            async with pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO "Step" (id, "threadId", name, type, output, "createdAt")
                    VALUES ($1, $2, $3, $4, $5, $6)
                """, uuid.UUID(asst_msg_id), t_uuid, "Charlie", "assistant_message", reply, asst_now)
        except Exception as e:
            logger.error("Erro ao salvar mensagem da assistente no Supabase: %s", e)


def _extract_ip(req: Request) -> str:
    """Extrai o IP real do cliente mesmo através de proxies e CDN da Vercel."""
    forwarded = req.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return req.client.host if req.client else "127.0.0.1"


# ================= Endpoints =================

@router.post("")
async def chat_post(req: ChatRequest, request: Request, user: dict = Depends(get_current_user)):
    """Processa uma mensagem de texto de forma síncrona (espera resposta completa)."""
    pipeline = get_pipeline()
    thread_id = await _prepare_thread_and_store_user_message(req.message, req.thread_id, user=user)

    thread_history = await _load_thread_history(thread_id)
    if not thread_history and req.history:
        thread_history = req.history

    state.set_status(CharlieStatus.THINKING)
    try:
        reply = await pipeline.run_pipeline(
            req.message,
            skip_tts=req.skip_tts,
            thread_id=thread_id,
            user_id=str(user["id"]),
            user_name=user.get("name"),
            history=thread_history,
        )
    except Exception as e:
        logger.exception("Erro no pipeline")
        state.set_status(CharlieStatus.ERROR)
        reply = f"Desculpe, ocorreu um erro ao processar sua mensagem: {e}"
    finally:
        state.set_status(CharlieStatus.IDLE)

    await _store_assistant_message(thread_id, reply)

    # Gravação assíncrona de telemetria e custo em USD (não-bloqueante)
    try:
        from api.services.audit_service import record_audit_log
        asyncio.create_task(
            record_audit_log(
                user_id=str(user["id"]),
                user_email=user.get("email") or "usuario@teste.com",
                user_prompt=req.message,
                model_response=reply,
                ip_address=_extract_ip(request),
                session_id=thread_id,
            )
        )
    except Exception as audit_err:
        logger.warning(f"Aviso ao registrar audit log: {audit_err}")

    return {
        "reply": reply,
        "thread_id": thread_id,
        "status": "success",
    }


@router.post("/stream")
async def chat_stream_sse(req: ChatRequest, request: Request, user: dict = Depends(get_current_user)):
    """Endpoint de streaming em tempo real via Server-Sent Events (SSE)."""
    pipeline = get_pipeline()
    thread_id = await _prepare_thread_and_store_user_message(req.message, req.thread_id, user=user)
    client_ip = _extract_ip(request)

    thread_history = await _load_thread_history(thread_id)
    if not thread_history and req.history:
        thread_history = req.history

    async def event_generator():
        final_reply = ""
        state.set_status(CharlieStatus.THINKING)

        try:
            async for ev in pipeline.run_pipeline_stream(
                req.message,
                thread_id=thread_id,
                user_id=str(user["id"]),
                user_name=user.get("name"),
                tool_results=req.tool_results,
                history=thread_history,
            ):
                if ev.type == "token":
                    final_reply += ev.data.get("token", "")
                elif ev.type == "done":
                    final_reply = ev.data.get("reply", final_reply)

                yield ev.to_sse()
        except Exception as e:
            logger.exception("Erro durante streaming SSE")
            state.set_status(CharlieStatus.ERROR)
            yield StreamEvent(type="error", data={"error": str(e)}).to_sse()
        finally:
            state.set_status(CharlieStatus.IDLE)
            if final_reply and final_reply.strip():
                await _store_assistant_message(thread_id, final_reply)
                try:
                    from api.services.audit_service import record_audit_log
                    asyncio.create_task(
                        record_audit_log(
                            user_id=str(user["id"]),
                            user_email=user.get("email") or "usuario@teste.com",
                            user_prompt=req.message,
                            model_response=final_reply,
                            ip_address=client_ip,
                            session_id=thread_id,
                        )
                    )
                except Exception as audit_err:
                    logger.warning(f"Aviso ao registrar audit log SSE: {audit_err}")

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.websocket("/ws")
async def chat_ws(websocket: WebSocket):
    """Canal WebSocket bidirecional para streaming de tokens e telemetria em tempo real."""
    await websocket.accept()

    client_id = f"ws-{uuid.uuid4().hex[:8]}"
    presence_manager.register_or_heartbeat(
        client_id=client_id,
        client_type="desktop",
        name="Charlie Desktop Client",
        platform="Windows",
    )

    device_broker.register_device_connection(websocket)

    # Envia estado inicial do Charlie
    await websocket.send_json({"type": "state", "data": state.to_dict()})

    loop = asyncio.get_running_loop()

    def on_state_change(data):
        asyncio.run_coroutine_threadsafe(
            websocket.send_json({"type": "state", "data": data}),
            loop
        )

    state.subscribe(on_state_change)
    pipeline = get_pipeline()

    ws_user = None
    token = websocket.query_params.get("token")
    if token:
        from api.routes.auth import verify_supabase_token
        ws_user = await verify_supabase_token(token)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "ping":
                presence_manager.register_or_heartbeat(client_id=client_id)
                await websocket.send_json({"type": "pong"})
            elif msg_type == "auth":
                auth_tok = data.get("token")
                if auth_tok:
                    from api.routes.auth import verify_supabase_token
                    ws_user = await verify_supabase_token(auth_tok)
                    await websocket.send_json({"type": "auth_status", "authenticated": ws_user is not None})
            elif msg_type == "device_tool_result":
                call_id = data.get("call_id")
                res = data.get("result")
                device_broker.resolve_tool_result(call_id, res)
            elif msg_type == "chat":
                if not ws_user:
                    await websocket.send_json({"type": "error", "data": {"error": "Autenticação obrigatória para enviar mensagens."}})
                    continue
                text = data.get("message", "")
                thread_id_in = data.get("thread_id")
                thread_id = await _prepare_thread_and_store_user_message(text, thread_id_in, user=ws_user)
                presence_manager.register_or_heartbeat(client_id=client_id, active_thread_id=thread_id)

                final_reply = ""
                state.set_status(CharlieStatus.THINKING)

                try:
                    async for ev in pipeline.run_pipeline_stream(text, thread_id=thread_id):
                        if ev.type == "token":
                            final_reply += ev.data.get("token", "")
                        elif ev.type == "done":
                            final_reply = ev.data.get("reply", final_reply)

                        # Envia cada evento de stream para o cliente conectado
                        await websocket.send_json(ev.to_dict())
                except Exception as e:
                    logger.exception("Erro no streaming WS")
                    state.set_status(CharlieStatus.ERROR)
                    await websocket.send_json({"type": "error", "data": {"error": str(e)}})
                finally:
                    state.set_status(CharlieStatus.IDLE)
                    await _store_assistant_message(thread_id, final_reply)
    except WebSocketDisconnect:
        logger.info(f"Cliente WebSocket {client_id} desconectado.")
    finally:
        device_broker.unregister_device_connection(websocket)
        presence_manager.unregister(client_id)
        state.unsubscribe(on_state_change)
