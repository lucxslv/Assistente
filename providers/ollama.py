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
                # A API do Ollama pode ou não retornar id dependendo da versão, criamos um mock seguro
                tc_id = tc.get("id", f"call_{func.get('name')}")
                tool_calls.append(
                    ToolCall(
                        id=tc_id,
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
                # Modelos pequenos do Ollama alucinam com histórico nativo de ferramentas, 
                # então convertemos o resultado da ferramenta para uma observação do sistema
                normalized.append({
                    "role": "user",
                    "content": f"[SISTEMA - Resultado da ferramenta '{msg.get('name', 'desconhecida')}']: {msg.get('content', '')}",
                })
            elif role == "assistant":
                new_msg = {"role": "assistant", "content": msg.get("content", "")}
                
                if "tool_calls" in msg:
                    if msg is messages[-1]:
                        # Mantém as ferramentas se for a última mensagem (ação ativa)
                        new_msg["tool_calls"] = msg["tool_calls"]
                    else:
                        # Se for histórico antigo, converte a ferramenta em texto para não confundir o LLM
                        if not new_msg["content"]:
                            names = [tc.get("function", {}).get("name", "unknown") for tc in msg["tool_calls"]]
                            new_msg["content"] = f"[Acionei a ferramenta: {', '.join(names)}]"
                
                # Só adiciona se houver algum conteúdo (evita mensagens vazias)
                if new_msg.get("content") or new_msg.get("tool_calls"):
                    normalized.append(new_msg)
            elif role == "user":
                normalized.append({"role": "user", "content": msg.get("content", "")})
        return normalized