"""Rotas de conversação (Chat REST, SSE Streaming e WebSocket)."""

import asyncio
import datetime
import json
import logging
import platform
import uuid
from typing import Optional
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, WebSocket, WebSocketDisconnect, status
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
    session_id: Optional[str] = None
    skip_tts: bool = True
    tool_results: Optional[list[dict]] = None
    history: Optional[list[dict]] = None
    images: Optional[list[dict]] = None


async def _load_thread_history(thread_id: str, limit: int = 30, user_id: Optional[str] = None) -> list[dict]:
    """Carrega o histórico real de mensagens da conversa (chat_messages com validação de titularidade)."""
    pool = await get_or_init_db_pool()
    if not pool or not thread_id:
        return []
    from api.services.chat_persistence import load_chat_history
    return await load_chat_history(pool, thread_id, limit=limit, user_id=user_id)


def _dispatch_save_message(
    pool,
    session_id: str,
    user_id: str,
    role: str,
    content: str,
    model: Optional[str] = None,
    tokens: Optional[int] = None,
    background_tasks: Optional[BackgroundTasks] = None,
):
    """Despacha a persistência da mensagem de forma unificada e atômica.

    Se background_tasks estiver presente no request HTTP, utiliza EXCLUSIVAMENTE background_tasks.add_task.
    asyncio.create_task é usado única e exclusivamente como fallback quando background_tasks for nulo.
    """
    from api.services.chat_persistence import save_chat_message_record

    kwargs = {
        "pool": pool,
        "session_id": session_id,
        "user_id": user_id,
        "role": role,
        "content": content,
        "model": model,
        "tokens": tokens,
    }

    if background_tasks is not None:
        background_tasks.add_task(save_chat_message_record, **kwargs)
    else:
        asyncio.create_task(save_chat_message_record(**kwargs))


async def _prepare_session_and_store_user_message(
    message: str,
    thread_id: Optional[str] = None,
    session_id: Optional[str] = None,
    user: Optional[dict] = None,
    background_tasks: Optional[BackgroundTasks] = None,
) -> str:
    """Garante a existência da sessão em chat_sessions e persiste a mensagem do usuário (role: user) com validação de titularidade."""
    if not user or not user.get("id"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação obrigatória para enviar mensagens.",
        )

    pool = await get_or_init_db_pool()
    sid = thread_id or session_id or str(uuid.uuid4())
    try:
        uuid.UUID(sid)
    except (ValueError, TypeError):
        sid = str(uuid.uuid4())

    state.active_thread_id = sid
    u_id_str = str(user["id"])
    u_email = user.get("email")

    if pool:
        from api.services.chat_persistence import ensure_session_record
        try:
            # Garante a existência imediata da sessão para integridade e FK
            await ensure_session_record(pool, session_id=sid, user_id=u_id_str, user_email=u_email, prompt=message)
        except PermissionError as pe:
            logger.warning(f"[chat] Tentativa de invasão ou acesso indevido à sessão {sid} por {u_id_str}: {pe}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso negado: esta conversa pertence a outro usuário.",
            )

        # Persistência atômica sem duplicação de gravação
        if message and message.strip():
            _dispatch_save_message(
                pool=pool,
                session_id=sid,
                user_id=u_id_str,
                role="user",
                content=message,
                background_tasks=background_tasks,
            )

    return sid


async def _store_assistant_message(
    thread_id: str,
    reply: str,
    user_id: Optional[str] = None,
    model: Optional[str] = None,
    tokens: Optional[int] = None,
    background_tasks: Optional[BackgroundTasks] = None,
):
    """Persiste a resposta final do Charlie (role: assistant) em chat_messages com modelo e tokens."""
    if not reply or not reply.strip():
        return
    pool = await get_or_init_db_pool()
    if not pool:
        return

    u_id_str = str(user_id) if user_id else "default"
    m_name = model or "gemini-3.1-flash-lite"

    _dispatch_save_message(
        pool=pool,
        session_id=thread_id,
        user_id=u_id_str,
        role="assistant",
        content=reply,
        model=m_name,
        tokens=tokens,
        background_tasks=background_tasks,
    )


def _extract_ip(req: Request) -> str:
    """Extrai o IP real do cliente mesmo através de proxies e CDN da Vercel."""
    forwarded = req.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return req.client.host if req.client else "127.0.0.1"


# ================= Endpoints =================

