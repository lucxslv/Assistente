"""Modelos de dados para missões multi-tenant."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from typing_extensions import Literal


class AgentSession(BaseModel):
    """Sessão de missão multi-tenant persistida no Postgres."""
    
    id: str
    user_id: str
    thread_id: str
    goal: str
    status: Literal["pending", "running", "paused", "completed", "failed"]
    graph_json: dict  # TaskGraph serializado
    state_json: dict  # working_memory, completed_call_ids, step_count, etc.
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
