"""Gerenciador central do estado de execução do Charlie."""

import time
from enum import Enum
from typing import Any, Callable, Dict, List, Optional
from pydantic import BaseModel


class CharlieStatus(str, Enum):
    IDLE = "idle"
    LISTENING = "listening"
    THINKING = "thinking"
    EXECUTING_TOOL = "executing_tool"
    SPEAKING = "speaking"
    ERROR = "error"


class CharlieRuntimeState:
    """Singleton para monitoramento em tempo real do assistente."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_state()
        return cls._instance

    def _init_state(self):
        self.status: CharlieStatus = CharlieStatus.IDLE
        self.is_online: bool = True
        self.is_speaking: bool = False
        self.is_listening: bool = False
        self.active_thread_id: Optional[str] = None
        self.active_tool: Optional[str] = None
        self.active_tool_args: Optional[Dict[str, Any]] = None
        self.current_process: Optional[str] = None
        self.start_time: float = time.time()
        self.last_interaction: float = time.time()
        self._subscribers: List[Callable[[Dict[str, Any]], Any]] = []

    def set_status(self, status: CharlieStatus, details: Optional[Dict[str, Any]] = None):
        self.status = status
        self.last_interaction = time.time()
        if details:
            if "active_tool" in details:
                self.active_tool = details["active_tool"]
            if "active_tool_args" in details:
                self.active_tool_args = details["active_tool_args"]
            if "active_thread_id" in details:
                self.active_thread_id = details["active_thread_id"]
        elif status == CharlieStatus.IDLE:
            self.active_tool = None
            self.active_tool_args = None

        self._notify()

    def set_tool_start(self, tool_name: str, args: Dict[str, Any]):
        self.status = CharlieStatus.EXECUTING_TOOL
        self.active_tool = tool_name
        self.active_tool_args = args
        self.current_process = f"Executando ferramenta '{tool_name}'"
        self._notify()

    def set_tool_end(self):
        self.status = CharlieStatus.THINKING
        self.active_tool = None
        self.active_tool_args = None
        self.current_process = None
        self._notify()

    def subscribe(self, callback: Callable[[Dict[str, Any]], Any]):
        self._subscribers.append(callback)

    def unsubscribe(self, callback: Callable[[Dict[str, Any]], Any]):
        if callback in self._subscribers:
            self._subscribers.remove(callback)

    def _notify(self):
        data = self.to_dict()
        for cb in list(self._subscribers):
            try:
                cb(data)
            except Exception:
                pass

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status.value,
            "is_online": self.is_online,
            "is_speaking": self.is_speaking,
            "is_listening": self.is_listening,
            "active_thread_id": self.active_thread_id,
            "active_tool": self.active_tool,
            "active_tool_args": self.active_tool_args,
            "current_process": self.current_process,
            "uptime_seconds": int(time.time() - self.start_time),
        }


# Instância global compartilhada
state = CharlieRuntimeState()
