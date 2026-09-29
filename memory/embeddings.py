"""Serviço de geração de embeddings vetoriais para o Charlie Cloud Brain."""

import logging
from typing import List, Optional
import google.generativeai as genai
from config import config

logger = logging.getLogger("charlie.memory.embeddings")

# Garante configuração do SDK
if config.gemini_api_key:
    genai.configure(api_key=config.gemini_api_key)


def generate_embedding(text: str, model: str = "models/gemini-embedding-001") -> Optional[List[float]]:
    """Gera um embedding vetorial normalizado de 768 dimensões usando Gemini."""
    if not text or not text.strip():
        return None

    try:
        res = genai.embed_content(
            model=model,
            content=text.strip(),
            output_dimensionality=768
        )
        return res.get("embedding")
    except Exception as e:
        logger.error(f"Erro ao gerar embedding para '{text[:30]}...': {e}")
        return None
