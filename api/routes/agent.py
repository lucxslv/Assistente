"""Rotas FastAPI para o Charlie Agentic Runtime (Objetivos, Grafo de Tarefas e Streaming SSE)."""

import logging
from typing import Optional
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.routes.auth import get_current_user_optional
from brain.agent.runtime import agent_runtime

logger = logging.getLogger("charlie.api.agent")
router = APIRouter(prefix="/agent", tags=["Agent Runtime"])


class GoalRequest(BaseModel):
    goal: str
    project: Optional[str] = "Charlie"


@router.post("/goal")
async def start_goal(req: GoalRequest, user: Optional[dict] = Depends(get_current_user_optional)):
    """Inicia um novo objetivo para o Charlie Agent Runtime."""
    graph = await agent_runtime.start_session(goal=req.goal, project=req.project or "Charlie")
    return {
        "status": "success",
        "goal": req.goal,
        "tasks_count": len(graph.nodes),
        "graph": graph.to_dict(),
    }


@router.get("/session")
async def get_active_session():
    """Retorna o estado do Grafo de Tarefas e da sessão ativa."""
    if not agent_runtime.active_graph:
        return {"active": False, "session": None}

    return {
        "active": True,
        "session": agent_runtime.active_graph.to_dict(),
        "is_paused": agent_runtime.is_paused,
        "is_cancelled": agent_runtime.is_cancelled,
    }


@router.post("/pause")
async def pause_agent():
    agent_runtime.pause()
    await agent_runtime.emit_event("agent.paused", {})
    return {"status": "paused"}


@router.post("/resume")
async def resume_agent():
    agent_runtime.resume()
    await agent_runtime.emit_event("agent.resumed", {})
    return {"status": "resumed"}


@router.post("/cancel")
async def cancel_agent():
    agent_runtime.cancel()
    await agent_runtime.emit_event("agent.failed", {"reason": "Cancelado via API"})
    return {"status": "cancelled"}


@router.get("/stream")
async def agent_events_stream():
    """Streaming de eventos em tempo real do Agent Runtime via SSE."""
    return StreamingResponse(
        agent_runtime.event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
