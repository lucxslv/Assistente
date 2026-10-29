"""Executor local in-process via ToolRegistry."""

from __future__ import annotations
import time
from typing import TYPE_CHECKING

from core.execution.contracts import ToolCall, ToolResult, HostInfo

if TYPE_CHECKING:
    from core.execution.transport import ExecutorTransport
    from tools.registry import ToolRegistry


class LocalExecutor:
    """Executor local que executa ferramentas via ToolRegistry in-process."""
    
    def __init__(self, registry: "ToolRegistry") -> None:
        self.registry = registry
    
    async def hosts_for(self, user_id: str) -> list[HostInfo]:
        """Retorna o host local com capabilities do registry."""
        import time
        return [HostInfo(
            host_id="local",
            name="Local Host",
            capabilities=self.registry.list_tools(),
            last_seen_at=time.time(),
            online=True
        )]
    
    async def execute(self, call: "ToolCall", user_id: str, timeout: float = 15.0) -> "ToolResult":
        """Executa a ferramenta via registry e converte para ToolResult."""
        from core.execution.contracts import ToolResult
        
        start = time.perf_counter()
        result_dict = await self.registry.execute_structured(
            call.name,
            call.arguments,
            prefer_remote=False,
            call_id=call.call_id,
            user_id=user_id,
            timeout=timeout
        )
        duration_ms = int((time.perf_counter() - start) * 1000)
        
        # Mapear status do registry para ToolResult
        status = result_dict.get("status", "error")
        error_type = result_dict.get("error_type")
        if status == "success":
            tool_status = "success"
        elif status == "unavailable":
            tool_status = "unavailable"
        elif status == "timeout":
            tool_status = "timeout"
        elif status == "blocked":
            tool_status = "unavailable"
        elif error_type == "not_found":
            tool_status = "unavailable"
        else:
            tool_status = "error"
        
        return ToolResult(
            call_id=call.call_id,
            status=tool_status,
            output=result_dict.get("output", ""),
            friendly_name=result_dict.get("friendly_name", ""),
            duration_ms=duration_ms,
            error_type=result_dict.get("error_type"),
            is_recoverable=result_dict.get("is_recoverable", False),
            host_id="local"
        )