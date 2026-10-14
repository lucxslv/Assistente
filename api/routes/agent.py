"""Rotas FastAPI para o Charlie Agentic Runtime (Objetivos, Grafo de Tarefas e Streaming SSE)."""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.routes.auth import require_local_or_authenticated
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
async def start_goal(req: GoalRequest, user: dict = Depends(require_local_or_authenticated)):
    """Inicia um novo objetivo para o Charlie Agent Runtime."""
    uid = str(user.get("id", "default"))
    graph = await agent_runtime.start_session(goal=req.goal, project=req.project or "Charlie")
    graph_dict = graph.to_dict()
    graph_dict["user_id"] = uid
    # Salva no banco SQLite
    try:
        agent_persistence.save_session(graph_dict, user_id=uid)
    except Exception as e:
        logger.warning(f"Erro ao persistir sessão SQLite: {e}")

    return {
        "status": "success",
        "goal": req.goal,
        "tasks_count": len(graph.nodes),
        "graph": graph_dict,
    }


@router.get("/session")
async def get_active_session(user: dict = Depends(require_local_or_authenticated)):
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
async def save_session_snapshot(req: SessionSaveRequest, user: dict = Depends(require_local_or_authenticated)):
    """Salva ou atualiza um snapshot da sessão no banco SQLite."""
    uid = str(user.get("id", "default"))
    try:
        agent_persistence.save_session(req.session, user_id=uid)
    except PermissionError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado: esta sessão pertence a outro usuário.",
        )
    return {"status": "saved", "id": req.session.get("id")}


@router.get("/sessions")
async def list_sessions(
    limit: int = 50,
    offset: int = 0,
    status_filter: Optional[str] = None,
    status: Optional[str] = None,
    user: dict = Depends(require_local_or_authenticated),
):
    """Lista histórico de sessões arquivadas no banco SQLite."""
    uid = str(user.get("id", "default"))
    sessions = agent_persistence.list_sessions(
        limit=limit,
        offset=offset,
        status=status or status_filter,
        user_id=uid,
    )
    return {"sessions": sessions, "count": len(sessions)}


@router.get("/sessions/{session_id}")
async def get_session_by_id(session_id: str, user: dict = Depends(require_local_or_authenticated)):
    """Recupera os detalhes completos de uma sessão passada."""
    uid = str(user.get("id", "default"))
    data = agent_persistence.get_session(session_id, user_id=uid)
    if not data:
        return {"found": False, "session": None}
    return {"found": True, "session": data}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, user: dict = Depends(require_local_or_authenticated)):
    """Remove uma sessão do histórico SQLite."""
    uid = str(user.get("id", "default"))
    deleted = agent_persistence.delete_session(session_id, user_id=uid)
    return {"status": "deleted" if deleted else "not_found"}


@router.get("/metrics")
async def get_agent_metrics(user: dict = Depends(require_local_or_authenticated)):
    """Retorna métricas agregadas de taxa de sucesso, tarefas e sessões."""
    uid = str(user.get("id", "default"))
    return agent_persistence.get_metrics(user_id=uid)


@router.post("/pause")
async def pause_agent(user: dict = Depends(require_local_or_authenticated)):
    agent_runtime.pause()
    await agent_runtime.emit_event("agent.paused", {})
    return {"status": "paused"}


@router.post("/resume")
async def resume_agent(user: dict = Depends(require_local_or_authenticated)):
    agent_runtime.resume()
    await agent_runtime.emit_event("agent.resumed", {})
    return {"status": "resumed"}


@router.post("/cancel")
async def cancel_agent(user: dict = Depends(require_local_or_authenticated)):
    agent_runtime.cancel()
    await agent_runtime.emit_event("agent.failed", {"reason": "Cancelado via API"})
    return {"status": "cancelled"}


@router.get("/stream")
async def agent_events_stream(user: dict = Depends(require_local_or_authenticated)):
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


class PermissionResolveRequest(BaseModel):
    approved: bool
    reason: Optional[str] = None


@router.get("/permissions/pending")
async def get_pending_permissions(user: dict = Depends(require_local_or_authenticated)):
    """Lista permissões de sistema que aguardam autorização do usuário."""
    from brain.agent.governance import permission_gate
    uid = str(user.get("id")) if user and user.get("id") != "local-loopback" else None
    return {"pending": permission_gate.get_pending_requests(user_id=uid)}


@router.post("/permissions/{permission_id}/resolve")
async def resolve_permission(
    permission_id: str,
    req: PermissionResolveRequest,
    user: dict = Depends(require_local_or_authenticated),
):
    """Aprova ou rejeita uma ação de risco solicitada pelo Charlie Agent Runtime."""
    from brain.agent.governance import permission_gate
    user_name = (user or {}).get("name") or "Usuário"
    uid = str(user.get("id")) if user and user.get("id") != "local-loopback" else None
    success = permission_gate.resolve_permission(
        permission_id=permission_id,
        approved=req.approved,
        user_name=user_name,
        reason=req.reason,
        user_id=uid,
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Permissão não encontrada, expirada ou pertencente a outro usuário.",
        )
    return {"status": "resolved", "approved": req.approved, "permission_id": permission_id}

