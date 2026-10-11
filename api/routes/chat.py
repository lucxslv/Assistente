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


import re
import threading
import time
from typing import Any, Dict, List

# Registro de streams ativos para cancelamento imediato ponta a ponta
_active_streams: Dict[str, Dict[str, Any]] = {}  # request_id -> {user_id, thread_id, request_id, cancel_event, assistant_msg_id, started_at}


def get_active_request_ids_for_thread(thread_id: str) -> set[str]:
    """Retorna os request_ids dos streams atualmente em execução para uma conversa."""
    return {
        req_id
        for req_id, info in list(_active_streams.items())
        if info.get("thread_id") == str(thread_id) and not info["cancel_event"].is_set()
    }


class ChatRequest(BaseModel):
    message: str = ""
    thread_id: Optional[str] = None
    session_id: Optional[str] = None
    request_id: Optional[str] = None
    skip_tts: bool = True
    skip_user_message_save: bool = False
    tool_results: Optional[list[dict]] = None
    history: Optional[list[dict]] = None
    images: Optional[list[dict]] = None
    attachments: Optional[list[dict]] = None


class CancelChatRequest(BaseModel):
    request_id: Optional[str] = None
    thread_id: Optional[str] = None
    session_id: Optional[str] = None


def _split_message_and_embedded_attachments(
    raw_message: str,
    explicit_attachments: Optional[list[dict]] = None,
) -> tuple[str, list[dict], str]:
    """Separa o texto visível da mensagem do usuário de anexos embutidos ou explícitos.

    Retorna:
      - clean_visible_message: texto limpo para exibição e persistência em chat_messages.content
      - metadata_attachments: lista de metadados dos anexos para chat_messages.attachments (sem despejar conteúdo gigante no balão)
      - llm_full_prompt: prompt enriquecido com o texto extraído dos anexos exclusivamente para o modelo de IA
    """
    msg = raw_message or ""
    extracted_blocks: List[Dict[str, Any]] = []

    # Defesa em profundidade: se um cliente legado concatenou '--- Conteúdo do Arquivo (nome) ---' no prompt, extrai e separa!
    delimited_pattern = re.compile(
        r"---\s*Conteúdo do Arquivo\s*\(([^)]+)\)\s*---\r?\n([\s\S]*?)\r?\n---\s*Fim de\s+[^\r\n-]+---"
    )
    if delimited_pattern.search(msg):
        for m in delimited_pattern.finditer(msg):
            fname = m.group(1).strip()
            fcontent = m.group(2).strip()
            extracted_blocks.append({
                "name": fname,
                "type": "text/plain",
                "size": len(fcontent.encode("utf-8")),
                "extracted_text": fcontent[:15000],
            })
        clean_msg = delimited_pattern.sub("", msg).strip()
    else:
        pattern = re.compile(r"\n*---\s*Conteúdo do Arquivo\s*\(([^)]+)\)\s*---\n([\s\S]*?)(?=\n*---\s*Conteúdo do Arquivo\s*\(|$)")
        matches = list(pattern.finditer(msg))
        if matches:
            clean_msg = msg[: matches[0].start()].strip()
            for m in matches:
                fname = m.group(1).strip()
                fcontent = m.group(2).strip()
                extracted_blocks.append({
                    "name": fname,
                    "type": "text/plain",
                    "size": len(fcontent.encode("utf-8")),
                    "extracted_text": fcontent[:15000],
                })
        else:
            clean_msg = msg.strip()

    all_attachments: List[Dict[str, Any]] = []
    llm_attachment_sections: List[str] = []

    for att in (explicit_attachments or []) + extracted_blocks:
        if not isinstance(att, dict):
            continue
        name = str(att.get("name") or "arquivo").strip()
        mime = str(att.get("type") or att.get("mime_type") or "application/octet-stream").strip()
        size = int(att.get("size") or 0)
        ext_text = str(att.get("extracted_text") or att.get("textPreview") or att.get("content") or "").strip()

        # Metadados salvos em chat_messages.attachments (inclui preview curto seguro para inspeção, nunca no balão principal)
        all_attachments.append({
            "id": att.get("id") or f"att_{uuid.uuid4().hex[:8]}",
            "name": name,
            "type": mime,
            "size": size,
            "has_extracted_text": bool(ext_text),
            "preview_snippet": ext_text[:300] if ext_text else None,
            "extracted_text": ext_text[:300] if ext_text else None,
        })
        if ext_text:
            llm_attachment_sections.append(f"--- Conteúdo do Arquivo ({name}) ---\n{ext_text[:15000]}")

    if not clean_msg and all_attachments:
        names_str = ", ".join(a["name"] for a in all_attachments)
        clean_msg = f"Arquivo anexado: {names_str}"

    llm_prompt = clean_msg
    if llm_attachment_sections:
        llm_prompt = f"{clean_msg}\n\n" + "\n\n".join(llm_attachment_sections)

    return clean_msg, all_attachments, llm_prompt


