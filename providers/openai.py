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
        model_override: str | None = None,
    ) -> LLMResponse:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=config.openai_api_key)
        api_messages = [{"role": "system", "content": system_prompt}]
        api_messages.extend(self._normalize_messages(messages))

        kwargs: dict[str, Any] = {
            "model": model_override or config.openai_model,
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
                        id=tc.id,
                        name=tc.function.name,
                        arguments=json.loads(tc.function.arguments or "{}"),
                    )
                )

        return LLMResponse(content=choice.content, tool_calls=tool_calls)

    @staticmethod
    def _normalize_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Mantém o contrato nativo de tools para o modelo continuar o ciclo."""
        normalized: list[dict[str, Any]] = []
        for msg in messages:
            role = msg.get("role", "user")
            if role == "tool":
                normalized.append({
                    "role": "tool",
                    "tool_call_id": str(msg.get("tool_call_id") or ""),
                    "content": str(msg.get("content") or ""),
                })
                continue

            if role == "assistant":
                native_calls = []
                for tc in msg.get("tool_calls", []):
                    function = tc.get("function", {})
                    name = function.get("name") or tc.get("name")
                    arguments = function.get("arguments", tc.get("arguments", {}))
                    if not isinstance(arguments, str):
                        arguments = json.dumps(arguments or {}, ensure_ascii=False)
                    native_calls.append({
                        "id": str(tc.get("id") or ""),
                        "type": "function",
                        "function": {"name": name, "arguments": arguments},
                    })

                content = msg.get("content")
                item: dict[str, Any] = {
                    "role": "assistant",
                    "content": (content or None) if native_calls else str(content or ""),
                }
                if native_calls:
                    item["tool_calls"] = native_calls
                normalized.append(item)
                continue

            if role == "user":
                normalized.append({"role": "user", "content": msg.get("content", "")})
        return normalized
