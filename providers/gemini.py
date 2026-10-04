"""Provedor Gemini."""

import asyncio
import json
import logging
from typing import Any, Optional

from config import config
from providers.base import BaseLLMProvider, LLMResponse, ToolCall

logger = logging.getLogger(__name__)

class GeminiProvider(BaseLLMProvider):
    async def chat(
        self,
        system_prompt: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        model_override: Optional[str] = None,
    ) -> LLMResponse:
        import google.generativeai as genai
        from google.generativeai.types import content_types

        genai.configure(api_key=config.gemini_api_key)
        
        # Mapeamento de tools JSON Schema para Tools do Gemini
        gemini_tools = []
        if tools:
            for t in tools:
                func = t.get("function", {})
                gemini_tools.append(
                    genai.types.FunctionDeclaration(
                        name=func.get("name"),
                        description=func.get("description"),
                        parameters=func.get("parameters")
                    )
                )

        target_model = model_override or config.gemini_model
        models_to_try = [target_model]
        if "gemini-3.1-flash-lite" not in models_to_try:
            models_to_try.append("gemini-3.1-flash-lite")

        history = self._normalize_messages(messages)
        
        if not history:
            return LLMResponse(content="Como posso ajudar?")

        response = None
        for current_model_name in models_to_try:
            try:
                model = genai.GenerativeModel(
                    model_name=current_model_name,
                    system_instruction=system_prompt,
                    tools=gemini_tools if gemini_tools else None
                )
                response = await asyncio.to_thread(model.generate_content, history)
                break
            except Exception as e:
                logger.warning("Falha com modelo %s (%s). Tentando fallback...", current_model_name, e)
                if current_model_name == models_to_try[-1]:
                    logger.exception("Erro ao chamar o Gemini: %s", e)
                    return LLMResponse(content="Ocorreu um erro interno de API do Gemini.")

        # Extrair tool calls, se houver
        tool_calls: list[ToolCall] = []
        content = ""
        
        for part in response.parts:
            if part.function_call:
                # O Gemini retorna os argumentos como um proto map, convertemos para dict
                args = {k: v for k, v in part.function_call.args.items()}
                tool_calls.append(
                    ToolCall(
                        id=f"call_{part.function_call.name}",
                        name=part.function_call.name,
                        arguments=args
                    )
                )
            elif part.text:
                content += part.text

        return LLMResponse(content=content.strip(), tool_calls=tool_calls)

    async def chat_stream(
        self,
        system_prompt: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        model_override: Optional[str] = None,
    ):
        import asyncio
        import threading
        from collections.abc import AsyncGenerator
        from providers.base import StreamChunk
        import google.generativeai as genai

        genai.configure(api_key=config.gemini_api_key)

        gemini_tools = []
        if tools:
            for t in tools:
                func = t.get("function", {})
                gemini_tools.append(
                    genai.types.FunctionDeclaration(
                        name=func.get("name"),
                        description=func.get("description"),
                        parameters=func.get("parameters")
                    )
                )

        target_model = model_override or config.gemini_model
        models_to_try = [target_model]
        if "gemini-3.1-flash-lite" not in models_to_try:
            models_to_try.append("gemini-3.1-flash-lite")

        history = self._normalize_messages(messages)
        if not history:
            yield StreamChunk(text="Como posso ajudar?", is_done=True)
            return

        loop = asyncio.get_running_loop()

        for current_model_name in models_to_try:
            q: asyncio.Queue = asyncio.Queue()

            def worker(m_name=current_model_name):
                try:
                    mod = genai.GenerativeModel(
                        model_name=m_name,
                        system_instruction=system_prompt,
                        tools=gemini_tools if gemini_tools else None
                    )
                    stream_resp = mod.generate_content(history, stream=True)
                    for c in stream_resp:
                        chunk_tool_calls: list[ToolCall] = []
                        chunk_text = ""
                        for part in c.parts:
                            if part.function_call:
                                args = {k: v for k, v in part.function_call.args.items()}
                                chunk_tool_calls.append(
                                    ToolCall(
                                        id=f"call_{part.function_call.name}",
                                        name=part.function_call.name,
                                        arguments=args
                                    )
                                )
                            elif part.text:
                                chunk_text += part.text
                        if chunk_text or chunk_tool_calls:
                            chunk = StreamChunk(text=chunk_text if chunk_text else None, tool_calls=chunk_tool_calls)
                            loop.call_soon_threadsafe(q.put_nowait, ("chunk", chunk))
                    loop.call_soon_threadsafe(q.put_nowait, ("done", None))
                except Exception as ex:
                    loop.call_soon_threadsafe(q.put_nowait, ("error", ex))

            threading.Thread(target=worker, daemon=True).start()

            got_any_chunk = False
            failed = False
            while True:
                kind, val = await q.get()
                if kind == "chunk":
                    got_any_chunk = True
                    yield val
                elif kind == "done":
                    yield StreamChunk(is_done=True)
                    return
                elif kind == "error":
                    logger.warning("Falha com streaming no modelo %s (%s). Tentando fallback...", current_model_name, val)
                    failed = True
                    break

            if failed and current_model_name == models_to_try[-1]:
                logger.exception("Erro definitivo no streaming do Gemini")
                yield StreamChunk(text=f"Desculpe, ocorreu um erro ao consultar o Gemini: {val}", is_done=True)
                return


    @staticmethod
    def _normalize_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized = []
        for msg in messages:
            role = msg.get("role", "user")
            
            if role == "tool":
                # Resposta de uma tool executada: formata claramente como observação interna do sistema
                func_name = msg.get("name", "unknown")
                content = str(msg.get("content", ""))
                normalized.append({
                    "role": "user",
                    "parts": [
                        f"[Observação interna do sistema - Retorno da ferramenta '{func_name}']:\n{content}\n"
                        f"(Instrução: use o retorno acima para formular sua resposta ao usuário de forma natural, fluida e conversacional. "
                        f"JAMAIS repita comandos de ferramentas, JSON ou strings como 'Chamando ferramenta:' na sua resposta.)"
                    ]
                })
                
            elif role == "assistant":
                parts = []
                content = msg.get("content")
                if content and str(content).strip():
                    clean_content = str(content).strip()
                    # Remove eventuais resíduos de chamadas de ferramenta acidentais
                    if not clean_content.startswith("Chamando ferramenta:"):
                        parts.append(clean_content)
                if "tool_calls" in msg and not parts:
                    # Chamada de ferramenta sem texto conversacional: registra como ação interna executada
                    tool_names = []
                    for tc in msg["tool_calls"]:
                        if isinstance(tc, dict):
                            fname = tc.get("function", {}).get("name") or tc.get("name")
                            if fname:
                                tool_names.append(fname)
                    actions_str = ", ".join(tool_names) if tool_names else "ferramentas internas"
                    parts.append(f"[Ação do assistente: consulta realizada aos sistemas via {actions_str}]")
                
                if parts:
                    normalized.append({"role": "model", "parts": parts})
                    
            elif role == "user":
                if msg.get("content"):
                    normalized.append({"role": "user", "parts": [str(msg.get("content"))]})
                    
        return normalized