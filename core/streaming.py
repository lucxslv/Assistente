"""Modelos de Eventos de Streaming para o Charlie Cloud Brain."""

from dataclasses import dataclass
import json
from typing import Any, Dict, Literal

StreamEventType = Literal["status", "token", "tool_start", "tool_end", "done", "error"]


@dataclass
class StreamEvent:
    type: StreamEventType
    data: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {"type": self.type, "data": self.data}

    def to_sse(self) -> str:
        """Formata o evento no padrão Server-Sent Events (SSE)."""
        payload = json.dumps(self.data, ensure_ascii=False)
        return f"event: {self.type}\ndata: {payload}\n\n"
