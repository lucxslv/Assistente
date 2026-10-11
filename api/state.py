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
        self.active_user_id: Optional[str] = None
        self.active_thread_id: Optional[str] = None
        self.active_tool: Optional[str] = None
        self.active_tool_args: Optional[Dict[str, Any]] = None
        self.current_process: Optional[str] = None
        self.start_time: float = time.time()
        self.last_interaction: float = time.time()
        self._user_states: Dict[str, Dict[str, Any]] = {}
        self._subscribers: List[Callable[[Dict[str, Any]], Any]] = []

    def set_status(
        self,
        status: CharlieStatus,
        details: Optional[Dict[str, Any]] = None,
        user_id: Optional[str] = None,
    ):
        self.status = status
        self.last_interaction = time.time()
        if user_id is not None:
            self.active_user_id = str(user_id)
        if details:
            if "active_tool" in details:
                self.active_tool = details["active_tool"]
            if "active_tool_args" in details:
                self.active_tool_args = details["active_tool_args"]
            if "active_thread_id" in details:
                self.active_thread_id = details["active_thread_id"]
            if "user_id" in details and details["user_id"]:
                self.active_user_id = str(details["user_id"])
        elif status == CharlieStatus.IDLE:
            self.active_tool = None
            self.active_tool_args = None
            self.current_process = None

        if self.active_user_id:
            self._user_states[self.active_user_id] = {
                "status": self.status.value,
                "active_thread_id": self.active_thread_id,
                "active_tool": self.active_tool,
                "active_tool_args": self.active_tool_args,
                "current_process": self.current_process,
            }

        self._notify()

    def set_tool_start(
        self,
        tool_name: str,
        args: Dict[str, Any],
        user_id: Optional[str] = None,
    ):
        self.status = CharlieStatus.EXECUTING_TOOL
        if user_id is not None:
            self.active_user_id = str(user_id)
        self.active_tool = tool_name
        self.active_tool_args = args
        self.current_process = f"Executando ferramenta '{tool_name}'"
        if self.active_user_id:
            self._user_states[self.active_user_id] = {
                "status": self.status.value,
                "active_thread_id": self.active_thread_id,
                "active_tool": self.active_tool,
                "active_tool_args": self.active_tool_args,
                "current_process": self.current_process,
            }
        self._notify()

    def set_tool_end(self, user_id: Optional[str] = None):
        self.status = CharlieStatus.THINKING
        self.active_tool = None
        self.active_tool_args = None
        self.current_process = None
        uid = str(user_id) if user_id is not None else self.active_user_id
        if uid and uid in self._user_states:
            self._user_states[uid].update({
                "status": self.status.value,
                "active_tool": None,
                "active_tool_args": None,
                "current_process": None,
            })
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

    def to_dict(
        self,
        user_id: Optional[str] = None,
        include_sensitive: bool = True,
    ) -> Dict[str, Any]:
        # Isola estado sensível entre diferentes usuários
        is_foreign_user = (
            user_id is not None
            and self.active_user_id is not None
            and str(user_id) != str(self.active_user_id)
        )
        if not include_sensitive or is_foreign_user:
            return {
                "status": CharlieStatus.IDLE.value if is_foreign_user else self.status.value,
                "is_online": self.is_online,
                "is_speaking": False if is_foreign_user else self.is_speaking,
                "is_listening": False if is_foreign_user else self.is_listening,
                "active_thread_id": None,
                "active_tool": None,
                "active_tool_args": None,
                "current_process": None,
                "uptime_seconds": int(time.time() - self.start_time),
            }

        return {
            "status": self.status.value,
            "is_online": self.is_online,
            "is_speaking": self.is_speaking,
            "is_listening": self.is_listening,
            "active_user_id": self.active_user_id,
            "active_thread_id": self.active_thread_id,
            "active_tool": self.active_tool,
            "active_tool_args": self.active_tool_args,
            "current_process": self.current_process,
            "uptime_seconds": int(time.time() - self.start_time),
        }


# Instância global compartilhada
state = CharlieRuntimeState()
