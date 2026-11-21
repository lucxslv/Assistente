"""Pipeline Sequencial de 9 Etapas da Assistente."""

import asyncio
import logging
import os
import platform
import time
from typing import Any, Optional

import config as config_module
from brain.context.manager import ContextManager
from brain.planner.planner import IntentPlanner, IntentCategory
from brain.profile import AssistantProfile
from brain.router.router import LLMRouter, RouteMode
from core.memory import ConversationMemory
from memory.retrieval.retriever import MemoryRetriever
from providers import (
    GeminiProvider,
    GroqProvider,
    OllamaProvider,
    OpenAIProvider,
    OpenRouterProvider,
    BaseLLMProvider
)
from collections.abc import AsyncGenerator
from core.streaming import StreamEvent
from core.message_parser import StreamingMessageParser, parse_assistant_message_content
from brain.prompts.prompts import build_system_prompt
from tools.registry import ToolRegistry

logger = logging.getLogger(__name__)

# Test override for max steps per turn
_test_max_steps_per_turn: Optional[int] = None

# Deadlines evitam turnos eternamente "open" quando um provedor não responde.
LLM_FIRST_CHUNK_TIMEOUT_SECONDS = 12.0
LLM_STREAM_STALL_TIMEOUT_SECONDS = 30.0
LLM_CYCLE_TIMEOUT_SECONDS = 45.0
_test_llm_stream_timeout: Optional[float] = None
_test_llm_cycle_timeout: Optional[float] = None


async def _bounded_llm_stream(stream, deadline: float):
    """Consome um stream com limites de primeiro chunk, inatividade e ciclo total."""
    iterator = stream.__aiter__()
    is_first_chunk = True
    try:
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("Tempo limite total ao aguardar resposta do modelo.")
            chunk_timeout = _test_llm_stream_timeout or (
                LLM_FIRST_CHUNK_TIMEOUT_SECONDS if is_first_chunk else LLM_STREAM_STALL_TIMEOUT_SECONDS
            )
            try:
                async with asyncio.timeout(min(remaining, chunk_timeout)):
                    chunk = await iterator.__anext__()
            except asyncio.TimeoutError as exc:
                raise TimeoutError(
                    f"Tempo limite ao aguardar resposta do modelo ({chunk_timeout:g}s)."
                ) from exc
            except StopAsyncIteration:
                break
            is_first_chunk = False
            yield chunk
    finally:
        close = getattr(iterator, "aclose", None)
        if close:
            try:
                await asyncio.wait_for(close(), timeout=1.0)
            except Exception:
                logger.debug("Falha ao encerrar stream do provedor após deadline", exc_info=True)





