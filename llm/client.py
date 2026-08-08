"""Cliente da LLM — suporte a OpenAI, Gemini e Ollama."""

import json
import logging
from dataclasses import dataclass, field
from typing import Any

import httpx

from config import config

logger = logging.getLogger(__name__)


@dataclass
class ToolCall:
    name: str
    arguments: dict[str, Any]


@dataclass
class LLMResponse:
    content: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)


class LLMClient:
    """Cliente unificado para múltiplos provedores de LLM."""

    def __init__(self) -> None:
        self.provider = config.llm_provider.lower()

    async def chat(
        self,
        system_prompt: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMResponse:
        if self.provider == "openai":
            return await self._chat_openai(system_prompt, messages, tools)
        if self.provider == "gemini":
            return await self._chat_gemini(system_prompt, messages, tools)
        if self.provider == "ollama":
            return await self._chat_ollama(system_prompt, messages, tools)

        raise ValueError(f"Provedor LLM não suportado: {self.provider}")

    async def _chat_openai(
        self,
        system_prompt: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None,
    ) -> LLMResponse:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=config.openai_api_key)
        api_messages = [{"role": "system", "content": system_prompt}]
        api_messages.extend(self._normalize_messages(messages))

        kwargs: dict[str, Any] = {
            "model": config.openai_model,
            "messages": api_messages,
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        response = await client.chat.completions.create(**kwargs)
        choice = response.choices[0].message

        tool_calls: list[ToolCall] = []
        if choice.tool_calls:
            for tc in choice.tool_calls:
                tool_calls.append(
                    ToolCall(
                        name=tc.function.name,
                        arguments=json.loads(tc.function.arguments or "{}"),
                    )
                )

        return LLMResponse(content=choice.content, tool_calls=tool_calls)

    async def _chat_gemini(
        self,
        system_prompt: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None,
    ) -> LLMResponse:
        import google.generativeai as genai

        genai.configure(api_key=config.gemini_api_key)
        model = genai.GenerativeModel(
            model_name=config.gemini_model,
            system_instruction=system_prompt,
        )

        history = []
        for msg in self._normalize_messages(messages):
            role = "user" if msg["role"] == "user" else "model"
            history.append({"role": role, "parts": [msg["content"]]})

        if not history:
            return LLMResponse(content="Como posso ajudar?")

        response = await model.generate_content_async(history[-1]["parts"][0])
        return LLMResponse(content=response.text)

    async def _chat_ollama(
        self,
        system_prompt: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None,
    ) -> LLMResponse:
        api_messages = [{"role": "system", "content": system_prompt}]
        api_messages.extend(self._normalize_messages(messages))

        payload = {
            "model": config.ollama_model,
            "messages": api_messages,
            "stream": False,
        }

        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{config.ollama_base_url}/api/chat",
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        content = data.get("message", {}).get("content")
        return LLMResponse(content=content)

    @staticmethod
    def _normalize_messages(messages: list[dict[str, Any]]) -> list[dict[str, str]]:
        normalized = []
        for msg in messages:
            role = msg.get("role", "user")
            if role == "tool":
                normalized.append(
                    {
                        "role": "user",
                        "content": f"[Resultado de {msg.get('name', 'tool')}]: {msg.get('content', '')}",
                    }
                )
            elif role in {"user", "assistant"}:
                normalized.append({"role": role, "content": msg.get("content", "")})
        return normalized
