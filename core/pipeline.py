"""Pipeline Sequencial de 9 Etapas da Assistente."""

import asyncio
import logging

from audio.stt import SpeechToText
from audio.tts import TextToSpeech
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

        # Oculta as ferramentas se a intenção for puramente casual
        active_tools = self.tools.get_schemas() if intent != IntentCategory.CASUAL else None

        # Etapa 7: LLM (Loop Multitarefas)
        MAX_ITERATIONS = 5
        iterations = 0
        reply = ""
        
        while iterations < MAX_ITERATIONS:
            iterations += 1
            
            response = await self.llm.chat(
                system_prompt=system_prompt,
                messages=self.memory.get_messages(),
                tools=active_tools,
            )
            
            if not response.tool_calls:
                reply = response.content or "Ação concluída."
                break
                
            self.memory.add_assistant_tool_calls(response.tool_calls)
            
            # Função auxiliar para executar e salvar o resultado de uma ferramenta
            async def execute_and_store(call):
                res = await self.tools.execute(call.name, call.arguments)
                self.memory.add_tool_result(call.name, res, tool_call_id=call.id)
            
            # Executa todas as ferramentas solicitadas em paralelo
            await asyncio.gather(*(execute_and_store(call) for call in response.tool_calls))
            
            if iterations == MAX_ITERATIONS:
                reply = response.content or "Atingi o limite máximo de ações consecutivas."
                break

        import re
        # Remove HTML/XML tags
        reply = re.sub(r'<[^>]+>', '', reply).strip()
        
        # Blindagem: Modelos pequenos (Llama 3 8B) podem alucinar JSON (ex: {"name": "..."}) no texto.
        # Removemos blocos parecidos com JSON bruto para a IA não falar isso em voz alta
        reply = re.sub(r'\{.*?"name".*?\}', '', reply, flags=re.DOTALL).strip()
        reply = re.sub(r'\{.*?"action".*?\}', '', reply, flags=re.DOTALL).strip()
        
        if not reply:
            reply = "Ação concluída."

        # Etapa 8: Validador
        if not self.planner.validate_response(reply):
            reply = "Desculpe, ocorreu um erro ao gerar a resposta."
            
        self.memory.add_assistant(reply)
        
        # Etapa 9: TTS
        await self.tts.speak(reply)
