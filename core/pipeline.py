"""Pipeline Sequencial de 9 Etapas da Assistente."""

import asyncio
import logging

from brain.context.manager import ContextManager
from brain.planner.planner import IntentPlanner, IntentCategory
from brain.profile import AssistantProfile
from brain.prompts.prompts import build_system_prompt
from brain.router.router import LLMRouter
from config import config
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
    ) -> AsyncGenerator[StreamEvent, None]:
        """Executa o pipeline em modo streaming, emitindo tokens e eventos em tempo real."""
        try:
            from api.routes.auth import current_user_id_var, current_user_name_var
            uid = user_id or current_user_id_var.get()
            uname = user_name or current_user_name_var.get()
        except Exception:
            uid = user_id or "default"
            uname = user_name

        yield StreamEvent(type="status", data={"status": "thinking", "text": "Consultando contexto e memórias..."})

        # Etapa 3: Roteador Híbrido de Modelos (Fast LLM vs. Reasoning LLM)
        route_decision = self.router.route(user_text)
        logger.info(f"Rota selecionada: {route_decision.mode.value} -> {route_decision.model_name} ({route_decision.reason})")

        # Etapa 4: Contexto Inteligente & Presença
        asyncio.create_task(self.context_manager.refresh_weather_if_needed())
        context_str = self.context_manager.build_context(active_thread_id=thread_id, user_name=uname)

        # Etapa 5: Recuperador de Memória Semântica (RAG) estritamente isolado pelo user_id
        memory_str = self.retriever.get_summary_context(query=user_text, user_id=uid)

        # Etapa 6: Selecionador de Ferramentas e Configuração do Prompt Adaptativo
        system_prompt = build_system_prompt(
            profile=self.profile,
            context=context_str,
            memory_summary=memory_str,
            tools=self.tools,
            user_id=uid,
            thread_id=thread_id,
            user_text=user_text,
        )

        self.memory.add_user(user_text)
        active_tools = self.tools.get_schemas()

        MAX_ITERATIONS = 5
        iterations = 0
        final_reply = ""

        while iterations < MAX_ITERATIONS:
            iterations += 1
            iteration_reply = ""
            tool_calls = []

            # Streaming dos chunks e detecção de tool calls com suporte a fallback
            try:
                async for chunk in self.llm.chat_stream(
                    system_prompt=system_prompt,
                    messages=self.memory.get_messages(),
                    tools=active_tools,
                    model_override=route_decision.model_name,
                ):
                    if chunk.tool_calls:
                        tool_calls.extend(chunk.tool_calls)
                    if chunk.text:
                        iteration_reply += chunk.text
                        if not chunk.tool_calls:
                            yield StreamEvent(type="token", data={"token": chunk.text})
            except Exception as e:
                logger.warning(f"Aviso na rota {route_decision.model_name}: {e}. Executando fallback...")
                fallback_model = config.gemini_model
                if fallback_model != route_decision.model_name:
                    async for chunk in self.llm.chat_stream(
                        system_prompt=system_prompt,
                        messages=self.memory.get_messages(),
                        tools=active_tools,
                        model_override=fallback_model,
                    ):
                        if chunk.tool_calls:
                            tool_calls.extend(chunk.tool_calls)
                        if chunk.text:
                            iteration_reply += chunk.text
                            if not chunk.tool_calls:
                                yield StreamEvent(type="token", data={"token": chunk.text})
                else:
                    raise

            if not tool_calls:
                final_reply = iteration_reply or "Ação concluída."
                break

            self.memory.add_assistant_tool_calls(tool_calls)

            # Executa ferramentas notificando o stream
            for call in tool_calls:
                tool_scope = self.tools.get_scope(call.name).value
                yield StreamEvent(type="tool_start", data={"name": call.name, "args": call.arguments, "scope": tool_scope})
                res = await self.tools.execute(call.name, call.arguments, prefer_remote=True, call_id=call.id)
                self.memory.add_tool_result(call.name, res, tool_call_id=call.id)
                yield StreamEvent(type="tool_end", data={"name": call.name, "result": res, "scope": tool_scope})

            yield StreamEvent(type="status", data={"status": "thinking", "text": "Sintetizando resposta..."})

            if iterations == MAX_ITERATIONS:
                final_reply = iteration_reply or "Atingi o limite máximo de ações consecutivas."
                break

        import re
        final_reply = re.sub(r'<[^>]+>', '', final_reply).strip()
        final_reply = re.sub(r'\{.*?"name".*?\}', '', final_reply, flags=re.DOTALL).strip()
        final_reply = re.sub(r'\{.*?"action".*?\}', '', final_reply, flags=re.DOTALL).strip()
        if not final_reply:
            final_reply = "Ação concluída."

        if not self.planner.validate_response(final_reply):
            final_reply = "Desculpe, ocorreu um erro ao gerar a resposta."

        self.memory.add_assistant(final_reply)

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

        yield StreamEvent(type="done", data={"reply": final_reply, "thread_id": thread_id})

    async def run_pipeline(
        self,
        user_text: str,
        skip_tts: bool = False,
        thread_id: str | None = None,
        user_id: str | None = None,
        user_name: str | None = None,
    ) -> str:
        """Executa o pipeline completo e retorna a resposta montada."""
        full_text = ""
        async for event in self.run_pipeline_stream(
            user_text,
            thread_id=thread_id,
            user_id=user_id,
            user_name=user_name,
        ):
            if event.type == "done":
                full_text = event.data.get("reply", "")

        if not skip_tts and full_text and self.tts:
            await self.tts.speak(full_text)

        return full_text
