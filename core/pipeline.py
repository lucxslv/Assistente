"""Pipeline Sequencial de 9 Etapas da Assistente."""

import asyncio
import logging
import os
import platform

from config import config
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
from brain.prompts.prompts import build_system_prompt
from tools.registry import ToolRegistry

logger = logging.getLogger(__name__)


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
        self.memory = ConversationMemory(max_messages=config.max_history_messages)
        self.llm = self._get_llm_provider()
        self.last_model_used: str = config.gemini_model

    def _get_llm_provider(self) -> BaseLLMProvider:
        provider = config.llm_provider.lower()
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

    async def run_pipeline_stream(
        self,
        user_text: str,
        thread_id: str | None = None,
        user_id: str | None = None,
        user_name: str | None = None,
        tool_results: list[dict] | None = None,
        history: list[dict] | None = None,
        images: list[dict] | None = None,
    ) -> AsyncGenerator[StreamEvent, None]:
        """Executa o pipeline em modo streaming, emitindo tokens e eventos em tempo real."""
        import os
        import uuid
        from tools.registry import ToolScope

        is_cloud = bool(
            os.getenv("VERCEL")
            or os.getenv("AWS_LAMBDA_FUNCTION_NAME")
            or os.getenv("CHARLIE_RUNTIME_MODE") == "cloud"
            or (platform.system() != "Windows" and os.getenv("CHARLIE_ENV") != "local_dev")
        )

        try:
            from api.routes.auth import current_user_id_var, current_user_name_var
            uid = user_id or current_user_id_var.get()
            uname = user_name or current_user_name_var.get()
            current_user_id_var.set(uid)
            if uname:
                current_user_name_var.set(uname)
        except Exception:
            uid = user_id or "default"
            uname = user_name

        yield StreamEvent(type="status", data={"status": "thinking", "text": "Consultando contexto e memórias..."})

        # Inicializa memória da conversa isolada para esta requisição/thread
        req_memory = ConversationMemory(max_messages=config.max_history_messages)

        # 1. Hidrata o histórico persistido do banco de dados (ou payload) se fornecido
        if history:
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

        # Etapa 3: Roteador Híbrido de Modelos (Fast LLM vs. Reasoning LLM)
        route_decision = self.router.route(user_text or "continuar análise do sistema")
        self.last_model_used = route_decision.model_name
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

        # Etapa 6.1: Transição Fluida para o Modo Agêntico (Chat-to-Agent Seamless Flow)
        if route_decision.mode == RouteMode.AGENTIC:
            from brain.agent.runtime import agent_runtime
            yield StreamEvent(type="status", data={"status": "thinking", "text": "Iniciando Agent Runtime: planejando grafo de tarefas (DAG)..."})

            listener_queue: asyncio.Queue = asyncio.Queue()
            agent_runtime.register_listener(listener_queue)

            try:
                graph = await agent_runtime.start_session(goal=user_text, project="Charlie")
                yield StreamEvent(type="agent_plan", data=graph.to_dict())

                loop_timeout = 600.0
                start_time = asyncio.get_event_loop().time()

                while not agent_runtime.is_cancelled:
                    if asyncio.get_event_loop().time() - start_time > loop_timeout:
                        yield StreamEvent(type="error", data={"error": "Tempo limite de execução da meta excedido."})
                        break

                    try:
                        ev = await asyncio.wait_for(listener_queue.get(), timeout=1.0)
                    except asyncio.TimeoutError:
                        continue

                    ev_type = ev.get("type", "")
                    ev_data = ev.get("data", {})

                    if ev_type == "agent.started":
                        yield StreamEvent(type="status", data={"status": "thinking", "text": f"Agente iniciado para meta: {user_text}"})
                    elif ev_type == "agent.perception_parsed":
                        yield StreamEvent(type="agent_plan", data={"parsedGoal": ev_data.get("parsedGoal")})
                    elif ev_type == "task.created":
                        yield StreamEvent(type="agent_plan", data=ev_data)
                    elif ev_type == "thought.generated":
                        yield StreamEvent(type="thought", data={"thought": ev_data.get("thought"), "role": ev_data.get("role")})
                    elif ev_type in ("task.started", "task.completed"):
                        yield StreamEvent(type="task_step", data=ev_data)
                    elif ev_type == "tool.started":
                        yield StreamEvent(type="tool_start", data={"name": ev_data.get("tool"), "args": ev_data.get("arguments"), "taskId": ev_data.get("taskId")})
                    elif ev_type in ("tool.completed", "tool.failed"):
                        yield StreamEvent(type="tool_end", data={"name": ev_data.get("tool"), "result": ev_data.get("result") or ev_data.get("error"), "taskId": ev_data.get("taskId")})
                    elif ev_type == "verification.completed":
                        yield StreamEvent(type="evidence", data=ev_data)
                    elif ev_type == "reflection.diagnosed":
                        yield StreamEvent(type="reflection", data=ev_data)
                    elif ev_type == "agent.permission_requested":
                        yield StreamEvent(type="permission_requested", data=ev_data)
                    elif ev_type == "task.recovered":
                        yield StreamEvent(type="status", data={"status": "thinking", "text": f"Auto-correção aplicada: {ev_data.get('reason')}"})
                    elif ev_type == "agent.completed":
                        agent_summary = ev_data.get("summary", "Meta concluída com sucesso.")
                        yield StreamEvent(type="token", data={"token": f"\n\n### Relatório da Execução Agêntica\n{agent_summary}"})
                        yield StreamEvent(type="done", data={"reply": agent_summary, "thread_id": thread_id, "model": route_decision.model_name})
                        return
                    elif ev_type == "agent.failed":
                        reason = ev_data.get("reason", "Falha definitiva após auto-correções.")
                        err_msg = f"A execução da meta agêntica não pôde ser concluída: {reason}"
                        yield StreamEvent(type="error", data={"error": err_msg})
                        yield StreamEvent(type="done", data={"reply": err_msg, "thread_id": thread_id, "model": route_decision.model_name})
                        return

            finally:
                agent_runtime.unregister_listener(listener_queue)

        MAX_ITERATIONS = 5
        iterations = 0
        final_reply = ""
        emitted_any_token = False

        while iterations < MAX_ITERATIONS:
            iterations += 1
            iteration_reply = ""
            tool_calls = []

            # Streaming dos chunks e detecção de tool calls com suporte a fallback
            try:
                async for chunk in self.llm.chat_stream(
                    system_prompt=system_prompt,
                    messages=req_memory.get_messages(),
                    tools=active_tools,
                    model_override=route_decision.model_name,
                ):
                    if chunk.tool_calls:
                        tool_calls.extend(chunk.tool_calls)
                    if chunk.text:
                        chunk_text = chunk.text
                        stripped = chunk_text.strip()
                        if stripped.startswith("Chamando ferramenta:") or stripped.startswith("ToolCall("):
                            logger.warning(f"[pipeline] Suprimindo vazamento de ferramenta no stream: {stripped[:80]}")
                            continue
                        iteration_reply += chunk_text
                        if not chunk.tool_calls:
                            emitted_any_token = True
                            yield StreamEvent(type="token", data={"token": chunk_text})
            except Exception as e:
                logger.warning(f"Aviso na rota {route_decision.model_name}: {e}. Executando fallback...")
                fallback_model = config.gemini_model
                if fallback_model == route_decision.model_name:
                    fallback_model = "gemini-flash-lite-latest" if route_decision.model_name != "gemini-flash-lite-latest" else "gemini-3.5-flash-lite"

                if fallback_model != route_decision.model_name:
                    if emitted_any_token:
                        logger.info(f"[pipeline] Falha mid-stream detectada ({len(iteration_reply)} chars). Emitindo reset_and_fallback.")
                        yield StreamEvent(
                            type="reset_and_fallback",
                            data={
                                "reason": f"Fallback ativado após erro no modelo {route_decision.model_name}: {e}",
                                "fallback_model": fallback_model,
                            },
                        )
                    iteration_reply = ""
                    tool_calls.clear()
                    emitted_any_token = False
                    self.last_model_used = fallback_model

                    try:
                        async for chunk in self.llm.chat_stream(
                            system_prompt=system_prompt,
                            messages=req_memory.get_messages(),
                            tools=active_tools,
                            model_override=fallback_model,
                        ):
                            if chunk.tool_calls:
                                tool_calls.extend(chunk.tool_calls)
                            if chunk.text:
                                chunk_text = chunk.text
                                stripped = chunk_text.strip()
                                if stripped.startswith("Chamando ferramenta:") or stripped.startswith("ToolCall("):
                                    logger.warning(f"[pipeline] Suprimindo vazamento de ferramenta no stream fallback: {stripped[:80]}")
                                    continue
                                iteration_reply += chunk_text
                                if not chunk.tool_calls:
                                    emitted_any_token = True
                                    yield StreamEvent(type="token", data={"token": chunk_text})
                    except Exception as fb_err:
                        logger.error(f"[pipeline] Falha também no modelo de fallback {fallback_model}: {fb_err}")
                        yield StreamEvent(type="error", data={"error": f"Erro nos modelos de linguagem: {fb_err}"})
                        final_reply = "Desculpe, ocorreu uma instabilidade temporária na comunicação com os modelos de IA. Por favor, tente novamente em instantes."
                        break
                else:
                    logger.error(f"[pipeline] Rota {route_decision.model_name} falhou sem modelo alternativo: {e}")
                    yield StreamEvent(type="error", data={"error": str(e)})
                    final_reply = "Desculpe, ocorreu um erro ao gerar a resposta. Por favor, tente novamente."
                    break

            if not tool_calls:
                final_reply = iteration_reply or "Ação concluída."
                break

            req_memory.add_assistant_tool_calls(tool_calls)

            # Notifica início das ferramentas
            client_tools_to_exec = []
            for call in tool_calls:
                scope_enum = self.tools.get_scope(call.name)
                c_id = call.id or f"call_{uuid.uuid4().hex[:8]}"
                yield StreamEvent(
                    type="tool_start",
                    data={
                        "name": call.name,
                        "args": call.arguments,
                        "scope": scope_enum.value,
                        "call_id": c_id,
                    },
                )
                if is_cloud and scope_enum == ToolScope.DEVICE:
                    client_tools_to_exec.append({
                        "call_id": c_id,
                        "name": call.name,
                        "args": call.arguments,
                    })

            # Se estiver na nuvem e houver ferramentas de dispositivo, despacha para execução física no Windows via Desktop
            if client_tools_to_exec:
                yield StreamEvent(
                    type="client_tool_request",
                    data={
                        "thread_id": thread_id,
                        "tools": client_tools_to_exec,
                    },
                )
                cloud_reply = "Comando de dispositivo enviado para execução no seu computador."
                yield StreamEvent(type="token", data={"token": cloud_reply})
                yield StreamEvent(type="done", data={"reply": cloud_reply, "thread_id": thread_id, "model": self.last_model_used})
                return

            # Executa ferramentas no servidor (ambiente local ou ferramentas cloud/web)
            for call in tool_calls:
                scope_enum = self.tools.get_scope(call.name)
                c_id = call.id or f"call_{uuid.uuid4().hex[:8]}"
                res = await self.tools.execute(call.name, call.arguments, prefer_remote=True, call_id=c_id)
                req_memory.add_tool_result(call.name, res, tool_call_id=c_id)
                yield StreamEvent(
                    type="tool_end",
                    data={
                        "name": call.name,
                        "result": res,
                        "scope": scope_enum.value,
                        "call_id": c_id,
                    },
                )

            yield StreamEvent(type="status", data={"status": "thinking", "text": "Sintetizando resposta..."})

            if iterations == MAX_ITERATIONS:
                final_reply = iteration_reply or "Atingi o limite máximo de ações consecutivas."
                break

        import re
        final_reply = re.sub(r'<[^>]+>', '', final_reply).strip()
        final_reply = re.sub(r'Chamando ferramenta:[^\n]*', '', final_reply).strip()
        final_reply = re.sub(r'ToolCall\([^\)]*\)', '', final_reply).strip()
        final_reply = re.sub(r'\{.*?"name".*?\}', '', final_reply, flags=re.DOTALL).strip()
        final_reply = re.sub(r'\{.*?"action".*?\}', '', final_reply, flags=re.DOTALL).strip()
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
