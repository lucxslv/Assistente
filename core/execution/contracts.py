"""Contratos de execução do runtime agêntico."""

from __future__ import annotations
import enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ToolCallStatus(str, enum.Enum):
    """Estados possíveis de uma chamada de ferramenta."""
    QUEUED = "queued"
    DELIVERED = "delivered"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    TIMEOUT = "timeout"
    UNAVAILABLE = "unavailable"


class ToolCall(BaseModel):
    """Representa uma chamada de ferramenta a ser executada."""
    call_id: str = Field(..., description="Identificador único da chamada")
    name: str = Field(..., description="Nome da ferramenta")
    arguments: Dict[str, Any] = Field(default_factory=dict, description="Argumentos da ferramenta")


class ToolResult(BaseModel):
    """Resultado da execução de uma ferramenta."""
    call_id: str = Field(..., description="Identificador da chamada original")
    status: str = Field(..., description="Status: success, error, unavailable, timeout, etc.")
    output: str = Field(..., description="Saída da ferramenta ou mensagem de erro")
    friendly_name: str = Field(default="", description="Nome amigável para exibição")
    duration_ms: int = Field(default=0, description="Duração da execução em ms")
    error_type: Optional[str] = Field(default=None, description="Tipo de erro se falhou")
    is_recoverable: bool = Field(default=False, description="Se o erro é recuperável")
    host_id: Optional[str] = Field(default=None, description="ID do host que executou")


class HostInfo(BaseModel):
    """Informações sobre um host executor disponível."""
    host_id: str = Field(..., description="Identificador único do host")
    name: str = Field(..., description="Nome amigável do host")
    capabilities: List[str] = Field(default_factory=list, description="Lista de ferramentas que o host suporta")
    last_seen_at: float = Field(..., description="Timestamp do último heartbeat")
    online: bool = Field(..., description="Se o host está online atualmente")