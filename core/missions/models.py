"""Modelos de dados para missões multi-tenant."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class AgentSession(BaseModel):
    """Sessão de missão persistida no Postgres."""
    id: str
    user_id: str
    thread_id: str
    goal: str
    status: str = "pending"  # pending, running, paused, completed, failed
    graph_json: Dict[str, Any] = Field(default_factory=dict)
    state_json: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


class AgentPermission(BaseModel):
    """Permissão pendente para execução de tool de risco."""
    id: str
    session_id: str
    task_id: str
    tool: str
    risk_level: str  # low, medium, high, critical
    status: str = "pending"  # pending, approved, rejected, expired
    requested_at: datetime
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
