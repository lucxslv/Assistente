from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class LLMResponse:
    content: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)


@dataclass
class StreamChunk:
    text: Optional[str] = None
    tool_calls: list[ToolCall] = field(default_factory=list)
    is_done: bool = False


class BaseLLMProvider(ABC):
    @abstractmethod
    async def chat(
        self,
        system_prompt: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        model_override: Optional[str] = None,
    ) -> LLMResponse:
        pass

    async def chat_stream(
        self,
        system_prompt: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        model_override: Optional[str] = None,
    ) -> AsyncGenerator[StreamChunk, None]:
        """Gera chunks de resposta em streaming. Pode ser sobrescrito pelo provedor."""
        response = await self.chat(system_prompt, messages, tools, model_override=model_override)
        yield StreamChunk(text=response.content, tool_calls=response.tool_calls, is_done=True)

    async def generate(
        self,
        prompt: str,
        system_instruction: str = "",
        temperature: float = 0.2,
        model_override: Optional[str] = None,
    ) -> LLMResponse:
        """Gera resposta direta a partir de um prompt e instrução de sistema."""
        return await self.chat(
            system_prompt=system_instruction,
            messages=[{"role": "user", "content": prompt}],
            model_override=model_override,
        )