class AssistantPipeline:
    """Implementa o ciclo linear de vida de uma requisição."""

    def __init__(self, init_audio: bool = False) -> None:
        self.stt = None
        self.tts = None
        if init_audio:
            try:
                from audio.stt import SpeechToText
                from audio.tts import TextToSpeech
                self.stt = SpeechToText()
                self.tts = TextToSpeech()
            except Exception as e:
                logger.debug("Módulos de áudio local desabilitados no ambiente: %s", e)
        
        self.router = LLMRouter()
        self.planner = IntentPlanner()
        self.context_manager = ContextManager()
        self.profile = AssistantProfile()
        self.retriever = MemoryRetriever()
        
        self.tools = ToolRegistry()
        self.memory = ConversationMemory(max_messages=config_module.config.max_history_messages)
        self.llm = self._get_llm_provider()
        self.last_model_used: str = config_module.config.gemini_model
        self.last_provider_used: str = config_module.config.llm_provider.lower()
        self.last_route_mode: str = "fast"
        self.last_fallback_used: bool = False
        self.last_fallback_reason: Optional[str] = None
        self.last_usage_metadata: Optional[dict[str, Any]] = None
        self.last_error_detail: Optional[str] = None
        self._max_agent_steps_per_turn: Optional[int] = None

    def _get_llm_provider(self, provider_name: Optional[str] = None) -> BaseLLMProvider:
        provider = (provider_name or config_module.config.llm_provider).lower()
        if provider == "openai":
            return OpenAIProvider()
        if provider == "gemini":
            return GeminiProvider()
        if provider == "ollama":
            return OllamaProvider()
        if provider == "openrouter":
            return OpenRouterProvider()
        if provider == "groq":
            return GroqProvider()
        raise ValueError(f"Provedor LLM desconhecido: {provider}")

    async def process_voice_input(self) -> str | None:
        """Etapas 1 e 2: Escuta e STT."""
        logger.info("Ouvindo...")
        try:
            text = await self.stt.transcribe()
            if text:
                logger.info("Usuário: %s", text)
            return text
        except Exception:
            logger.exception("Erro na transcrição (STT)")
            return None

    async def _persist_turn_state(
        self,
        request_id: str,
        user_id: str,
        thread_id: str | None,
        memory: ConversationMemory,
        status: str,
        pending_tools: list[dict] | None = None,
        steps_this_turn: int = 0,
        iterations: int = 0,
        completed_call_ids: set[str] | None = None,
    ) -> None:
        """Persiste o estado do turno no banco para retomada posterior (modo cloud)."""
        if not thread_id or user_id == "default":
            return
        try:
            from api.db import get_or_init_db_pool
            pool = await get_or_init_db_pool()
            if not pool:
                return
            async with pool.acquire() as conn:
                import json
                existing = await conn.fetchrow(
                    "SELECT user_id, thread_id FROM chat_turn_state WHERE request_id = $1",
                    request_id,
                )
                if existing and (
                    str(existing.get("user_id") or "") != str(user_id)
                    or str(existing.get("thread_id") or "") != str(thread_id)
                ):
                    logger.warning(
                        "Turn state cross-tenant bloqueado para request_id=%s", request_id
                    )
                    return
                state_data = {
                    "memory": memory.get_messages(),
                    "pending_tools": pending_tools or [],
                    "completed_call_ids": sorted(completed_call_ids or set()),
                    "steps_this_turn": int(steps_this_turn),
                    "iterations": int(iterations),
                }
                result = await conn.execute(
                    """
                    INSERT INTO chat_turn_state (turn_id, user_id, thread_id, request_id, state, status, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, NOW())
                    ON CONFLICT (request_id) DO UPDATE SET
                        state = EXCLUDED.state,
                        status = EXCLUDED.status,
                        updated_at = NOW()
                    WHERE chat_turn_state.user_id = EXCLUDED.user_id
                      AND chat_turn_state.thread_id = EXCLUDED.thread_id
                    """,
                    request_id,
                    user_id,
                    thread_id,
                    request_id,
                    json.dumps(state_data),
                    status,
                )
                if isinstance(result, str) and result.split() and result.split()[-1] == "0":
                    logger.warning("Turn state cross-tenant bloqueado no upsert para request_id=%s", request_id)
                    return
        except Exception as e:
            logger.debug(f"Falha ao persistir turn state: {e}")

    async def _load_turn_state(self, request_id: str, user_id: str, thread_id: str | None) -> dict | None:
        """Carrega o estado somente se request, usuário e thread coincidirem."""
        try:
            from api.db import get_or_init_db_pool
            pool = await get_or_init_db_pool()
            if not pool or not thread_id:
                return None
            async with pool.acquire() as conn:
                import json
                row = await conn.fetchrow(
                    "SELECT state, status FROM chat_turn_state WHERE request_id = $1 AND user_id = $2 AND thread_id = $3",
                    request_id,
                    user_id,
                    thread_id,
                )
                if row:
                    raw_state = row["state"]
                    state = json.loads(raw_state) if isinstance(raw_state, str) else raw_state
                    return {"state": state, "status": row["status"]}
        except Exception as e:
            logger.debug(f"Falha ao carregar turn state: {e}")
        return None

    async def run_pipeline_stream(
        self,
        user_text: str,
        thread_id: str | None = None,
        user_id: str | None = None,
        user_name: str | None = None,
        tool_results: list[dict] | None = None,
        history: list[dict] | None = None,
        images: list[dict] | None = None,
        cancel_event: Any = None,
        request_id: str | None = None,
    ) -> AsyncGenerator[StreamEvent, None]:
        """Executa o pipeline em modo streaming, emitindo tokens e eventos em tempo real."""
        import inspect
        import os
        import uuid
        from tools.registry import ToolScope
        from core.execution.contracts import ToolCall

        def _is_cancelled() -> bool:
            return bool(cancel_event and getattr(cancel_event, "is_set", lambda: False)())

        self.last_error_detail = None

        is_cloud = config_module.config.runtime_mode == "cloud"

        # Resolve identidade antes de qualquer leitura de estado retomável.
        try:
            from api.routes.auth import current_user_id_var, current_user_email_var, current_user_name_var
            uid = user_id or current_user_id_var.get()
            uname = user_name or current_user_name_var.get()
            uemail = current_user_email_var.get()
            current_user_id_var.set(uid)
            if uname:
                current_user_name_var.set(uname)
        except Exception:
            uid = user_id or "default"
            uname = user_name
            uemail = ""

        # Resumable turn: generate request_id if not provided
        if request_id is None:
            request_id = f"req_{uuid.uuid4().hex[:12]}"
        
        # Cloud mode: valida o estado autorizado antes de aceitar qualquer resultado.
        resuming_turn = False
        completed_call_ids = set()
        resumed_steps = 0
        resumed_iterations = 0
        restored_memory = []
        if is_cloud and tool_results:
            turn_state = await self._load_turn_state(request_id, uid, thread_id)
            state_data = (turn_state or {}).get("state") or {}
            completed_call_ids = set(state_data.get("completed_call_ids", []))
            pending_tools = state_data.get("pending_tools") or []
            allowed_result_ids = {
                str(tool.get("call_id"))
                for tool in pending_tools
                if tool.get("call_id")
            } - completed_call_ids
            valid_results = [
                result for result in tool_results
                if str(result.get("call_id") or "") in allowed_result_ids
            ]
            if not state_data or not valid_results:
                error_msg = "Não foi possível validar os resultados para retomar este turno. Execute a ação novamente."
                yield StreamEvent(type="error", data={"error": error_msg})
                yield StreamEvent(type="done", data={"reply": error_msg, "thread_id": thread_id})
                return

            tool_results = valid_results
            resuming_turn = True
            restored_memory = list(state_data.get("memory") or [])
            resumed_steps = int(state_data.get("steps_this_turn", 0) or 0)
            resumed_iterations = int(state_data.get("iterations", 0) or 0)

        new_result_ids = {
            str(tr.get("call_id"))
            for tr in (tool_results or [])
            if tr.get("call_id")
        } - completed_call_ids
        completed_call_ids.update(new_result_ids)
        resumed_steps += len(new_result_ids)

        yield StreamEvent(type="status", data={"status": "thinking", "text": "Consultando contexto e memórias...", "request_id": request_id})

        # Inicializa memória da conversa isolada para esta requisição/thread
        req_memory = ConversationMemory(max_messages=config_module.config.max_history_messages)

        # 1. Na retomada, restaura inclusive as tool_calls originais do turno.
        if restored_memory:
            for item in restored_memory:
                if isinstance(item, dict) and item.get("role"):
                    req_memory._append(dict(item))
        elif history:
            for item in history:
                role = item.get("role", "")
                content = item.get("content", "")
                if not content:
                    continue
                if role == "user":
                    req_memory.add_user(content)
                elif role == "assistant":
                    req_memory.add_assistant(content)

        # 2. Garante que a mensagem atual do usuário esteja presente no final do histórico
        existing_msgs = req_memory.get_messages()
        if user_text and user_text.strip():
            # Se o histórico carregado do banco já continha a mensagem atual no final, não duplica
            if not existing_msgs or existing_msgs[-1].get("content") != user_text:
                req_memory.add_user(user_text)
                if images and req_memory.messages:
                    req_memory.messages[-1]["images"] = images
            elif images and req_memory.messages:
                req_memory.messages[-1]["images"] = images
        elif images:
            req_memory.add_user("(Imagem enviada para análise visual)")
            if req_memory.messages:
                req_memory.messages[-1]["images"] = images

        # 3. Registra resultados de ferramentas enviadas pelo cliente Desktop se houver
        if tool_results:
            for tr in tool_results:
                t_name = tr.get("name", "tool")
                t_res = tr.get("result", "")
                t_cid = tr.get("call_id")
                req_memory.add_tool_result(t_name, t_res, tool_call_id=t_cid)

        # Cloud mode: if resuming, persist turn state before tool execution
        if is_cloud and not resuming_turn:
            await self._persist_turn_state(request_id, uid, thread_id, req_memory, "open")

        # Etapa 3: Roteador Híbrido de Modelos (Fast LLM vs. Reasoning LLM)
        route_decision = self.router.route(user_text or "continuar análise do sistema")
        self.last_model_used = route_decision.model_name
        self.last_provider_used = route_decision.provider_name
        self.last_route_mode = route_decision.mode.value
        self.last_fallback_used = False
        self.last_fallback_reason = None
        self.last_usage_metadata = None
        logger.info(f"Rota selecionada: {route_decision.mode.value} -> {route_decision.model_name} ({route_decision.reason})")

        # Etapa 4: Contexto Inteligente & Presença
        asyncio.create_task(self.context_manager.refresh_weather_if_needed())
        context_str = self.context_manager.build_context(active_thread_id=thread_id, user_name=uname)

        # Etapa 5: Recuperador de Memória Contínua (UserMemory / UserPreference) com isolamento estrito
        user_facts = []
        user_prefs = {}
        cross_chat_context = ""
        try:
            from api.db import get_or_init_db_pool
            from api.services.chat_persistence import get_user_memory_facts, get_user_preferences_dict, search_user_chat_history
            pool = await get_or_init_db_pool()
            if pool and uid and uid != "default":
                user_facts = await get_user_memory_facts(pool, uid, limit=15)
                user_prefs = await get_user_preferences_dict(pool, uid)

                # Etapa 5.1: Cross-Chat Context proativo (busca automática se usuário fizer menção a outros chats)
                cross_triggers = [
                    "outro chat", "outros chats", "outra conversa", "outras conversas",
                    "chat anterior", "conversa passada", "conversamos antes", "falamos no outro",
                    "falamos na outra", "no outro", "na outra", "nos outros"
                ]
                if user_text and any(t in user_text.lower() for t in cross_triggers):
                    try:
                        past_matches = await search_user_chat_history(
                            pool=pool,
                            user_id=uid,
                            query=user_text,
                            exclude_session_id=thread_id,
                            limit=4,
                            user_email=uemail,
                        )
                        if past_matches:
                            lines = []
                            for pm in past_matches:
                                lines.append(f"- Chat \"{pm['session_title']}\" ({pm['date']}) [{pm['role']}]: {pm['content']}")
                            cross_chat_context = "\n".join(lines)
                            logger.info(f"[pipeline] Cross-chat context carregado: {len(past_matches)} trechos encontrados")
                    except Exception as cc_err:
                        logger.debug(f"Aviso cross-chat prefetch: {cc_err}")
        except Exception as mem_err:
            logger.warning(f"Aviso ao carregar memórias ativas para o prompt: {mem_err}")

        # Recuperador de Memória Semântica (RAG)
        memory_str = self.retriever.get_summary_context(query=user_text or "sistema", user_id=uid)

        # Etapa 6: Selecionador de Ferramentas e Configuração do Prompt Adaptativo
        system_prompt = build_system_prompt(
            profile=self.profile,
            context=context_str,
            memory_summary=memory_str,
            tools=self.tools,
            user_id=uid,
            thread_id=thread_id,
            user_text=user_text,
            user_facts=user_facts,
            user_preferences=user_prefs,
            cross_chat_context=cross_chat_context,
        )

        active_tools = self.tools.get_schemas()

        # Detecção proativa de telemetria / hardware para emissão de Widgets Generativos
        u_lower = (user_text or "").lower()
        perf_keywords = [
            "desempenho", "telemetria", "hardware", "cpu", "memória ram",
            "como está o pc", "como está a máquina", "status do pc", "status do computador", "status da máquina"
        ]
        if any(kw in u_lower for kw in perf_keywords):
            try:
                from core.widgets import build_server_health_widget_payload, build_storage_widget_payload
                from tools.system_info import get_system_metrics_dict
                m_dict = get_system_metrics_dict()
                health_widget = build_server_health_widget_payload(
                    cpu_percent=m_dict.get("cpu_percent", 0.0),
                    ram_percent=m_dict.get("ram_percent", 0.0),
                    database="healthy",
                    websocket="connected",
                    sse="connected",
                    title="Desempenho & Saúde do Sistema",
                )
                yield StreamEvent(type="widget", data=health_widget)

                # Se mencionar especificamente disco / armazenamento
                if any(dk in u_lower for dk in ["disco", "armazenamento", "ssd", "hd", "espaço"]):
                    disk_info = m_dict.get("disk")
                    if disk_info:
                        storage_widget = build_storage_widget_payload(
                            title="Armazenamento Local (Disco C:)",
                            used_percent=disk_info["percent"],
                            used_label=f"{disk_info['used_gb']} GB",
                            total_label=f"{disk_info['total_gb']} GB",
                        )
                        yield StreamEvent(type="widget", data=storage_widget)

                # Alimenta o system_prompt com métricas precisas atuais
                system_prompt += (
                    f"\n\n[MÉTRICAS REAIS DE HARDWARE DO COMPUTADOR AGORA]:\n"
                    f"- CPU: {m_dict.get('cpu_percent', 0.0):.1f}%\n"
                    f"- RAM: {m_dict.get('ram_percent', 0.0):.1f}% ({m_dict.get('ram_used_gb', 0.0)} GB usados de {m_dict.get('ram_total_gb', 0.0)} GB)\n"
                    f"- Status do Sistema: Operacional e responsivo.\n"
                    f"Apresente uma resposta concisa, natural e profissional baseada EXCLUSIVAMENTE nestes números reais coletados."
                )
            except Exception as w_err:
                logger.warning(f"Aviso ao emitir widget de hardware: {w_err}")

        # O orçamento é acumulativo para todo o turno, não reiniciado a cada ciclo.
        max_steps = max(1, int(
            _test_max_steps_per_turn
            or getattr(self, "_max_agent_steps_per_turn", None)
            or config_module.config.max_agent_steps_per_turn
        ))
        max_iterations = max_steps
        steps_this_turn = resumed_steps
        iterations = resumed_iterations
        budget_reply = (
            f"Limite de passos do turno atingido ({max_steps}). "
            "Não foi possível concluir todas as ações com evidências."
        )
        final_reply = budget_reply if (
            steps_this_turn >= max_steps or iterations >= max_iterations
        ) else ""
        emitted_any_token = False

        active_llm_instance = self.llm

        def _invoke_chat_stream(model_name: str, provider_override: Optional[str] = None):
            nonlocal active_llm_instance
            if provider_override and provider_override.lower() != route_decision.provider_name.lower():
                try:
                    active_llm_instance = self._get_llm_provider(provider_override)
                except Exception:
                    active_llm_instance = self.llm
            else:
                active_llm_instance = self.llm

            stream_kwargs = {
                "system_prompt": system_prompt,
                "messages": req_memory.get_messages(),
                "tools": active_tools,
                "model_override": model_name,
            }
            try:
                sig = inspect.signature(active_llm_instance.chat_stream)
                if "cancel_event" in sig.parameters or any(
                    p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()
                ):
                    stream_kwargs["cancel_event"] = cancel_event
            except Exception:
                pass
            return active_llm_instance.chat_stream(**stream_kwargs)

        while iterations < max_iterations and steps_this_turn < max_steps:
            llm_cycle_deadline = time.monotonic() + (_test_llm_cycle_timeout or LLM_CYCLE_TIMEOUT_SECONDS)
            if _is_cancelled():
                break
            iterations += 1
            iteration_reply = ""
            tool_calls = []

            # Streaming dos chunks e detecção de tool calls com suporte a fallback
            stream_parser = StreamingMessageParser()
            try:
                async for chunk in _bounded_llm_stream(
                    _invoke_chat_stream(route_decision.model_name, route_decision.provider_name),
                    llm_cycle_deadline,
                ):
                    if _is_cancelled():
                        break
                    if chunk.tool_calls:
                        tool_calls.extend(chunk.tool_calls)
                    if chunk.text:
                        chunk_text = chunk.text
                        stripped = chunk_text.strip()
                        if stripped.startswith("Chamando ferramenta:") or stripped.startswith("ToolCall("):
                            logger.warning(f"[pipeline] Suprimindo vazamento de ferramenta no stream: {stripped[:80]}")
                            continue
                        iteration_reply += chunk_text
                        clean_token = stream_parser.feed(chunk_text)
                        if stream_parser.internal_thoughts:
                            for thought_item in stream_parser.internal_thoughts:
                                yield StreamEvent(type="thought", data={"thought": thought_item})
                            stream_parser.internal_thoughts.clear()

                        if not chunk.tool_calls and clean_token:
                            emitted_any_token = True
                            yield StreamEvent(type="token", data={"token": clean_token})
                if getattr(active_llm_instance, "last_usage_metadata", None):
                    self.last_usage_metadata = getattr(active_llm_instance, "last_usage_metadata")
            except Exception as e:
                if _is_cancelled():
                    break
                logger.warning(f"Aviso na rota {route_decision.model_name}: {e}. Executando cadeia de fallback...")
                self.last_error_detail = str(e)
                self.last_fallback_reason = str(e)

                fallback_candidates = self.router.get_fallback_chain(route_decision)
                if not fallback_candidates:
                    fb_default = config_module.config.gemini_model
                    if fb_default == route_decision.model_name:
                        fb_default = "gemini-2.5-flash-lite" if route_decision.model_name != "gemini-2.5-flash-lite" else "gemini-2.5-flash"
                    if fb_default != route_decision.model_name:
                        fallback_candidates = [(route_decision.provider_name, fb_default)]

                recovered_via_fallback = False
                for fb_provider, fallback_model in fallback_candidates:
                    if _is_cancelled():
                        break
                    if emitted_any_token:
                        logger.info(f"[pipeline] Falha mid-stream detectada ({len(iteration_reply)} chars). Emitindo reset_and_fallback.")
                        yield StreamEvent(
                            type="reset_and_fallback",
                            data={
                                "reason": f"Alternando automaticamente para o modelo de contingência ({fallback_model}).",
                                "fallback_model": fallback_model,
                                "fallback_provider": fb_provider,
                            },
                        )
                    iteration_reply = ""
                    tool_calls.clear()
                    emitted_any_token = False
                    self.last_model_used = fallback_model
                    self.last_provider_used = fb_provider
                    self.last_fallback_used = True
                    stream_parser = StreamingMessageParser()

                    try:
                        async for chunk in _bounded_llm_stream(
                            _invoke_chat_stream(fallback_model, fb_provider),
                            llm_cycle_deadline,
                        ):
                            if _is_cancelled():
                                break
                            if chunk.tool_calls:
                                tool_calls.extend(chunk.tool_calls)
                            if chunk.text:
                                chunk_text = chunk.text
                                stripped = chunk_text.strip()
                                if stripped.startswith("Chamando ferramenta:") or stripped.startswith("ToolCall("):
                                    logger.warning(f"[pipeline] Suprimindo vazamento de ferramenta no stream fallback: {stripped[:80]}")
                                    continue
                                iteration_reply += chunk_text
                                clean_token = stream_parser.feed(chunk_text)
                                if stream_parser.internal_thoughts:
                                    for thought_item in stream_parser.internal_thoughts:
                                        yield StreamEvent(type="thought", data={"thought": thought_item})
                                    stream_parser.internal_thoughts.clear()

                                if not chunk.tool_calls and clean_token:
                                    emitted_any_token = True
                                    yield StreamEvent(type="token", data={"token": clean_token})
                        if getattr(active_llm_instance, "last_usage_metadata", None):
                            self.last_usage_metadata = getattr(active_llm_instance, "last_usage_metadata")
                        recovered_via_fallback = True
                        break
                    except Exception as fb_err:
                        logger.error(f"[pipeline] Falha no candidato de fallback {fb_provider}/{fallback_model}: {fb_err}")
                        self.last_error_detail = f"{e} | fallback({fb_provider}/{fallback_model}): {fb_err}"
                        continue

                if not recovered_via_fallback:
                    yield StreamEvent(
                        type="error",
                        data={"error": "Ocorreu uma instabilidade temporária na comunicação com os modelos de IA. Tente novamente em instantes."},
                    )
                    final_reply = "Desculpe, ocorreu uma instabilidade temporária na comunicação com os modelos de IA. Por favor, tente novamente em instantes."
                    break

            if _is_cancelled():
                remaining_clean, _ = stream_parser.flush()
                final_reply = remaining_clean or iteration_reply or final_reply
                break

            if not tool_calls:
                remaining_clean, meta = stream_parser.flush()
                if meta.get("internal_thoughts"):
                    for thought_item in meta["internal_thoughts"]:
                        yield StreamEvent(type="thought", data={"thought": thought_item})
                if remaining_clean and not emitted_any_token:
                    emitted_any_token = True
                    yield StreamEvent(type="token", data={"token": remaining_clean})
                final_reply = remaining_clean or iteration_reply or "Ação concluída."
                break

            req_memory.add_assistant_tool_calls(tool_calls)

            # Notifica início das ferramentas
            for call in tool_calls:
                if _is_cancelled():
                    break
                scope_enum = self.tools.get_scope(call.name)
                friendly_label = self.tools.get_friendly_name(call.name) if hasattr(self.tools, "get_friendly_name") else call.name
                c_id = call.id or f"call_{uuid.uuid4().hex[:8]}"
                yield StreamEvent(
                    type="tool_start",
                    data={
                        "name": call.name,
                        "friendly_name": friendly_label,
                        "args": call.arguments,
                        "scope": scope_enum.value,
                        "call_id": c_id,
                    },
                )

            if _is_cancelled():
                final_reply = iteration_reply or final_reply
                break

            # Executa ferramentas via transport (LocalExecutor no device, RemoteHostExecutor no cloud)
            from core.execution.transport import get_transport
            transport = get_transport()

            for call in tool_calls:
                if _is_cancelled():
                    break
                # Skip already completed calls when resuming
                if resuming_turn and call.id in completed_call_ids:
                    continue
                if steps_this_turn >= max_steps:
                    # Step budget excedido - injeta tool result sintético
                    budget_msg = f"Limite de passos do turno atingido ({max_steps}). Conclua com o que já tem."
                    yield StreamEvent(
                        type="tool_end",
                        data={
                            "name": call.name,
                            "friendly_name": self.tools.get_friendly_name(call.name) if hasattr(self.tools, "get_friendly_name") else call.name,
                            "result": budget_msg,
                            "status": "step_budget_exceeded",
                            "duration_ms": 0,
                            "error_type": "step_budget_exceeded",
                            "is_recoverable": False,
                            "scope": self.tools.get_scope(call.name).value,
                            "call_id": call.id or f"call_{uuid.uuid4().hex[:8]}",
                        },
                    )
                    req_memory.add_tool_result(call.name, budget_msg, tool_call_id=call.id or f"call_{uuid.uuid4().hex[:8]}")
                    continue

                scope_enum = self.tools.get_scope(call.name)
                friendly_label = self.tools.get_friendly_name(call.name) if hasattr(self.tools, "get_friendly_name") else call.name
                c_id = call.id or f"call_{uuid.uuid4().hex[:8]}"

                # Converte call para ToolCall do contrato
                tool_call = ToolCall(
                    call_id=c_id,
                    name=call.name,
                    arguments=call.arguments,
                )

                # DEVICE sempre sai pelo ExecutorTransport. Em cloud, o
                # RemoteHostExecutor enfileira a call e aguarda o host concluir.
                # DEVICE usa o transporte; CLOUD/HOME executam no registry.
                try:
                    if scope_enum == ToolScope.DEVICE:
                        result = await transport.execute(tool_call, uid, timeout=15.0)
                        res = result.output
                        tool_status = result.status
                        duration_ms = result.duration_ms
                        error_type = result.error_type
                        is_recoverable = result.is_recoverable
                        host_id = result.host_id
                    else:
                        cloud_result = await self.tools.execute_structured(
                            call.name,
                            call.arguments,
                            prefer_remote=False,
                            call_id=c_id,
                            user_id=uid,
                            timeout=15.0,
                        )
                        res = cloud_result["output"]
                        tool_status = cloud_result["status"]
                        duration_ms = cloud_result.get("duration_ms", 0)
                        error_type = cloud_result.get("error_type")
                        is_recoverable = cloud_result.get("is_recoverable", False)
                        host_id = None
                except Exception as e:
                    logger.exception(f"Erro ao executar tool via transport: {e}")
                    res = f"Erro ao executar '{call.name}': {e}"
                    tool_status = "error"
                    duration_ms = 0
                    error_type = "transport_error"
                    is_recoverable = True
                    host_id = None

                req_memory.add_tool_result(call.name, res, tool_call_id=c_id)
                steps_this_turn += 1
                # Track completed call for resumability
                if is_cloud:
                    completed_call_ids.add(c_id)
                    await self._persist_turn_state(
                        request_id, uid, thread_id, req_memory, "open",
                        pending_tools=[{
                            "call_id": pending_call.id,
                            "name": pending_call.name,
                            "arguments": pending_call.arguments,
                            "scope": self.tools.get_scope(pending_call.name).value,
                        } for pending_call in tool_calls if pending_call.id not in completed_call_ids],
                        steps_this_turn=steps_this_turn,
                        iterations=iterations,
                        completed_call_ids=completed_call_ids,
                    )
                yield StreamEvent(
                    type="tool_end",
                    data={
                        "name": call.name,
                        "friendly_name": friendly_label,
                        "result": res,
                        "status": tool_status,
                        "duration_ms": duration_ms,
                        "error_type": error_type,
                        "is_recoverable": is_recoverable,
                        "scope": scope_enum.value,
                        "call_id": c_id,
                        "host_id": host_id,
                    },
                )
                if call.name == "get_system_status":
                    try:
                        from core.widgets import build_server_health_widget_payload
                        from tools.system_info import get_system_metrics_dict
                        m_dict = get_system_metrics_dict()
                        health_widget = build_server_health_widget_payload(
                            cpu_percent=m_dict.get("cpu_percent", 0.0),
                            ram_percent=m_dict.get("ram_percent", 0.0),
                            database="healthy",
                            websocket="connected",
                            sse="connected",
                            title="Desempenho & Saúde do Sistema",
                        )
                        yield StreamEvent(type="widget", data=health_widget)
                    except Exception as w_err:
                        logger.warning(f"Aviso ao emitir ServerHealthWidget da tool: {w_err}")

            if _is_cancelled():
                final_reply = iteration_reply or final_reply
                break

            yield StreamEvent(type="status", data={"status": "thinking", "text": "Sintetizando resposta..."})

            if steps_this_turn >= max_steps or iterations >= max_iterations:
                final_reply = budget_reply
                break

        from core.message_parser import parse_assistant_message_content
        final_reply, _ = parse_assistant_message_content(final_reply)

        if _is_cancelled():
            if final_reply and final_reply.strip():
                req_memory.add_assistant(final_reply)
                self.memory = req_memory
            yield StreamEvent(
                type="cancelled",
                data={
                    "reply": final_reply,
                    "thread_id": thread_id,
                    "model": self.last_model_used,
                    "status": "cancelled",
                },
            )
            return

        if not final_reply or final_reply.startswith("Chamando ferramenta:"):
            final_reply = "Ação concluída com sucesso."

        if not self.planner.validate_response(final_reply):
            final_reply = "Desculpe, ocorreu um erro ao gerar a resposta."

        req_memory.add_assistant(final_reply)
        self.memory = req_memory

        if not emitted_any_token and final_reply and final_reply.strip():
            yield StreamEvent(type="token", data={"token": final_reply})

        # Etapa 10: Memory Extractor & Aprendizado Contínuo (executa em background sem travar o stream)
        try:
            from brain.memory.extractor import memory_extractor
            asyncio.create_task(
                memory_extractor.analyze_turn_async(
                    user_text=user_text,
                    assistant_reply=final_reply,
                    user_id=uid,
                    thread_id=thread_id,
                )
            )
        except Exception as e:
            logger.debug("Falha ao disparar memory_extractor em background: %s", e)

        # Mark turn as completed
        if is_cloud:
            await self._persist_turn_state(
                request_id,
                uid,
                thread_id,
                req_memory,
                "completed",
                steps_this_turn=steps_this_turn,
                iterations=iterations,
                completed_call_ids=completed_call_ids,
            )
        yield StreamEvent(type="done", data={"reply": final_reply, "thread_id": thread_id, "model": self.last_model_used})

    async def run_pipeline(
        self,
        user_text: str,
        skip_tts: bool = False,
        thread_id: str | None = None,
        user_id: str | None = None,
        user_name: str | None = None,
        history: list[dict] | None = None,
        images: list[dict] | None = None,
    ) -> str:
        """Executa o pipeline completo e retorna a resposta montada."""
        full_text = ""
        async for event in self.run_pipeline_stream(
            user_text,
            thread_id=thread_id,
            user_id=user_id,
            user_name=user_name,
            history=history,
            images=images,
        ):
            if event.type == "done":
                full_text = event.data.get("reply", "")

        if not skip_tts and full_text and self.tts:
            await self.tts.speak(full_text)

        return full_text
