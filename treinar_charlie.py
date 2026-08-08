"""
Script de Treinamento Automático do Wake Word "Charlie" 🎙️🧠

COMO USAR:
1. Abra o terminal e instale as dependências pesadas de IA:
   uv pip install openwakeword[full]
   uv pip install torch torchvision torchaudio

2. Rode este script:
   uv run python treinar_charlie.py

O processo vai baixar vozes artificiais, gerar milhares de áudios sintéticos de pessoas 
dizendo "Charlie" e "Hey Charlie" e treinar um modelo ONNX. Vai demorar um pouco (talvez 30 min).
Quando terminar, ele salvará um arquivo 'charlie.onnx' na pasta atual.
"""

import os
import sys
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def treinar_modelo():
    try:
        # A biblioteca custom_model_compiler requer as instalações completas
        from openwakeword.custom_model_compiler import train_models
    except ImportError:
        logger.error(
            "❌ Bibliotecas de Treinamento não encontradas.\n"
            "Por favor, rode no terminal antes de executar:\n"
            "uv pip install openwakeword[full] torch"
        )
        sys.exit(1)

    logger.info("🚀 Iniciando treinamento do Wake Word: Charlie...")
    logger.info("Isso vai baixar modelos de voz (Piper TTS) e treinar a rede neural. Vai demorar um pouco!")
    
    # Treina o modelo. target_words é a lista de frases.
    train_models(
        ["charlie", "hey charlie"],
        output_dir="./modelos_customizados",
        n_cores=os.cpu_count() or 4
    )
    
    logger.info("✅ Treinamento concluído! Verifique a pasta 'modelos_customizados'.")
    logger.info("Para usar, copie o arquivo .onnx gerado para a raiz do assistente e atualize o WAKE_WORD no .env")

if __name__ == "__main__":
    treinar_modelo()
