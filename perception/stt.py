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

        return await asyncio.to_thread(self._transcribe_audio, audio)

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

    def _transcribe_audio(self, audio: np.ndarray) -> str | None:
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
                "Transcrição concluída (idioma detectado: %s, prob: %.2f): %s",
                info.language,
                info.language_probability,
                full_text,
            )
        return full_text or None
