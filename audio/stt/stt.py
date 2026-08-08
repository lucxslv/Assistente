"""Speech-to-Text — transcrição de voz para texto usando faster-whisper com detecção dinâmica de silêncio."""

import asyncio
import logging

import numpy as np
import sounddevice as sd

from config import config

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16_000
CHANNELS = 1


class SpeechToText:
    """Captura áudio do microfone e transcreve para texto usando faster-whisper."""

    def __init__(self) -> None:
        self._model = None

    def _load_model(self):
        if self._model is None:
            from faster_whisper import WhisperModel

            logger.info(
                "Carregando modelo Faster-Whisper: %s (device=%s, compute_type=%s)",
                config.whisper_model,
                config.whisper_device,
                config.whisper_compute_type,
            )
            self._model = WhisperModel(
                model_size_or_path=config.whisper_model,
                device=config.whisper_device,
                compute_type=config.whisper_compute_type,
            )
        return self._model

    async def transcribe(self, duration: float | None = None) -> str | None:
        audio = await asyncio.to_thread(self._record_dynamic, duration)
        if audio is None or len(audio) == 0:
            return None

        if config.stt_provider.lower() == "groq":
            return await asyncio.to_thread(self._transcribe_groq, audio)
        return await asyncio.to_thread(self._transcribe_local, audio)

    def _record_dynamic(self, fixed_duration: float | None = None) -> np.ndarray | None:
        chunk_sec = 0.05  # Bloco de 50ms (800 amostras)
        chunk_samples = int(SAMPLE_RATE * chunk_sec)
        
        silence_threshold = config.stt_silence_threshold
        silence_duration = config.stt_silence_duration
        max_duration = fixed_duration or config.stt_max_duration
        initial_timeout = 6.0  # Tempo limite para começar a falar

        recorded_chunks: list[np.ndarray] = []
        has_spoken = False
        silent_chunks = 0
        
        max_silent_chunks = int(silence_duration / chunk_sec)
        max_total_chunks = int(max_duration / chunk_sec)
        max_initial_chunks = int(initial_timeout / chunk_sec)

        logger.debug("Ouvindo microfone (aguardando fala)...")

        try:
            with sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=CHANNELS,
                dtype="float32",
                blocksize=chunk_samples,
            ) as stream:
                for chunk_idx in range(max_total_chunks):
                    chunk, overflow = stream.read(chunk_samples)
                    if overflow:
                        logger.warning("Estouro de buffer no microfone.")

                    audio_flat = chunk.flatten()
                    rms = float(np.sqrt(np.mean(audio_flat**2)))

                    if rms >= silence_threshold:
                        if not has_spoken:
                            logger.info("Fala detectada! Gravando...")
                            has_spoken = True
                        silent_chunks = 0
                    else:
                        if has_spoken:
                            silent_chunks += 1

                    if has_spoken:
                        recorded_chunks.append(audio_flat)
                        if silent_chunks >= max_silent_chunks:
                            recorded_sec = len(recorded_chunks) * chunk_sec
                            logger.info("Pausa / Fim da fala detectado após %.1fs.", recorded_sec)
                            break
                    else:
                        if chunk_idx >= max_initial_chunks:
                            logger.debug("Nenhuma fala detectada dentro do tempo limite.")
                            return None
        except Exception:
            logger.exception("Erro ao capturar áudio do microfone")
            return None

        if not recorded_chunks:
            return None

        return np.concatenate(recorded_chunks)

    def _transcribe_local(self, audio: np.ndarray) -> str | None:
        model = self._load_model()
        language = config.language.split("-")[0] if config.language else "pt"

        segments, info = model.transcribe(
            audio,
            beam_size=config.whisper_beam_size,
            language=language,
            vad_filter=config.whisper_vad_filter,
        )

        texts = [segment.text.strip() for segment in segments if segment.text.strip()]
        full_text = " ".join(texts).strip()

        if full_text:
            logger.debug(
                "Transcrição local (idioma: %s, prob: %.2f): %s",
                info.language,
                info.language_probability,
                full_text,
            )
        return full_text or None

    def _transcribe_groq(self, audio: np.ndarray) -> str | None:
        if not config.groq_api_key:
            logger.error("Chave GROQ_API_KEY não configurada no .env!")
            return None

        import io
        import httpx
        import soundfile as sf

        # Converte numpy array para formato WAV em memória
        wav_io = io.BytesIO()
        sf.write(wav_io, audio, SAMPLE_RATE, format="WAV", subtype="PCM_16")
        wav_io.seek(0)

        language = config.language.split("-")[0] if config.language else "pt"
        url = "https://api.groq.com/openai/v1/audio/transcriptions"
        headers = {"Authorization": f"Bearer {config.groq_api_key}"}
        
        files = {"file": ("audio.wav", wav_io, "audio/wav")}
        data = {
            "model": "whisper-large-v3",
            "language": language,
            "response_format": "json",
            "temperature": "0.0",
            "prompt": "Voz do usuário, transcrição limpa. Sem legendas, sem agradecimentos, sem notas musicais."
        }

        try:
            logger.debug("Enviando áudio para nuvem Groq (whisper-large-v3)...")
            response = httpx.post(url, headers=headers, files=files, data=data, timeout=30.0)
            response.raise_for_status()
            
            result = response.json()
            text = result.get("text", "").strip()
            
            import re
            # Remove notas musicais e legendas em colchetes comuns em silêncio
            text = re.sub(r'\[.*?\]', '', text)
            text = re.sub(r'\(.*?\)', '', text)
            text = text.replace('♪', '').replace('♫', '').strip()
            
            # Filtro contra alucinações curtas e comuns
            lower_text = text.lower()
            bad_words = ["obrigado", "obrigada", "inscreva", "assistir", "canal", "amém", "tchau", "legendado", "áudio:"]
            
            word_count = len(lower_text.split())
            if word_count <= 4 and any(bw in lower_text for bw in bad_words):
                logger.debug("Transcrição ignorada (alucinação detectada): %s", text)
                return None
                
            if not any(c.isalpha() for c in text):
                return None
            
            logger.debug("Transcrição Groq concluída: %s", text)
            return text
        except Exception:
            logger.exception("Erro na transcrição via Groq")
            return None
