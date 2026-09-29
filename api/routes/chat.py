"""Rotas de conversação (Chat REST, SSE Streaming e WebSocket)."""

import asyncio
import datetime
import json
import logging
import platform
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.db import get_db_pool
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
    message: str
    thread_id: Optional[str] = None
    skip_tts: bool = True


async def _prepare_thread_and_store_user_message(message: str, thread_id: Optional[str] = None) -> str:
    """Garante a existência da thread e persiste a mensagem do usuário no Supabase."""
    pool = get_db_pool()
    now = datetime.datetime.now(datetime.timezone.utc)

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
            existing = await conn.fetchrow('SELECT id, name FROM "Thread" WHERE id = $1', t_uuid)
            title = message[:35] + ("..." if len(message) > 35 else "")
            if not existing:
                await conn.execute("""
                    INSERT INTO "Thread" (id, name, "createdAt", "updatedAt", metadata)
                    VALUES ($1, $2, $3, $4, $5)
                """, t_uuid, title, now, now, json.dumps({}))
            elif existing["name"] in ("Novo Chat", None, ""):
                await conn.execute("""
                    UPDATE "Thread" SET name = $1, "updatedAt" = $2 WHERE id = $3
                """, title, now, t_uuid)
            else:
                await conn.execute("""
                    UPDATE "Thread" SET "updatedAt" = $1 WHERE id = $2
                """, now, t_uuid)

            # Salva mensagem do usuário
            user_msg_id = str(uuid.uuid4())
            await conn.execute("""
                INSERT INTO "Step" (id, "threadId", name, type, output, "createdAt")
                VALUES ($1, $2, $3, $4, $5, $6)
            """, uuid.UUID(user_msg_id), t_uuid, "Usuário", "user_message", message, now)

    return thread_id


async def _store_assistant_message(thread_id: str, reply: str):
    """Persiste a resposta final do Charlie no Supabase."""
    pool = get_db_pool()
    if pool and reply:
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


# ================= Endpoints =================

@router.post("")
async def chat_post(req: ChatRequest):
    """Processa uma mensagem de texto de forma síncrona (espera resposta completa)."""
    pipeline = get_pipeline()
    thread_id = await _prepare_thread_and_store_user_message(req.message, req.thread_id)

    state.set_status(CharlieStatus.THINKING)
    try:
        reply = await pipeline.run_pipeline(req.message, skip_tts=req.skip_tts)
    except Exception as e:
        logger.exception("Erro no pipeline")
        state.set_status(CharlieStatus.ERROR)
        reply = f"Desculpe, ocorreu um erro ao processar sua mensagem: {e}"
    finally:
        state.set_status(CharlieStatus.IDLE)

    await _store_assistant_message(thread_id, reply)

    return {
        "reply": reply,
        "thread_id": thread_id,
        "status": "success",
    }


@router.post("/stream")
async def chat_stream_sse(req: ChatRequest):
    """Endpoint de streaming em tempo real via Server-Sent Events (SSE)."""
    pipeline = get_pipeline()
    thread_id = await _prepare_thread_and_store_user_message(req.message, req.thread_id)

    async def event_generator():
        final_reply = ""
        state.set_status(CharlieStatus.THINKING)

        try:
            async for ev in pipeline.run_pipeline_stream(req.message, thread_id=thread_id):
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
            await _store_assistant_message(thread_id, final_reply)

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
        platform=platform.system(),
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

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "ping":
                presence_manager.register_or_heartbeat(client_id=client_id)
                await websocket.send_json({"type": "pong"})
            elif msg_type == "device_tool_result":
                call_id = data.get("call_id")
                res = data.get("result")
                device_broker.resolve_tool_result(call_id, res)
            elif msg_type == "chat":
                text = data.get("message", "")
                thread_id_in = data.get("thread_id")
                thread_id = await _prepare_thread_and_store_user_message(text, thread_id_in)
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
