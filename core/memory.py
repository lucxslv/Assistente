"""Gerenciamento de histórico de conversa e contexto."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ConversationMemory:
    """Armazena mensagens da conversa com limite configurável."""

    max_messages: int = 20
    messages: list[dict[str, Any]] = field(default_factory=list)

    def add_user(self, content: str) -> None:
        self._append({"role": "user", "content": content})

    def add_assistant(self, content: str) -> None:
        self._append({"role": "assistant", "content": content})

    def add_tool_result(self, tool_name: str, result: str) -> None:
        self._append(
            {
                "role": "tool",
                "name": tool_name,
                "content": result,
            }
        )

    def get_messages(self) -> list[dict[str, Any]]:
        return list(self.messages)

    def clear(self) -> None:
        self.messages.clear()

    def _append(self, message: dict[str, Any]) -> None:
        self.messages.append(message)
        if len(self.messages) > self.max_messages:
            self.messages = self.messages[-self.max_messages :]