async def _load_thread_history(thread_id: str, limit: int = 30, user_id: Optional[str] = None) -> list[dict]:
    """Carrega o histórico real de mensagens da conversa (chat_messages com validação de titularidade)."""
    if not thread_id:
        return []
    pool = await get_or_init_db_pool()
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
    **extra_kwargs,
):
    """Despacha a persistência da mensagem de forma unificada e atômica."""
    from api.services.chat_persistence import save_chat_message_record

    kwargs = {
        "pool": pool,
        "session_id": session_id,
        "user_id": user_id,
        "role": role,
        "content": content,
        "model": model,
        "tokens": tokens,
        **extra_kwargs,
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
    request_id: Optional[str] = None,
    attachments: Optional[list[dict]] = None,
    skip_user_message_save: bool = False,
) -> str:
    """Garante a existência da sessão em chat_sessions e persiste IMEDIATAMENTE a mensagem do usuário antes do stream."""
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

    clean_msg, meta_attachments, _ = _split_message_and_embedded_attachments(message, attachments)

    from api.services.chat_persistence import ensure_session_record, save_chat_message_record
    try:
        # Garante a existência imediata da sessão (tanto no PostgreSQL quanto no store em memória) com validação de posse
        await ensure_session_record(pool, session_id=sid, user_id=u_id_str, user_email=u_email, prompt=clean_msg or message)
    except PermissionError as pe:
        logger.warning(f"[chat] Tentativa de invasão ou acesso indevido à sessão {sid} por {u_id_str}: {pe}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado: esta conversa pertence a outro usuário.",
        )

    # Persistência SÍNCRONA antes do início do StreamingResponse para nunca perder a mensagem se a conexão cair
    if not skip_user_message_save and ((clean_msg and clean_msg.strip()) or meta_attachments):
        await save_chat_message_record(
            pool=pool,
            session_id=sid,
            user_id=u_id_str,
            role="user",
            content=clean_msg,
            status="completed",
            request_id=request_id,
            attachments=meta_attachments,
        )

    return sid


async def _store_assistant_message(
    thread_id: str,
    reply: str,
    user_id: Optional[str] = None,
    model: Optional[str] = None,
    tokens: Optional[int] = None,
    background_tasks: Optional[BackgroundTasks] = None,
    status: str = "completed",
    request_id: Optional[str] = None,
    message_id: Optional[str] = None,
    error_detail: Optional[str] = None,
):
    """Persiste ou atualiza a resposta final do Charlie (role: assistant) em chat_messages com estado, modelo e tokens."""
    pool = await get_or_init_db_pool()
    u_id_str = str(user_id) if user_id else "default"
    m_name = model or "gemini-2.5-flash"

    from api.services.chat_persistence import update_chat_message_state, save_chat_message_record
    if message_id or request_id:
        updated_id = await update_chat_message_state(
            pool=pool,
            session_id=thread_id,
            message_id=message_id,
            request_id=request_id,
            role="assistant",
            content=reply,
            status=status,
            model=m_name,
            tokens=tokens,
            error_detail=error_detail,
        )
        if updated_id:
            return updated_id

    if not reply or not reply.strip():
        return None

    return await save_chat_message_record(
        pool=pool,
        session_id=thread_id,
        user_id=u_id_str,
        role="assistant",
        content=reply,
        model=m_name,
        tokens=tokens,
        status=status,
        request_id=request_id,
        error_detail=error_detail,
        message_id=message_id,
    )


