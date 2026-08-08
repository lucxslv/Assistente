"""Pipeline Sequencial de 9 Etapas da Assistente."""

import logging

from audio.stt import SpeechToText
from audio.tts import TextToSpeech
from brain.context.manager import ContextManager
from brain.planner.planner import IntentPlanner
from brain.profile import AssistantProfile
from brain.prompts.prompts import build_system_prompt
from brain.router.router import LLMRouter
from config import config
from core.memory import ConversationMemory
from memory.retrieval.retriever import MemoryRetriever
from providers import (
    GeminiProvider,
    OllamaProvider,
    OpenAIProvider,
    OpenRouterProvider,
    BaseLLMProvider
)
from tools.registry import ToolRegistry

logger = logging.getLogger(__name__)


class AssistantPipeline:
    """Implementa o ciclo linear de vida de uma requisição."""

    def __init__(self) -> None:
        self.stt = SpeechToText()
        self.tts = TextToSpeech()
        
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

    async def run_pipeline(self, user_text: str) -> None:
        """Executa as etapas de 3 a 9."""
        
        # Etapa 3: Analisador de Intenção
        intent = self.router.classify_intent(user_text)
        logger.info(f"Intenção detectada: {intent.value}")
        
        # Etapa 4: Contexto
        context_str = self.context_manager.build_context()
        
        # Etapa 5: Recuperador de Memória
        memory_str = self.retriever.get_summary_context()
        
        # Etapa 6: Selecionador de Ferramentas e Configuração do Prompt
        system_prompt = build_system_prompt(
            profile=self.profile,
            context=context_str,
            memory_summary=memory_str,
            tools=self.tools,
        )
        
        self.memory.add_user(user_text)

        # Etapa 7: LLM
        response = await self.llm.chat(
            system_prompt=system_prompt,
            messages=self.memory.get_messages(),
            tools=self.tools.get_schemas(),
        )

        if response.tool_calls:
            self.memory.add_assistant_tool_calls(response.tool_calls)
            
            last_result = ""
            for call in response.tool_calls:
                result = await self.tools.execute(call.name, call.arguments)
                self.memory.add_tool_result(call.name, result)
                last_result = result

            response = await self.llm.chat(
                system_prompt=system_prompt,
                messages=self.memory.get_messages(),
                tools=self.tools.get_schemas(),
            )
            
            reply = response.content or last_result or "Ação concluída."
        else:
            reply = response.content or "Desculpe, não consegui formular uma resposta."

        # Etapa 8: Validador
        if not self.planner.validate_response(reply):
            reply = "Desculpe, ocorreu um erro ao gerar a resposta."
            
        self.memory.add_assistant(reply)
        
        # Etapa 9: TTS
        await self.tts.speak(reply)
