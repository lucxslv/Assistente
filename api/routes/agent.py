"""Rotas FastAPI para o Charlie Agentic Runtime (Objetivos, Grafo de Tarefas e Streaming SSE)."""

import logging
from typing import Optional
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.routes.auth import get_current_user_optional
from brain.agent.runtime import agent_runtime
from brain.agent.persistence import agent_persistence

logger = logging.getLogger("charlie.api.agent")
router = APIRouter(prefix="/agent", tags=["Agent Runtime"])


class GoalRequest(BaseModel):
    goal: str
    project: Optional[str] = "Charlie"


class SessionSaveRequest(BaseModel):
    session: dict


@router.post("/goal")
async def start_goal(req: GoalRequest, user: Optional[dict] = Depends(get_current_user_optional)):
    """Inicia um novo objetivo para o Charlie Agent Runtime."""
    graph = await agent_runtime.start_session(goal=req.goal, project=req.project or "Charlie")
    graph_dict = graph.to_dict()
    # Salva no banco SQLite
    try:
        agent_persistence.save_session(graph_dict)
    except Exception as e:
        logger.warning(f"Erro ao persistir sessão SQLite: {e}")

    return {
        "status": "success",
        "goal": req.goal,
        "tasks_count": len(graph.nodes),
        "graph": graph_dict,
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


@router.post("/sessions")
async def save_session_snapshot(req: SessionSaveRequest):
    """Salva ou atualiza um snapshot da sessão no banco SQLite."""
    agent_persistence.save_session(req.session)
    return {"status": "saved", "id": req.session.get("id")}


@router.get("/sessions")
async def list_sessions(limit: int = 50, offset: int = 0, status: Optional[str] = None):
    """Lista histórico de sessões arquivadas no banco SQLite."""
    sessions = agent_persistence.list_sessions(limit=limit, offset=offset, status=status)
    return {"sessions": sessions, "count": len(sessions)}


@router.get("/sessions/{session_id}")
async def get_session_by_id(session_id: str):
    """Recupera os detalhes completos de uma sessão passada."""
    data = agent_persistence.get_session(session_id)
    if not data:
        return {"found": False, "session": None}
    return {"found": True, "session": data}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Remove uma sessão do histórico SQLite."""
    deleted = agent_persistence.delete_session(session_id)
    return {"status": "deleted" if deleted else "not_found"}


@router.get("/metrics")
async def get_agent_metrics():
    """Retorna métricas agregadas de taxa de sucesso, tarefas e sessões."""
    return agent_persistence.get_metrics()


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
