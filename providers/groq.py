"""Provedor Groq (LLM ultra-rápido)."""

import json
from typing import Any

from config import config
from providers.base import BaseLLMProvider, LLMResponse, ToolCall


class GroqProvider(BaseLLMProvider):
    async def chat(
        self,
        system_prompt: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMResponse:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=config.groq_api_key,
            base_url="https://api.groq.com/openai/v1"
        )
        api_messages = [{"role": "system", "content": system_prompt}]
        api_messages.extend(self._normalize_messages(messages))

        kwargs: dict[str, Any] = {
            "model": config.groq_llm_model,
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
    def _normalize_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        # Groq (via lib OpenAI) suporta nativamente 'role': 'tool'
        normalized = []
        for msg in messages:
            role = msg.get("role", "user")
            
            if role == "tool":
                normalized.append({
                    "role": "tool",
                    "content": msg.get("content", ""),
                    "tool_call_id": msg.get("name", "call_123") # Mock simples
                })
            elif role == "assistant":
                new_msg = {"role": "assistant", "content": msg.get("content", "")}
                if "tool_calls" in msg:
                    # Formatar no padrão OpenAI
                    new_msg["tool_calls"] = []
                    for tc in msg["tool_calls"]:
                        func = tc.get("function", {})
                        new_msg["tool_calls"].append({
                            "id": tc.get("id", "call_123"),
                            "type": "function",
                            "function": {
                                "name": func.get("name"),
                                "arguments": json.dumps(func.get("arguments", {}))
                            }
                        })
                normalized.append(new_msg)
            elif role == "user":
                normalized.append({"role": "user", "content": msg.get("content", "")})
        return normalized
