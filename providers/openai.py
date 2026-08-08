"""Provedor OpenAI."""

import json
from typing import Any

from config import config
from providers.base import BaseLLMProvider, LLMResponse, ToolCall


class OpenAIProvider(BaseLLMProvider):
    async def chat(
        self,
        system_prompt: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
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