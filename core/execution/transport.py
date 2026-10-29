"""Transporte de execução - protocolo e fábrica."""

from __future__ import annotations
from typing import List, Protocol, TYPE_CHECKING

from core.execution.contracts import ToolCall, ToolResult, HostInfo

if TYPE_CHECKING:
    from core.execution.local import LocalExecutor

# Importar LocalExecutor em tempo de execução para testes (evita import circular com local.py)
from core.execution.local import LocalExecutor


class ExecutorTransport(Protocol):
    """Protocolo para transportes de execução de ferramentas."""
    
    def hosts_for(self, user_id: str) -> List[HostInfo]:
        """Retorna lista de hosts disponíveis para o usuário."""
        ...
    
    async def execute(self, call: "ToolCall", user_id: str, timeout: float = 15.0) -> "ToolResult":
        """Executa uma chamada de ferramenta e retorna o resultado."""
        ...


def get_transport() -> ExecutorTransport:
    """
    Fábrica de transporte baseada no modo de execução.
    
    - Modo device: retorna LocalExecutor (execução in-process via ToolRegistry)
    - Modo cloud: levanta NotImplementedError (Task 6 implementa RemoteHostExecutor)
    """
    from config import config
    from tools.registry import registry
    from core.execution.local import LocalExecutor
    
    if config.runtime_mode == "cloud":
        raise NotImplementedError("RemoteHostExecutor: Task 6")
    
    return LocalExecutor(registry)


# Exportar para testes
__all__ = ["ExecutorTransport", "get_transport", "LocalExecutor"]
