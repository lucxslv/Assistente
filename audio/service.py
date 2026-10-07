"""VoiceService — daemon desacoplado para orquestração de voz contínua, Wake Word, STT e TTS."""

import asyncio
import logging
from enum import Enum
from typing import Any, Dict, Optional

from config import config

logger = logging.getLogger(__name__)


class VoiceState(str, Enum):
    STOPPED = "stopped"
    IDLE = "idle"
    LISTENING = "listening"
    THINKING = "thinking"
    SPEAKING = "speaking"
    ERROR = "error"


class VoiceService:
    """Orquestrador do ciclo de vida de voz em segundo plano no Windows."""

    def __init__(self) -> None:
        self.state: VoiceState = VoiceState.STOPPED
        self._pipeline = None
        self._stt = None
        self._tts = None
        self._wakeword = None
        self._task: Optional[asyncio.Task] = None
        self._running: bool = False

    @property
    def pipeline(self):
        if self._pipeline is None:
            from core.pipeline import AssistantPipeline
            self._pipeline = AssistantPipeline()
        return self._pipeline

    @pipeline.setter
    def pipeline(self, val):
        self._pipeline = val

    @property
    def stt(self):
        if self._stt is None:
            from audio.stt import SpeechToText
            self._stt = SpeechToText()
        return self._stt

    @stt.setter
    def stt(self, val):
        self._stt = val

    @property
    def tts(self):
        if self._tts is None:
            from audio.tts import TextToSpeech
            self._tts = TextToSpeech()
        return self._tts

    @tts.setter
    def tts(self, val):
        self._tts = val

    @property
    def wakeword(self):
        if self._wakeword is None:
            from audio.wakeword import WakeWordDetector
            self._wakeword = WakeWordDetector()
        return self._wakeword

    @wakeword.setter
    def wakeword(self, val):
        self._wakeword = val

    def get_status(self) -> Dict[str, Any]:
        """Retorna o estado operacional atual do serviço de voz."""
        return {
            "running": self.state != VoiceState.STOPPED,
            "state": self.state.value,
            "wake_word": config.wake_word,
            "wake_word_enabled": config.wake_word_enabled,
            "tts_provider": config.tts_provider,
            "tts_voice": config.tts_voice,
            "stt_provider": config.stt_provider,
        }

    async def start(self) -> None:
        """Inicia a escuta contínua em segundo plano."""
        if self._running:
            return

        self._running = True
        self.state = VoiceState.IDLE
        self._task = asyncio.create_task(self._main_loop())
        logger.info("VoiceService: Iniciado com sucesso.")

    async def stop(self) -> None:
        """Interrompe a escuta em segundo plano e libera periféricos."""
        self._running = False
        self.state = VoiceState.STOPPED

        if self._wakeword:
            self._wakeword.stop()
            await self._wakeword.close()

        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

        logger.info("VoiceService: Parado com sucesso.")

    async def process_voice_turn(self) -> bool:
        """Executa um ciclo completo de escuta -> transcrição -> raciocínio -> fala."""
        from tools.media_player import media_manager

        self.state = VoiceState.LISTENING
        logger.info("VoiceService: Estado -> LISTENING (Aguardando fala do usuário)")

        user_text = None
        try:
            media_manager.set_ducking(True)
            user_text = await self.stt.transcribe()
        except Exception as e:
            logger.exception("VoiceService: Falha na captura/transcrição de fala: %s", e)
            self.state = VoiceState.IDLE
            return False
        finally:
            media_manager.set_ducking(False)

        if not user_text or not user_text.strip():
            logger.debug("VoiceService: Nenhuma fala transcrita ou silêncio.")
            self.state = VoiceState.IDLE
            return False

        logger.info("VoiceService: Usuário disse: '%s'", user_text)

        # Processamento cognitivo
        self.state = VoiceState.THINKING
        assistant_reply = ""
        try:
            assistant_reply = await self.pipeline.run_pipeline(user_text, skip_tts=True)
        except Exception as e:
            logger.exception("VoiceService: Erro no pipeline cognitivo: %s", e)
            assistant_reply = "Desculpe, ocorreu uma instabilidade ao processar seu comando."

        # Síntese e fala
        self.state = VoiceState.SPEAKING
        try:
            media_manager.set_ducking(True)
            if assistant_reply and assistant_reply.strip():
                await self.tts.speak(assistant_reply)
        except Exception as e:
            logger.exception("VoiceService: Erro na síntese de áudio: %s", e)
        finally:
            media_manager.set_ducking(False)
            self.state = VoiceState.IDLE

        return True

    async def _main_loop(self) -> None:
        """Loop contínuo em segundo plano aguardando palavra de ativação."""
        logger.info("VoiceService: Loop contínuo ativo aguardando Wake Word '%s'...", config.wake_word)

        while self._running:
            try:
                self.state = VoiceState.IDLE
                # Trava de forma não bloqueante até a palavra ser dita
                manual_break = await self.wakeword.wait_for_wake_word()
                if not self._running:
                    break

                # Dispara o turno de voz
                await self.process_voice_turn()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.exception("VoiceService: Erro no loop de escuta: %s", e)
                await asyncio.sleep(1.0)

        self.state = VoiceState.STOPPED


# Instância global singleton do serviço de voz
voice_service = VoiceService()
