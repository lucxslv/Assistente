"""Provedor Gemini."""

import asyncio
import base64
import json
import logging
import uuid
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
        raw_model = model_override or config.gemini_model
        # Mapeia aliases legados para modelos modernos compatíveis
        target_model = "gemini-3.8-flash" if raw_model in ("gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash") else (
            "gemini-3.5-flash-lite" if raw_model in ("gemini-3.1-flash-lite-preview", "gemini-3.1-flash-lite", "gemini-flash-lite-latest") else raw_model
        )
        models_to_try = [target_model]
        if "gemini-3.8-flash" not in models_to_try:
            models_to_try.append("gemini-3.8-flash")
        if "gemini-3.5-flash-lite" not in models_to_try:
            models_to_try.append("gemini-3.5-flash-lite")

        history = self._normalize_messages(messages)
        if not history:
            return LLMResponse(content="Como posso ajudar?")

        # 1. Tenta com o moderno SDK google-genai
        try:
            try:
                from google import genai
                from google.genai import types
            except (ImportError, AttributeError):
                import importlib
                genai = importlib.import_module("google.genai")
                types = importlib.import_module("google.genai.types")

            client = genai.Client(api_key=config.gemini_api_key)

            gemini_tools = []
            if tools:
                func_decls = []
                for t in tools:
                    func = t.get("function", {})
                    func_decls.append(
                        types.FunctionDeclaration(
                            name=func.get("name"),
                            description=func.get("description"),
                            parameters=func.get("parameters"),
                        )
                    )
                if func_decls:
                    gemini_tools = [types.Tool(function_declarations=func_decls)]

            gen_config = types.GenerateContentConfig(
                system_instruction=system_prompt,
                tools=gemini_tools if gemini_tools else None,
            )

            genai_contents = self._convert_to_genai_contents(history, types)

            for current_model_name in models_to_try:
                try:
                    response = await asyncio.to_thread(
                        client.models.generate_content,
                        model=current_model_name,
                        contents=genai_contents,
                        config=gen_config,
                    )

                    tool_calls: list[ToolCall] = []
                    content = ""

                    if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                        for part in response.candidates[0].content.parts:
                            if part.function_call:
                                args = dict(part.function_call.args) if part.function_call.args else {}
                                tool_calls.append(
                                    ToolCall(
                                        id=f"call_{part.function_call.name}_{uuid.uuid4().hex[:6]}",
                                        name=part.function_call.name,
                                        arguments=args,
                                    )
                                )
                            elif part.text:
                                content += part.text

                    return LLMResponse(content=content.strip(), tool_calls=tool_calls)
                except Exception as model_err:
                    logger.warning("Falha com modelo %s no google-genai: %s", current_model_name, model_err)
                    if current_model_name == models_to_try[-1]:
                        raise model_err

        except Exception as genai_err:
            logger.warning("Aviso no SDK google-genai: %s. Tentando fallback legado...", genai_err)

        # 2. Fallback legado para google.generativeai caso necessário
        try:
            import google.generativeai as legacy_genai
            legacy_genai.configure(api_key=config.gemini_api_key)

            gemini_tools = []
            if tools:
                for t in tools:
                    func = t.get("function", {})
                    gemini_tools.append(
                        legacy_genai.types.FunctionDeclaration(
                            name=func.get("name"),
                            description=func.get("description"),
                            parameters=func.get("parameters"),
                        )
                    )

            for current_model_name in models_to_try:
                try:
                    model = legacy_genai.GenerativeModel(
                        model_name=current_model_name,
                        system_instruction=system_prompt,
                        tools=gemini_tools if gemini_tools else None,
                    )
                    response = await asyncio.to_thread(model.generate_content, history)
                    tool_calls: list[ToolCall] = []
                    content = ""
                    for part in response.parts:
                        if part.function_call:
                            args = {k: v for k, v in part.function_call.args.items()}
                            tool_calls.append(
                                ToolCall(
                                    id=f"call_{part.function_call.name}",
                                    name=part.function_call.name,
                                    arguments=args,
                                )
                            )
                        elif part.text:
                            content += part.text
                    return LLMResponse(content=content.strip(), tool_calls=tool_calls)
                except Exception as leg_err:
                    if current_model_name == models_to_try[-1]:
                        logger.exception("Erro definitivo no fallback do Gemini: %s", leg_err)
                        return LLMResponse(content="Ocorreu um erro interno de API do Gemini.")
        except Exception as f_err:
            logger.exception("Erro em ambos SDKs do Gemini: %s", f_err)
            return LLMResponse(content="Ocorreu um erro interno de API do Gemini.")

    async def chat_stream(
        self,
        system_prompt: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        model_override: Optional[str] = None,
    ):
        import asyncio
        import threading
        import uuid
        from providers.base import StreamChunk

        raw_model = model_override or config.gemini_model
        target_model = "gemini-3.8-flash" if raw_model in ("gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash") else (
            "gemini-3.5-flash-lite" if raw_model in ("gemini-3.1-flash-lite-preview", "gemini-3.1-flash-lite", "gemini-flash-lite-latest") else raw_model
        )
        models_to_try = [target_model]
        if "gemini-3.8-flash" not in models_to_try:
            models_to_try.append("gemini-3.8-flash")
        if "gemini-3.5-flash-lite" not in models_to_try:
            models_to_try.append("gemini-3.5-flash-lite")

        history = self._normalize_messages(messages)
        if not history:
            yield StreamChunk(text="Como posso ajudar?", is_done=True)
            return

        loop = asyncio.get_running_loop()

        # 1. Tenta streaming via google-genai moderno
        for current_model_name in models_to_try:
            q: asyncio.Queue = asyncio.Queue()

            def worker_modern(m_name=current_model_name):
                try:
                    try:
                        from google import genai
                        from google.genai import types
                    except (ImportError, AttributeError):
                        import importlib
                        genai = importlib.import_module("google.genai")
                        types = importlib.import_module("google.genai.types")

                    client = genai.Client(api_key=config.gemini_api_key)

                    gemini_tools = []
                    if tools:
                        func_decls = []
                        for t in tools:
                            func = t.get("function", {})
                            func_decls.append(
                                types.FunctionDeclaration(
                                    name=func.get("name"),
                                    description=func.get("description"),
                                    parameters=func.get("parameters"),
                                )
                            )
                        if func_decls:
                            gemini_tools = [types.Tool(function_declarations=func_decls)]

                    gen_config = types.GenerateContentConfig(
                        system_instruction=system_prompt,
                        tools=gemini_tools if gemini_tools else None,
                    )

                    genai_contents = self._convert_to_genai_contents(history, types)
                    stream_resp = client.models.generate_content_stream(
                        model=m_name,
                        contents=genai_contents,
                        config=gen_config,
                    )

                    for c in stream_resp:
                        chunk_tool_calls: list[ToolCall] = []
                        chunk_text = ""

                        if c.candidates and c.candidates[0].content and c.candidates[0].content.parts:
                            for part in c.candidates[0].content.parts:
                                if part.function_call:
                                    args = dict(part.function_call.args) if part.function_call.args else {}
                                    chunk_tool_calls.append(
                                        ToolCall(
                                            id=f"call_{part.function_call.name}_{uuid.uuid4().hex[:6]}",
                                            name=part.function_call.name,
                                            arguments=args,
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

            threading.Thread(target=worker_modern, daemon=True).start()

            got_any_chunk = False
            failed = False
            error_val = None

            while True:
                kind, val = await q.get()
                if kind == "chunk":
                    got_any_chunk = True
                    yield val
                elif kind == "done":
                    yield StreamChunk(is_done=True)
                    return
                elif kind == "error":
                    logger.warning("Falha no streaming moderno com modelo %s (%s).", current_model_name, val)
                    failed = True
                    error_val = val
                    break

            if failed:
                if got_any_chunk:
                    raise RuntimeError(f"Falha mid-stream no modelo {current_model_name}: {error_val}")
                # Continua para o próximo modelo na lista
                continue

        # 2. Se todos os modelos falharem no SDK moderno, tenta fallback legado
        logger.warning("Tentando streaming de emergência via SDK legado google.generativeai...")
        for current_model_name in models_to_try:
            q_leg: asyncio.Queue = asyncio.Queue()

            def worker_legacy(m_name=current_model_name):
                try:
                    import google.generativeai as legacy_genai
                    legacy_genai.configure(api_key=config.gemini_api_key)

                    gemini_tools = []
                    if tools:
                        for t in tools:
                            func = t.get("function", {})
                            gemini_tools.append(
                                legacy_genai.types.FunctionDeclaration(
                                    name=func.get("name"),
                                    description=func.get("description"),
                                    parameters=func.get("parameters"),
                                )
                            )

                    mod = legacy_genai.GenerativeModel(
                        model_name=m_name,
                        system_instruction=system_prompt,
                        tools=gemini_tools if gemini_tools else None,
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
                                        id=f"call_{part.function_call.name}_{uuid.uuid4().hex[:6]}",
                                        name=part.function_call.name,
                                        arguments=args,
                                    )
                                )
                            elif part.text:
                                chunk_text += part.text
                        if chunk_text or chunk_tool_calls:
                            chunk = StreamChunk(text=chunk_text if chunk_text else None, tool_calls=chunk_tool_calls)
                            loop.call_soon_threadsafe(q_leg.put_nowait, ("chunk", chunk))
                    loop.call_soon_threadsafe(q_leg.put_nowait, ("done", None))
                except Exception as ex:
                    loop.call_soon_threadsafe(q_leg.put_nowait, ("error", ex))

            threading.Thread(target=worker_legacy, daemon=True).start()

            got_any_chunk = False
            failed = False
            while True:
                kind, val = await q_leg.get()
                if kind == "chunk":
                    got_any_chunk = True
                    yield val
                elif kind == "done":
                    yield StreamChunk(is_done=True)
                    return
                elif kind == "error":
                    logger.warning("Falha com streaming legado no modelo %s (%s).", current_model_name, val)
                    failed = True
                    break

            if failed and got_any_chunk:
                raise RuntimeError(f"Falha mid-stream legado no modelo {current_model_name}: {val}")

        raise RuntimeError("Erro ao estabelecer conexão de streaming com os modelos Gemini.")


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
                parts = []
                if msg.get("content"):
                    parts.append(str(msg.get("content")))
                if msg.get("images"):
                    for img in msg["images"]:
                        if isinstance(img, dict) and img.get("data"):
                            b64 = img["data"]
                            if "," in b64:
                                b64 = b64.split(",", 1)[1]
                            mime = img.get("mime_type") or "image/png"
                            parts.append({
                                "inline_data": {
                                    "mime_type": mime,
                                    "data": b64,
                                }
                            })
                if parts:
                    normalized.append({"role": "user", "parts": parts})
                    
        return normalized

    @staticmethod
    def _convert_to_genai_contents(history: list[dict[str, Any]], types) -> list[Any]:
        """Converte mensagens normalizadas para a lista de tipos types.Content exigidos pelo SDK google-genai."""
        genai_contents = []
        for item in history:
            role = item.get("role", "user")
            genai_role = "model" if role in ("model", "assistant") else "user"
            parts = []
            for p in item.get("parts", []):
                if isinstance(p, str):
                    parts.append(types.Part.from_text(text=p))
                elif isinstance(p, dict) and "inline_data" in p:
                    try:
                        raw_bytes = base64.b64decode(p["inline_data"]["data"])
                        parts.append(types.Part.from_bytes(
                            data=raw_bytes,
                            mime_type=p["inline_data"].get("mime_type", "image/png"),
                        ))
                    except Exception as b64_err:
                        logger.warning(f"Erro ao decodificar imagem base64: {b64_err}")
                else:
                    parts.append(types.Part.from_text(text=str(p)))
            if parts:
                genai_contents.append(types.Content(role=genai_role, parts=parts))
        return genai_contents