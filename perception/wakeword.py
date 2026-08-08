"""Detecção da palavra de ativação (opcional no MVP)."""

import asyncio
import logging

from config import config

logger = logging.getLogger(__name__)


class WakeWordDetector:
    """Aguarda a palavra de ativação antes de escutar comandos."""

    def __init__(self) -> None:
        self._porcupine = None
        self._enabled = config.wake_word_enabled

    async def wait_for_wake_word(self) -> None:
        if not self._enabled:
            return

        logger.debug("Aguardando wake word: '%s'", config.wake_word)
        # MVP: placeholder — integrar Porcupine ou similar em produção
        await asyncio.sleep(0.1)

    async def close(self) -> None:
        if self._porcupine is not None:
            self._porcupine.delete()
            self._porcupine = None
