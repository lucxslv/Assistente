"""Detecção da palavra de ativação usando OpenWakeWord (Offline & Open-Source)."""

import asyncio
import logging

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

    def _init_model(self):
        if self._model is None and self._enabled:
            import openwakeword
            from openwakeword.model import Model
            
            # openwakeword usa underline para nomes compostos
            base_name = config.wake_word.strip().lower().replace(" ", "_")
            
            # Busca o caminho correto do modelo pré-treinado interno
            paths = openwakeword.get_pretrained_model_paths()
            model_path = next((p for p in paths if base_name in p), None)
            
            # Se não achou na biblioteca interna, tenta procurar na raiz do projeto (Ex: "charlie.onnx")
            if not model_path:
                import os
                custom_model = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), f"{base_name}.onnx")
                if os.path.exists(custom_model):
                    model_path = custom_model
                else:
                    logger.error("Modelo de Wake Word '%s' não encontrado (nem interno, nem customizado). Usando 'hey_jarvis' fallback.", base_name)
                    model_path = next(p for p in paths if "hey_jarvis" in p)

            logger.info("Carregando modelo Wake Word: %s", model_path)
            
            self._model = Model(wakeword_model_paths=[model_path])

    def _listen_sync(self):
        self._init_model()
        if not self._model:
            return

        logger.info("Aguardando wake word ('%s')...", config.wake_word)
        
        try:
            with sd.InputStream(
                samplerate=self._sample_rate,
                channels=1,
                dtype="int16",
                blocksize=self._chunk_size
            ) as stream:
                while True:
                    audio_chunk, overflow = stream.read(self._chunk_size)
                    if overflow:
                        logger.warning("Estouro de buffer no wake word.")
                    
                    # Alimenta a rede neural do openwakeword
                    prediction = self._model.predict(audio_chunk.flatten())
                    
                    # Verifica a pontuação de confiança de todos os modelos ativos
                    for mdl, score in prediction.items():
                        # Um score maior que 0.5 (50%) é geralmente um gatilho confiável
                        if score > 0.5:
                            logger.info("Wake word '%s' detectado! (Confiança: %.2f)", mdl, score)
                            # Reseta o estado interno do modelo para não acionar duas vezes seguidas com o mesmo áudio passado
                            self._model.reset()
                            return
        except Exception as e:
            logger.exception("Erro no loop do wake word: %s", e)

    async def wait_for_wake_word(self) -> None:
        """Trava a execução até a palavra mágica ser dita."""
        if not self._enabled:
            return
            
        await asyncio.to_thread(self._listen_sync)

    async def close(self) -> None:
        """Libera o modelo da memória."""
        self._model = None
