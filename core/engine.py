"""Orquestrador principal do ciclo de vida da assistente."""

import logging

from audio.wakeword import WakeWordDetector
from config import config
from core.pipeline import AssistantPipeline
from tools.media_player import media_manager

logger = logging.getLogger(__name__)


class AssistantEngine:
    """Gerencia o loop principal da assistente de voz."""

    def __init__(self) -> None:
        self.pipeline = AssistantPipeline()
        self.wakeword = WakeWordDetector()
        self._running = False

    async def run(self) -> None:
        self._running = True
        await self.pipeline.tts.speak(
            f"Olá, sou a {config.assistant_name}. Como posso ajudar?"
        )

        while self._running:
            if config.wake_word_enabled:
                await self.wakeword.wait_for_wake_word()

            try:
                media_manager.set_ducking(True)
                
                try:
                    user_text = await self.pipeline.process_voice_input()
                except Exception:
                    logger.exception("Erro na captura/transcrição de voz")
                    continue

                if not user_text:
                    continue

                if self._is_exit_command(user_text):
                    await self.pipeline.tts.speak("Até logo!")
                    break

                try:
                    await self.pipeline.run_pipeline(user_text)
                except Exception:
                    logger.exception("Erro ao processar solicitação")
                    await self.pipeline.tts.speak(
                        "Ocorreu um erro ao processar sua solicitação."
                    )
            finally:
                media_manager.set_ducking(False)

    async def shutdown(self) -> None:
        self._running = False
        await self.wakeword.close()

    @staticmethod
    def _is_exit_command(text: str) -> bool:
        normalized = text.strip().lower()
        return normalized in {"sair", "tchau", "encerrar", "desligar", "exit", "quit"}
