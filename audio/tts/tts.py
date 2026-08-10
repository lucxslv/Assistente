"""Text-to-Speech — sintetizador de voz."""

import asyncio
import logging
import tempfile
from pathlib import Path

import edge_tts
import sounddevice as sd
import soundfile as sf

from config import config

logger = logging.getLogger(__name__)


class TextToSpeech:
    """Converte texto em áudio e reproduz no alto-falante."""

    def __init__(self) -> None:
        self.voice = config.tts_voice

    async def speak(self, text: str) -> None:
        if not text.strip():
            return

        logger.info("Assistente: %s", text)
        audio_path = await self._synthesize(text)
        
        if not audio_path:
            return
            
        try:
            await asyncio.to_thread(self._play, audio_path)
        finally:
            audio_path.unlink(missing_ok=True)

    async def _synthesize(self, text: str) -> Path:
        communicate = edge_tts.Communicate(text, self.voice)
        tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        tmp_path = Path(tmp.name)
        tmp.close()

        try:
            await communicate.save(str(tmp_path))
            return tmp_path
        except edge_tts.exceptions.NoAudioReceived:
            logger.warning("Nenhum áudio gerado pelo TTS (texto provavelmente contém apenas emojis ou símbolos impronunciáveis).")
            tmp_path.unlink(missing_ok=True)
            return None

    def _play(self, path: Path) -> None:
        data, sample_rate = sf.read(str(path), dtype="float32")
        sd.play(data, sample_rate)
        sd.wait()
