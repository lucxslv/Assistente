"""Provedor Gemini."""

from typing import Any

from config import config
from providers.base import BaseLLMProvider, LLMResponse


class GeminiProvider(BaseLLMProvider):
    async def chat(
        self,
        system_prompt: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
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