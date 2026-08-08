"""Provedor Ollama."""

from typing import Any

import httpx

from config import config
from providers.base import BaseLLMProvider, LLMResponse, ToolCall


class OllamaProvider(BaseLLMProvider):
    async def chat(
        self,
        system_prompt: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMResponse:
        api_messages = [{"role": "system", "content": system_prompt}]
        api_messages.extend(self._normalize_messages(messages))

        payload = {
            "model": config.ollama_model,
            "messages": api_messages,
            "stream": False,
        }
        if tools:
            payload["tools"] = tools

        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{config.ollama_base_url}/api/chat",
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        message = data.get("message", {})
        content = message.get("content")
        
        tool_calls: list[ToolCall] = []
        if "tool_calls" in message:
            for tc in message["tool_calls"]:
                func = tc.get("function", {})
                tool_calls.append(
                    ToolCall(
                        name=func.get("name"),
                        arguments=func.get("arguments", {}),
                    )
                )
                
        return LLMResponse(content=content, tool_calls=tool_calls)

    @staticmethod
    def _normalize_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized = []
        for msg in messages:
            role = msg.get("role", "user")
            if role == "tool":
                normalized.append(
                    {
                        "role": "tool",
                        "content": msg.get("content", ""),
                    }
                )
            elif role == "assistant":
                new_msg = {"role": "assistant", "content": msg.get("content", "")}
                if "tool_calls" in msg:
                    new_msg["tool_calls"] = msg["tool_calls"]
                normalized.append(new_msg)
            elif role == "user":
                normalized.append({"role": "user", "content": msg.get("content", "")})
        return normalized