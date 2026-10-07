"""Detecção da palavra de ativação usando OpenWakeWord (Offline & Open-Source) com feedback acústico."""

import asyncio
import logging
from typing import Optional

import numpy as np
import sounddevice as sd

from config import config

logger = logging.getLogger(__name__)


class WakeWordDetector:
    """Aguarda a palavra de ativação antes de escutar comandos usando OpenWakeWord."""

    def __init__(self) -> None:
        self._enabled = config.wake_word_enabled
        self._model = None
        self._chunk_size = 1280
        self._sample_rate = 16000
        self._stop_requested = False

    def _generate_chime_audio(self, sample_rate: int = 16000, duration: float = 0.22) -> np.ndarray:
        """Gera uma onda senoidal ascendente suave (chime de ativação) com envelope anti-clique."""
        t_half = duration / 2.0
        n_half = int(sample_rate * t_half)
        
        t1 = np.linspace(0, t_half, n_half, endpoint=False)
        t2 = np.linspace(0, t_half, n_half, endpoint=False)
        
        # Dois tons agradáveis e harmônicos (E5 ~ 659Hz e A5 ~ 880Hz)
        tone1 = np.sin(2 * np.pi * 659.25 * t1) * np.linspace(0.1, 0.4, n_half)
        tone2 = np.sin(2 * np.pi * 880.00 * t2) * np.linspace(0.4, 0.0, n_half)
        
        chime = np.concatenate([tone1, tone2]).astype(np.float32)
        # Normalização de pico para volume seguro
        max_val = np.max(np.abs(chime))
        if max_val > 0:
            chime = (chime / max_val) * 0.35
        return chime

    def play_activation_chime(self) -> None:
        """Reproduz o sinal acústico (chime) indicando que o assistente acordou e está ouvindo."""
        try:
            audio = self._generate_chime_audio(self._sample_rate)
            sd.play(audio, self._sample_rate)
            sd.wait()
        except Exception as e:
            logger.debug("Não foi possível tocar o chime sonoro: %s", e)

    def _init_model(self):
        if self._model is None and self._enabled:
            import openwakeword
            from openwakeword.model import Model

            # openwakeword usa underline para nomes compostos
            base_name = config.wake_word.strip().lower().replace(" ", "_")
            if not base_name or base_name in ("charlie", "assistente"):
                base_name = "hey_jarvis"

            paths = openwakeword.get_pretrained_model_paths()
            model_path = next((p for p in paths if base_name in p), None)

            if not model_path:
                import os
                custom_model = os.path.join(
                    os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                    f"{base_name}.onnx",
                )
                if os.path.exists(custom_model):
                    model_path = custom_model
                else:
                    logger.info("Modelo '%s' não encontrado. Usando 'hey_jarvis' pré-treinado nativo.", base_name)
                    model_path = next(p for p in paths if "hey_jarvis" in p)

            logger.info("Carregando modelo Wake Word: %s", model_path)
            self._model = Model(wakeword_model_paths=[model_path])

    def _listen_sync(self) -> bool:
        self._init_model()
        if not self._model:
            return False

        logger.info("Aguardando wake word ('%s')...", config.wake_word)
        self._stop_requested = False

        try:
            import msvcrt

            with sd.InputStream(
                samplerate=self._sample_rate,
                channels=1,
                dtype="int16",
                blocksize=self._chunk_size,
            ) as stream:
                while not self._stop_requested:
                    # Verifica se o usuário pressionou Enter no terminal (Interrupção para Texto)
                    try:
                        if msvcrt.kbhit():
                            key = msvcrt.getch()
                            if key in (b"\r", b"\n"):
                                return True
                    except Exception:
                        pass

                    audio_chunk, overflow = stream.read(self._chunk_size)
                    if overflow:
                        logger.warning("Estouro de buffer no microfone de wake word.")

                    # Alimenta a rede neural do openwakeword
                    prediction = self._model.predict(audio_chunk.flatten())

                    # Verifica pontuação de confiança de ativação
                    for mdl, score in prediction.items():
                        if score > 0.5:
                            logger.info("Wake word '%s' detectado! (Confiança: %.2f)", mdl, score)
                            self._model.reset()
                            # Toca o sinal sonoro de ativação
                            self.play_activation_chime()
                            return False
        except Exception as e:
            logger.exception("Erro no loop do wake word: %s", e)
            return False

        return False

    async def wait_for_wake_word(self) -> bool:
        """Trava a execução até a palavra mágica ser dita ou o usuário teclar Enter.
        Retorna:
            True: se o usuário interrompeu via teclado (texto)
            False: se ativado por voz (wake word)
        """
        if not self._enabled:
            return False

        return await asyncio.to_thread(self._listen_sync)

    def stop(self) -> None:
        """Sinaliza para encerrar o loop de escuta."""
        self._stop_requested = True

    async def close(self) -> None:
        """Libera o modelo da memória e interrompe a escuta."""
        self._stop_requested = True
        self._model = None