@router.post("")
async def chat_post(
    req: ChatRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    """Processa uma mensagem de texto de forma síncrona com persistência via BackgroundTasks."""
    pipeline = get_pipeline()
    thread_id = await _prepare_session_and_store_user_message(
        req.message,
        thread_id=req.thread_id,
        session_id=req.session_id,
        user=user,
        background_tasks=background_tasks,
    )

    thread_history = await _load_thread_history(thread_id, user_id=str(user["id"]))
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
            images=req.images,
        )
    except Exception as e:
        logger.exception("Erro no pipeline")
        state.set_status(CharlieStatus.ERROR)
        reply = f"Desculpe, ocorreu um erro ao processar sua mensagem: {e}"
    finally:
        state.set_status(CharlieStatus.IDLE)

    model_used = getattr(pipeline, "last_model_used", "gemini-3.1-flash-lite")
    from api.services.audit_service import estimate_tokens
    tokens_count = estimate_tokens(reply)

    if reply.strip() not in (
        "Comando de dispositivo enviado para execução no seu computador.",
        "Comando de dispositivo despachado para o seu computador com sucesso.",
    ):
        await _store_assistant_message(
            thread_id=thread_id,
            reply=reply,
            user_id=str(user["id"]),
            model=model_used,
            tokens=tokens_count,
            background_tasks=background_tasks,
        )

    # Gravação assíncrona de telemetria e custo em USD
    try:
        from api.services.audit_service import record_audit_log
        background_tasks.add_task(
            record_audit_log,
            user_id=str(user["id"]),
            user_email=user.get("email") or "usuario@teste.com",
            user_prompt=req.message,
            model_response=reply,
            ip_address=_extract_ip(request),
            session_id=thread_id,
            model_name=model_used,
        )
    except Exception as audit_err:
        logger.warning(f"Aviso ao registrar audit log: {audit_err}")

    return {
        "reply": reply,
        "thread_id": thread_id,
        "session_id": thread_id,
        "status": "success",
    }


@router.post("/stream")
async def chat_stream_sse(
    req: ChatRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    """Endpoint de streaming em tempo real via Server-Sent Events (SSE) com persistência em BackgroundTasks."""
    pipeline = get_pipeline()
    thread_id = await _prepare_session_and_store_user_message(
        req.message,
        thread_id=req.thread_id,
        session_id=req.session_id,
        user=user,
        background_tasks=background_tasks,
    )
    client_ip = _extract_ip(request)

    thread_history = await _load_thread_history(thread_id, user_id=str(user["id"]))
    if not thread_history and req.history:
        thread_history = req.history

    async def event_generator():
        final_reply = ""
        final_model = getattr(pipeline, "last_model_used", "gemini-3.1-flash-lite")
        state.set_status(CharlieStatus.THINKING)

        try:
            async for ev in pipeline.run_pipeline_stream(
                req.message,
                thread_id=thread_id,
                user_id=str(user["id"]),
                user_name=user.get("name"),
                tool_results=req.tool_results,
                history=thread_history,
                images=req.images,
            ):
                if ev.type == "token":
                    final_reply += ev.data.get("token", "")
                elif ev.type == "reset_and_fallback":
                    final_reply = ""
                    if ev.data.get("fallback_model"):
                        final_model = ev.data.get("fallback_model")
                elif ev.type == "done":
                    final_reply = ev.data.get("reply", final_reply)
                    if ev.data.get("model"):
                        final_model = ev.data.get("model")

                yield ev.to_sse()
        except Exception as e:
            logger.exception("Erro durante streaming SSE")
            state.set_status(CharlieStatus.ERROR)
            yield StreamEvent(type="error", data={"error": str(e)}).to_sse()
        finally:
            state.set_status(CharlieStatus.IDLE)
            if final_reply and final_reply.strip():
                # Suprime gravação no banco de mensagens transitórias de transporte de dispositivo
                if final_reply.strip() in (
                    "Comando de dispositivo enviado para execução no seu computador.",
                    "Comando de dispositivo despachado para o seu computador com sucesso.",
                ):
                    return

                from api.services.audit_service import estimate_tokens
                tokens_count = estimate_tokens(final_reply)

                await _store_assistant_message(
                    thread_id=thread_id,
                    reply=final_reply,
                    user_id=str(user["id"]),
                    model=final_model,
                    tokens=tokens_count,
                    background_tasks=background_tasks,
                )
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
                            model_name=final_model,
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
        background=background_tasks,
    )


