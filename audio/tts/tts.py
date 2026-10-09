"""Text-to-Speech — sintetizador de voz com suporte a ElevenLabs e Edge-TTS com fallback automático."""

import asyncio
import logging
import re
import tempfile
from pathlib import Path
from typing import Optional

import edge_tts
import httpx
import sounddevice as sd
import soundfile as sf

from config import config

logger = logging.getLogger(__name__)


class TextToSpeech:
    """Converte texto em áudio e reproduz no alto-falante."""

    def __init__(self) -> None:
        self.provider: str = config.tts_provider.lower()
        self.voice: str = config.tts_voice
        self.elevenlabs_api_key: str = config.elevenlabs_api_key
        self.elevenlabs_voice_id: str = config.elevenlabs_voice_id
        self.elevenlabs_model_id: str = config.elevenlabs_model_id
        self.chatterbox_api_url: str = config.chatterbox_api_url
        self.chatterbox_model_type: str = config.chatterbox_model_type
        self.chatterbox_exaggeration: float = config.chatterbox_exaggeration

    def _clean_text(self, text: str) -> str:
        """Higieniza o texto removendo blocos de código markdown, links e símbolos brutos para fala fluida."""
        if not text:
            return ""
        # Remove blocos de código com cercadura tripla
        t = re.sub(r"```[\s\S]*?```", "", text)
        # Remove código inline
        t = re.sub(r"`[^`]*`", "", t)
        # Remove URLs completas
        t = re.sub(r"https?://\S+", "", t)
        # Remove formatação markdown pesada (asteriscos, sustenidos, til)
        t = re.sub(r"[*_~#>]", " ", t)
        # Normaliza espaços
        t = re.sub(r"\s+", " ", t).strip()
        return t

    async def speak(self, text: str) -> None:
        cleaned_text = self._clean_text(text)
        if not cleaned_text:
            return

        logger.info("Assistente (TTS): %s", cleaned_text)
        audio_path = await self._synthesize(cleaned_text)

        if not audio_path:
            return

        try:
            await asyncio.to_thread(self._play, audio_path)
        finally:
            audio_path.unlink(missing_ok=True)

    async def _synthesize(self, text: str) -> Optional[Path]:
        """Sintetiza áudio selecionando o provedor configurado com fallback automático."""
        if self.provider == "chatterbox":
            audio_path = await self._synthesize_chatterbox(text)
            if audio_path:
                return audio_path
            logger.warning("Falha na síntese com Chatterbox. Acionando fallback automático para Edge-TTS...")
            return await self._synthesize_edge(text)

        if self.provider == "elevenlabs":
            audio_path = await self._synthesize_elevenlabs(text)
            if audio_path:
                return audio_path
            logger.warning("Falha na síntese com ElevenLabs. Acionando fallback automático para Edge-TTS...")
            return await self._synthesize_edge(text)

        return await self._synthesize_edge(text)

    async def _synthesize_chatterbox(self, text: str) -> Optional[Path]:
        """Sintetiza áudio via API Serverless do Chatterbox (Modal ou endpoint customizado)."""
        if not self.chatterbox_api_url:
            logger.warning("Chatterbox configurado mas CHATTERBOX_API_URL não informado.")
            return None

        url = self.chatterbox_api_url.strip().rstrip("/")
        if not (url.endswith("/tts") or url.endswith("/speech")):
            url = f"{url}/tts"

        payload = {
            "text": text,
            "language_id": "pt",
            "model_type": self.chatterbox_model_type or "multilingual",
            "exaggeration": self.chatterbox_exaggeration,
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(url, json=payload)
                if response.status_code == 200:
                    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
                    tmp.write(response.content)
                    tmp_path = Path(tmp.name)
                    tmp.close()
                    return tmp_path
                else:
                    logger.warning(
                        "Erro na API Chatterbox (HTTP %d): %s",
                        response.status_code,
                        response.text[:200],
                    )
                    return None
        except Exception as e:
            logger.warning("Exceção ao chamar Chatterbox API (%s): %s", url, e)
            return None

    async def _synthesize_elevenlabs(self, text: str) -> Optional[Path]:
        """Sintetiza voz de alta qualidade via API oficial do ElevenLabs."""
        if not self.elevenlabs_api_key or not self.elevenlabs_voice_id:
            logger.warning("ElevenLabs configurado mas ELEVENLABS_API_KEY ou ELEVENLABS_VOICE_ID não informados.")
            return None

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{self.elevenlabs_voice_id}"
        headers = {
            "xi-api-key": self.elevenlabs_api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        }
        payload = {
            "text": text,
            "model_id": self.elevenlabs_model_id or "eleven_multilingual_v2",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                if response.status_code == 200:
                    tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
                    tmp.write(response.content)
                    tmp_path = Path(tmp.name)
                    tmp.close()
                    return tmp_path
                else:
                    logger.warning(
                        "Erro na API ElevenLabs (HTTP %d): %s",
                        response.status_code,
                        response.text[:200],
                    )
                    return None
        except Exception as e:
            logger.warning("Exceção ao chamar ElevenLabs API: %s", e)
            return None

    async def _synthesize_edge(self, text: str) -> Optional[Path]:
        """Sintetiza voz via Edge-TTS (local/Microsoft)."""
        communicate = edge_tts.Communicate(text, self.voice)
        tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        tmp_path = Path(tmp.name)
        tmp.close()

        try:
            await communicate.save(str(tmp_path))
            return tmp_path
        except edge_tts.exceptions.NoAudioReceived:
            logger.warning("Nenhum áudio gerado pelo Edge-TTS (texto sem conteúdo fonético).")
            tmp_path.unlink(missing_ok=True)
            return None
        except Exception as e:
            logger.warning("Erro inesperado no Edge-TTS: %s", e)
            tmp_path.unlink(missing_ok=True)
            return None

    def _play(self, path: Path) -> None:
        """Reproduz o arquivo de áudio no dispositivo padrão do Windows."""
        try:
            data, sample_rate = sf.read(str(path), dtype="float32")
            sd.play(data, sample_rate)
            sd.wait()
        except Exception as e:
            logger.warning("Erro ao reproduzir áudio no alto-falante: %s", e)
