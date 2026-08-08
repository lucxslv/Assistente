"""Orquestrador: junta Voz -> LLM -> Ação -> Resposta."""

import logging

from config import config
from core.memory import ConversationMemory
from llm.client import LLMClient
from llm.prompts import get_system_prompt
from perception.stt import SpeechToText
from perception.tts import TextToSpeech
from perception.wakeword import WakeWordDetector
from tools.registry import ToolRegistry

logger = logging.getLogger(__name__)


class AssistantEngine:
    """Fluxo principal da assistente de voz."""

    def __init__(self) -> None:
        self.memory = ConversationMemory(max_messages=config.max_history_messages)
        self.llm = LLMClient()
        self.stt = SpeechToText()
        self.tts = TextToSpeech()
        self.wakeword = WakeWordDetector()
        self.tools = ToolRegistry()
        self._running = False

    async def run(self) -> None:
        self._running = True
        await self.tts.speak(f"Olá, sou a {config.assistant_name}. Como posso ajudar?")

        while self._running:
            if config.wake_word_enabled:
                await self.wakeword.wait_for_wake_word()

            user_text = await self._listen()
            if not user_text:
                continue

            if self._is_exit_command(user_text):
                await self.tts.speak("Até logo!")
                break

            response = await self._process(user_text)
            await self.tts.speak(response)

    async def _listen(self) -> str | None:
        logger.info("Ouvindo...")
        try:
            text = await self.stt.transcribe()
            if text:
                logger.info("Usuário: %s", text)
            return text
        except Exception:
            logger.exception("Erro na transcrição")
            return None

    async def _process(self, user_text: str) -> str:
        self.memory.add_user(user_text)

        system_prompt = get_system_prompt(
            assistant_name=config.assistant_name,
            tools=self.tools.list_tools(),
        )

        try:
            response = await self.llm.chat(
                system_prompt=system_prompt,
                messages=self.memory.get_messages(),
                tools=self.tools.get_schemas(),
            )

            if response.tool_calls:
                for call in response.tool_calls:
                    result = await self.tools.execute(call.name, call.arguments)
                    self.memory.add_tool_result(call.name, result)

                response = await self.llm.chat(
                    system_prompt=system_prompt,
                    messages=self.memory.get_messages(),
                    tools=self.tools.get_schemas(),
                )

            reply = response.content or "Desculpe, não consegui formular uma resposta."
            self.memory.add_assistant(reply)
            return reply

        except Exception:
            logger.exception("Erro ao processar mensagem")
            return "Ocorreu um erro ao processar sua solicitação."

    async def shutdown(self) -> None:
        self._running = False
        await self.wakeword.close()

    @staticmethod
    def _is_exit_command(text: str) -> bool:
        normalized = text.strip().lower()
        return normalized in {"sair", "tchau", "encerrar", "desligar", "exit", "quit"}