@router.websocket("/ws")
async def chat_ws(websocket: WebSocket):
    """Canal WebSocket bidirecional para streaming de tokens e telemetria em tempo real."""
    await websocket.accept()

    client_id = f"ws-{uuid.uuid4().hex[:8]}"
    client_type = (websocket.query_params.get("client_type") or "desktop").lower()
    client_name = "Charlie Mobile Client" if client_type == "mobile" else "Charlie Desktop Client"
    platform_name = "Mobile" if client_type == "mobile" else "Windows"

    presence_manager.register_or_heartbeat(
        client_id=client_id,
        client_type=client_type,
        name=client_name,
        platform=platform_name,
    )

    # Valida token inicial se fornecido nos query parameters
    ws_user = None
    token = websocket.query_params.get("token")
    if token:
        from api.routes.auth import verify_supabase_token
        ws_user = await verify_supabase_token(token)

    # Apenas o Desktop Tauri AUTENTICADO é registrado como executor de ferramentas nativas
    is_desktop_broker_client = (client_type == "desktop" and ws_user is not None)
    if is_desktop_broker_client:
        device_broker.register_device_connection(websocket, user_id=str(ws_user["id"]))

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

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "ping":
                presence_manager.register_or_heartbeat(client_id=client_id)
                await websocket.send_json({"type": "pong"})
            elif msg_type == "auth":
                auth_tok = data.get("token")
                declared_type = data.get("client_type")
                if declared_type:
                    client_type = declared_type.lower()
                    if client_type == "mobile" and is_desktop_broker_client:
                        device_broker.unregister_device_connection(websocket, user_id=str(ws_user["id"]) if ws_user else None)
                        is_desktop_broker_client = False
                if auth_tok:
                    from api.routes.auth import verify_supabase_token
                    ws_user = await verify_supabase_token(auth_tok)
                    # Registra no device_broker se autenticado com sucesso e for desktop
                    if ws_user and client_type == "desktop" and not is_desktop_broker_client:
                        device_broker.register_device_connection(websocket, user_id=str(ws_user["id"]))
                        is_desktop_broker_client = True
                    await websocket.send_json({"type": "auth_status", "authenticated": ws_user is not None})
            elif msg_type == "device_tool_result":
                if is_desktop_broker_client:
                    call_id = data.get("call_id")
                    res = data.get("result")
                    device_broker.resolve_tool_result(call_id, res)
            elif msg_type == "chat":
                if not ws_user:
                    await websocket.send_json({"type": "error", "data": {"error": "Autenticação obrigatória para enviar mensagens."}})
                    continue
                text = data.get("message", "")
                thread_id_in = data.get("thread_id") or data.get("session_id")
                try:
                    thread_id = await _prepare_session_and_store_user_message(text, thread_id=thread_id_in, user=ws_user)
                except HTTPException as he:
                    logger.warning(f"[chat_ws] Bloqueio de acesso à sessão {thread_id_in} por {ws_user.get('id')}: {he.detail}")
                    await websocket.send_json({"type": "error", "data": {"error": he.detail}})
                    continue
                presence_manager.register_or_heartbeat(client_id=client_id, active_thread_id=thread_id)

                thread_history = await _load_thread_history(thread_id, user_id=str(ws_user["id"]))
                if not thread_history and data.get("history"):
                    thread_history = data.get("history")

                final_reply = ""
                final_model = getattr(pipeline, "last_model_used", "gemini-3.1-flash-lite")
                state.set_status(CharlieStatus.THINKING)

                try:
                    async for ev in pipeline.run_pipeline_stream(
                        text,
                        thread_id=thread_id,
                        user_id=str(ws_user["id"]),
                        user_name=ws_user.get("name"),
                        history=thread_history,
                        images=data.get("images"),
                        tool_results=data.get("tool_results"),
                    ):
                        if ev.type == "token":
                            final_reply += ev.data.get("token", "")
                        elif ev.type == "reset_and_fallback":
                            final_reply = ""
                            if ev.data.get("fallback_model"):
                                final_model = ev.data.get("fallback_model")
                        elif ev.type == "done":
                            final_reply = ev.data.get("reply", final_reply)
                            if ev.data.get("model"):
                                final_model = ev.data.get("model")

                        # Envia cada evento de stream para o cliente conectado
                        await websocket.send_json(ev.to_dict())
                except Exception as e:
                    logger.exception("Erro no streaming WS")
                    state.set_status(CharlieStatus.ERROR)
                    await websocket.send_json({"type": "error", "data": {"error": str(e)}})
                finally:
                    state.set_status(CharlieStatus.IDLE)
                    if final_reply and final_reply.strip():
                        from api.services.audit_service import estimate_tokens
                        await _store_assistant_message(
                            thread_id=thread_id,
                            reply=final_reply,
                            user_id=str(ws_user["id"]),
                            model=final_model,
                            tokens=estimate_tokens(final_reply),
                        )
    except WebSocketDisconnect:
        logger.info(f"Cliente WebSocket {client_id} ({client_type}) desconectado.")
    finally:
        if is_desktop_broker_client:
            device_broker.unregister_device_connection(websocket, user_id=str(ws_user["id"]) if ws_user else None)
        presence_manager.unregister(client_id)
        state.unsubscribe(on_state_change)
