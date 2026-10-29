"""Pacote core.execution - Runtime agêntico de execução de ferramentas."""

from core.execution.contracts import (
    ToolCall,
    ToolResult,
    HostInfo,
    ToolCallStatus,
)
from core.execution.transport import (
    ExecutorTransport,
    get_transport,
)
from core.execution.local import LocalExecutor

__all__ = [
    "ToolCall",
    "ToolResult",
    "HostInfo",
    "ToolCallStatus",
    "ExecutorTransport",
    "get_transport",
    "LocalExecutor",
]