def _extract_ip(req: Request) -> str:
    """Extrai o IP real do cliente mesmo através de proxies e CDN da Vercel."""
    forwarded = req.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return req.client.host if req.client else "127.0.0.1"


# ================= Endpoints =================

@router.post("/cancel")
async def cancel_chat_stream(
    data: CancelChatRequest,
    user: dict = Depends(get_current_user),
):
    """Cancela imediatamente a geração em andamento (por request_id ou thread_id) garantindo titularidade do usuário."""
    uid = str(user["id"])
    target_req_id = (data.request_id or "").strip()
    target_thread_id = (data.thread_id or data.session_id or "").strip()

    cancelled_ids: list[str] = []
    foreign_found = False

    for req_id, info in list(_active_streams.items()):
        matches_req = bool(target_req_id and req_id == target_req_id)
        matches_thread = bool(target_thread_id and info.get("thread_id") == target_thread_id)
        if matches_req or matches_thread or (not target_req_id and not target_thread_id and info.get("user_id") == uid):
            if info.get("user_id") != uid:
                foreign_found = True
                continue
            info["cancel_event"].set()
            cancelled_ids.append(req_id)

    if foreign_found and not cancelled_ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não tem permissão para cancelar a geração de outro usuário.",
        )

    # Atualiza imediatamente qualquer mensagem in_progress correspondente caso o gerador já tenha encerrado
    if target_thread_id:
        pool = await get_or_init_db_pool()
        from api.services.chat_persistence import update_chat_message_state
        await update_chat_message_state(
            pool=pool,
            session_id=target_thread_id,
            request_id=target_req_id or None,
            role="assistant",
            status="cancelled",
        )

    state.set_status(CharlieStatus.IDLE, user_id=uid)
    return {
        "ok": True,
        "status": "cancelled",
        "cancelled_count": len(cancelled_ids),
        "cancelled_request_ids": cancelled_ids,
    }


