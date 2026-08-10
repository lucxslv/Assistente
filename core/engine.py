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
        continuous_mode = False
        logger.info("Assistente iniciada de forma silenciosa.")

        while self._running:
            manual_text_trigger = False
            
            if config.wake_word_enabled and not continuous_mode:
                print("\n" + "="*50)
                print(" 🗣️ Diga a palavra mágica para falar...")
                print(" ⌨️ Ou aperte 'ENTER' para digitar seu comando.")
                print("="*50 + "\n")
                
                manual_text_trigger = await self.wakeword.wait_for_wake_word()

            try:
                user_text = None
                
                if manual_text_trigger:
                    import asyncio
                    # Pede o texto no terminal sem bloquear o loop assíncrono
                    user_text = await asyncio.to_thread(input, "📝 Digite seu comando: ")
                else:
                    media_manager.set_ducking(True)
                    try:
                        user_text = await self.pipeline.process_voice_input()
                    except Exception:
                        logger.exception("Erro na captura/transcrição de voz")
                        continuous_mode = False
                        continue
                    finally:
                        media_manager.set_ducking(False)

                if not user_text or not user_text.strip():
                    continuous_mode = False
                    continue

                if self._is_exit_command(user_text):
                    await self.pipeline.tts.speak("Até logo!")
                    continuous_mode = False
                    break

                try:
                    await self.pipeline.run_pipeline(user_text)
                    continuous_mode = True
                except Exception:
                    logger.exception("Erro ao processar solicitação")
                    continuous_mode = False
                    await self.pipeline.tts.speak(
                        "Ocorreu um erro ao processar sua solicitação."
                    )
            except Exception as e:
                logger.exception("Erro fatal no loop principal: %s", e)
                continuous_mode = False

    async def shutdown(self) -> None:
        self._running = False
        await self.wakeword.close()

    @staticmethod
    def _is_exit_command(text: str) -> bool:
        normalized = text.strip().lower()
        return normalized in {"sair", "tchau", "encerrar", "desligar", "exit", "quit"}