@router.post("")
async def chat_post(
    req: ChatRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    """Processa uma mensagem de texto de forma síncrona com idempotência por request_id."""
    from api.security.rate_limiter import rate_limiter, check_user_quota_and_status, get_global_operational_limits

    uid = str(user["id"])
    client_ip = _extract_ip(request)
    await check_user_quota_and_status(uid, user.get("email"))
    limits = get_global_operational_limits()
    await rate_limiter.enforce(
        f"chat_post:{uid}:{client_ip}",
        limit=int(limits.get("chat_rate_limit_per_min", 20)),
        window_seconds=60,
        detail="Você enviou muitas mensagens em pouco tempo. Aguarde alguns instantes antes de tentar novamente.",
    )

    req_id = (req.request_id or "").strip() or f"req_{uuid.uuid4().hex[:12]}"
    clean_msg, _, llm_prompt = _split_message_and_embedded_attachments(req.message, req.attachments)

    pipeline = get_pipeline()
    thread_id = await _prepare_session_and_store_user_message(
        req.message,
        thread_id=req.thread_id,
        session_id=req.session_id,
        user=user,
        background_tasks=background_tasks,
        request_id=req_id,
        attachments=req.attachments,
        skip_user_message_save=req.skip_user_message_save,
    )

    thread_history = await _load_thread_history(thread_id, user_id=uid)
    if not thread_history and req.history:
        thread_history = req.history

    t_start = time.perf_counter()
    state.set_status(CharlieStatus.THINKING, details={"active_thread_id": thread_id}, user_id=uid)
    msg_status = "completed"
    err_detail = None
    try:
        reply = await pipeline.run_pipeline(
            llm_prompt or clean_msg,
            skip_tts=req.skip_tts,
            thread_id=thread_id,
            user_id=uid,
            user_name=user.get("name"),
            history=thread_history,
            images=req.images,
        )
    except Exception as e:
        logger.exception("Erro no pipeline: %s", e)
        state.set_status(CharlieStatus.ERROR, user_id=uid)
        msg_status = "failed"
        err_detail = str(e)
        reply = "Desculpe, ocorreu um erro temporário ao processar sua mensagem. Tente novamente em instantes."
    finally:
        state.set_status(CharlieStatus.IDLE, user_id=uid)

    latency_ms = int((time.perf_counter() - t_start) * 1000)
    model_used = getattr(pipeline, "last_model_used", "gemini-2.5-flash")
    from api.services.audit_service import estimate_tokens
    tokens_count = estimate_tokens(reply)

    if reply.strip() not in (
        "Comando de dispositivo enviado para execução no seu computador.",
        "Comando de dispositivo despachado para o seu computador com sucesso.",
    ):
        await _store_assistant_message(
            thread_id=thread_id,
            reply=reply,
            user_id=uid,
            model=model_used,
            tokens=tokens_count,
            background_tasks=background_tasks,
            status=msg_status,
            request_id=req_id,
            error_detail=err_detail,
        )

    # Gravação assíncrona de telemetria e custo em USD
    try:
        from api.services.audit_service import record_audit_log
        background_tasks.add_task(
            record_audit_log,
            user_id=uid,
            user_email=user.get("email") or "usuario@teste.com",
            user_prompt=clean_msg or req.message,
            model_response=reply,
            ip_address=client_ip,
            session_id=thread_id,
            model_name=model_used,
            latency_ms=latency_ms,
            route_mode=getattr(pipeline, "last_route_mode", "FAST"),
            provider_name=getattr(pipeline, "last_provider_used", "gemini"),
            fallback_used=bool(getattr(pipeline, "last_fallback_used", False)),
            fallback_reason=getattr(pipeline, "last_fallback_reason", None),
            status=msg_status,
            error_category=(err_detail[:80] if err_detail else None),
            usage_metadata=getattr(pipeline, "last_usage_metadata", None),
        )
    except Exception as audit_err:
        logger.warning(f"Aviso ao registrar audit log: {audit_err}")

    return {
        "reply": reply,
        "thread_id": thread_id,
        "session_id": thread_id,
        "request_id": req_id,
        "latency_ms": latency_ms,
        "status": "success" if msg_status == "completed" else msg_status,
    }


@router.post("/stream")
async def chat_stream_sse(
    req: ChatRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    """Endpoint de streaming em tempo real via Server-Sent Events (SSE) com suporte a cancelamento ponta a ponta e estados de mensagem."""
    from api.security.rate_limiter import rate_limiter, check_user_quota_and_status, get_global_operational_limits

    uid = str(user["id"])
    client_ip = _extract_ip(request)
    await check_user_quota_and_status(uid, user.get("email"))
    limits = get_global_operational_limits()
    await rate_limiter.enforce(
        f"chat_stream:{uid}:{client_ip}",
        limit=int(limits.get("chat_rate_limit_per_min", 20)),
        window_seconds=60,
        detail="Você enviou muitas mensagens em pouco tempo. Aguarde alguns instantes antes de tentar novamente.",
    )

    req_id = (req.request_id or "").strip() or f"req_{uuid.uuid4().hex[:12]}"
    clean_msg, _, llm_prompt = _split_message_and_embedded_attachments(req.message, req.attachments)

    pipeline = get_pipeline()
    thread_id = await _prepare_session_and_store_user_message(
        req.message,
        thread_id=req.thread_id,
        session_id=req.session_id,
        user=user,
        background_tasks=background_tasks,
        request_id=req_id,
        attachments=req.attachments,
        skip_user_message_save=req.skip_user_message_save,
    )

    thread_history = await _load_thread_history(thread_id, user_id=uid)
    if not thread_history and req.history:
        thread_history = req.history

    # Cria placeholder 'in_progress' da mensagem do assistente antes de iniciar o stream
    pool = await get_or_init_db_pool()
    from api.services.chat_persistence import save_chat_message_record
    assistant_msg_id = await save_chat_message_record(
        pool=pool,
        session_id=thread_id,
        user_id=uid,
        role="assistant",
        content="",
        status="in_progress",
        request_id=req_id,
    )

    cancel_event = threading.Event()
    _active_streams[req_id] = {
        "user_id": uid,
        "thread_id": thread_id,
        "request_id": req_id,
        "cancel_event": cancel_event,
        "assistant_msg_id": assistant_msg_id,
        "started_at": time.time(),
    }

    async def event_generator():
        final_reply = ""
        final_model = getattr(pipeline, "last_model_used", "gemini-2.5-flash")
        completed_normally = False
        was_cancelled = False
        had_error = False
        error_detail: Optional[str] = None
        t_start = time.perf_counter()
        ttft_ms: Optional[int] = None

        state.set_status(CharlieStatus.THINKING, details={"active_thread_id": thread_id}, user_id=uid)

        # Emite metadados iniciais do stream (request_id, thread_id, assistant_message_id)
        yield StreamEvent(
            type="stream_start",
            data={
                "request_id": req_id,
                "thread_id": thread_id,
                "assistant_message_id": assistant_msg_id,
            },
        ).to_sse()

        try:
            import inspect
            stream_kwargs: Dict[str, Any] = {
                "thread_id": thread_id,
                "user_id": uid,
                "user_name": user.get("name"),
                "tool_results": req.tool_results,
                "history": thread_history,
                "images": req.images,
            }
            try:
                sig = inspect.signature(pipeline.run_pipeline_stream)
                if "cancel_event" in sig.parameters or any(
                    p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()
                ):
                    stream_kwargs["cancel_event"] = cancel_event
            except Exception:
                pass

            async for ev in pipeline.run_pipeline_stream(
                llm_prompt or clean_msg,
                **stream_kwargs,
            ):
                if cancel_event.is_set():
                    was_cancelled = True
                    break

                try:
                    if await request.is_disconnected():
                        cancel_event.set()
                        break
                except Exception:
                    pass

                if ev.type == "token":
                    if ttft_ms is None:
                        ttft_ms = int((time.perf_counter() - t_start) * 1000)
                    final_reply += ev.data.get("token", "")
                elif ev.type == "reset_and_fallback":
                    final_reply = ""
                    if ev.data.get("fallback_model"):
                        final_model = ev.data.get("fallback_model")
                elif ev.type == "cancelled":
                    was_cancelled = True
                    final_reply = ev.data.get("reply", final_reply)
                    yield ev.to_sse()
                    break
                elif ev.type == "error":
                    had_error = True
                    error_detail = getattr(pipeline, "last_error_detail", None) or ev.data.get("error")
                elif ev.type == "done":
                    completed_normally = True
                    final_reply = ev.data.get("reply", final_reply)
                    if ev.data.get("model"):
                        final_model = ev.data.get("model")
                    ev.data["request_id"] = req_id
                    ev.data["assistant_message_id"] = assistant_msg_id
                    ev.data["status"] = "completed"

                yield ev.to_sse()
        except (asyncio.CancelledError, GeneratorExit):
            cancel_event.set()
            was_cancelled = was_cancelled or cancel_event.is_set()
        except Exception as e:
            logger.exception("Erro durante streaming SSE: %s", e)
            had_error = True
            error_detail = str(e)
            state.set_status(CharlieStatus.ERROR, user_id=uid)
            yield StreamEvent(
                type="error",
                data={"error": "Ocorreu um erro temporário ao gerar a resposta. Tente novamente."},
            ).to_sse()
        finally:
            _active_streams.pop(req_id, None)
            state.set_status(CharlieStatus.IDLE, user_id=uid)

            if was_cancelled or cancel_event.is_set():
                final_status = "cancelled"
            elif had_error and not completed_normally:
                final_status = "failed"
            elif completed_normally:
                final_status = "completed"
            else:
                final_status = "interrupted"

            # Suprime gravação no banco de mensagens transitórias de transporte de dispositivo
            if (final_reply or "").strip() in (
                "Comando de dispositivo enviado para execução no seu computador.",
                "Comando de dispositivo despachado para o seu computador com sucesso.",
            ):
                return

            from api.services.audit_service import estimate_tokens
            tokens_count = estimate_tokens(final_reply) if final_reply else 0

            await _store_assistant_message(
                thread_id=thread_id,
                reply=final_reply,
                user_id=uid,
                model=final_model,
                tokens=tokens_count,
                background_tasks=background_tasks,
                status=final_status,
                request_id=req_id,
                message_id=assistant_msg_id,
                error_detail=error_detail,
            )

            if (final_reply and final_reply.strip()) or final_status in ("failed", "cancelled", "interrupted"):
                try:
                    stream_latency_ms = int((time.perf_counter() - t_start) * 1000)
                    from api.services.audit_service import record_audit_log
                    asyncio.create_task(
                        record_audit_log(
                            user_id=uid,
                            user_email=user.get("email") or "usuario@teste.com",
                            user_prompt=clean_msg or req.message,
                            model_response=final_reply or f"[{final_status}]",
                            ip_address=client_ip,
                            session_id=thread_id,
                            model_name=final_model,
                            latency_ms=stream_latency_ms,
                            ttft_ms=ttft_ms or stream_latency_ms,
                            route_mode=getattr(pipeline, "last_route_mode", "FAST"),
                            provider_name=getattr(pipeline, "last_provider_used", "gemini"),
                            fallback_used=bool(getattr(pipeline, "last_fallback_used", False)),
                            fallback_reason=getattr(pipeline, "last_fallback_reason", None),
                            status=final_status,
                            error_category=(error_detail[:80] if error_detail else None),
                            usage_metadata=getattr(pipeline, "last_usage_metadata", None),
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
            "X-Request-Id": req_id,
            "X-Thread-Id": thread_id,
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

    # Envia estado inicial isolado por usuário (ou sanitizado se ainda não autenticado)
    ws_uid = str(ws_user["id"]) if ws_user else None
    await websocket.send_json({
        "type": "state",
        "data": state.to_dict(user_id=ws_uid, include_sensitive=(ws_user is not None)),
    })

    loop = asyncio.get_running_loop()

    def on_state_change(_data):
        curr_uid = str(ws_user["id"]) if ws_user else None
        isolated_state = state.to_dict(user_id=curr_uid, include_sensitive=(ws_user is not None))
        asyncio.run_coroutine_threadsafe(
            websocket.send_json({"type": "state", "data": isolated_state}),
            loop,
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
                if is_desktop_broker_client and ws_user:
                    call_id = data.get("call_id")
                    res = data.get("result")
                    device_broker.resolve_tool_result(call_id, res, user_id=str(ws_user["id"]))
            elif msg_type == "chat":
                if not ws_user:
                    await websocket.send_json({"type": "error", "data": {"error": "Autenticação obrigatória para enviar mensagens."}})
                    continue
                uid = str(ws_user["id"])
                try:
                    from api.security.rate_limiter import rate_limiter, check_user_quota_and_status, get_global_operational_limits
                    await check_user_quota_and_status(uid, ws_user.get("email"))
                    limits = get_global_operational_limits()
                    await rate_limiter.enforce(
                        f"chat_ws:{uid}",
                        limit=int(limits.get("chat_rate_limit_per_min", 20)),
                        window_seconds=60,
                        detail="Muitas mensagens enviadas em sequência. Aguarde alguns instantes.",
                    )
                except HTTPException as rl_err:
                    await websocket.send_json({"type": "error", "data": {"error": rl_err.detail}})
                    continue

                text = data.get("message", "")
                thread_id_in = data.get("thread_id") or data.get("session_id")
                try:
                    thread_id = await _prepare_session_and_store_user_message(text, thread_id=thread_id_in, user=ws_user)
                except HTTPException as he:
                    logger.warning(f"[chat_ws] Bloqueio de acesso à sessão {thread_id_in} por {uid}: {he.detail}")
                    await websocket.send_json({"type": "error", "data": {"error": he.detail}})
                    continue
                presence_manager.register_or_heartbeat(client_id=client_id, active_thread_id=thread_id)

                thread_history = await _load_thread_history(thread_id, user_id=uid)
                if not thread_history and data.get("history"):
                    thread_history = data.get("history")

                final_reply = ""
                final_model = getattr(pipeline, "last_model_used", "gemini-3.1-flash-lite")
                state.set_status(CharlieStatus.THINKING, details={"active_thread_id": thread_id}, user_id=uid)

                try:
                    async for ev in pipeline.run_pipeline_stream(
                        text,
                        thread_id=thread_id,
                        user_id=uid,
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
                    logger.exception("Erro no streaming WS: %s", e)
                    state.set_status(CharlieStatus.ERROR, user_id=uid)
                    await websocket.send_json({
                        "type": "error",
                        "data": {"error": "Ocorreu um erro temporário ao gerar a resposta."},
                    })
                finally:
                    state.set_status(CharlieStatus.IDLE, user_id=uid)
                    if final_reply and final_reply.strip():
                        from api.services.audit_service import estimate_tokens
                        await _store_assistant_message(
                            thread_id=thread_id,
                            reply=final_reply,
                            user_id=uid,
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
