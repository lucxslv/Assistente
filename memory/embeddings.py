"""Serviço de geração de embeddings vetoriais para o Charlie Cloud Brain."""

import logging
from typing import List, Optional
from config import config

logger = logging.getLogger("charlie.memory.embeddings")

_client = None

def _get_client():
    global _client
    if _client is None and config.gemini_api_key:
        try:
            from google import genai
            _client = genai.Client(api_key=config.gemini_api_key)
        except Exception as e:
            logger.warning("Falha ao inicializar google.genai Client: %s", e)
    return _client


def generate_embedding(text: str, model: str = "gemini-embedding-001") -> Optional[List[float]]:
    """Gera um embedding vetorial normalizado usando o moderno SDK google-genai."""
    if not text or not text.strip():
        return None

    client = _get_client()
    if client:
        try:
            target_model = model.replace("models/", "")
            res = client.models.embed_content(
                model=target_model,
                contents=text.strip(),
            )
            if res and res.embeddings:
                emb = res.embeddings[0]
                if hasattr(emb, "values") and emb.values:
                    return list(emb.values)
                if isinstance(emb, list):
                    return emb
        except Exception as e:
            logger.error(f"Erro ao gerar embedding com google-genai para '{text[:30]}...': {e}")

    # Fallback legado para google.generativeai caso necessário
    try:
        import google.generativeai as genai
        if config.gemini_api_key:
            genai.configure(api_key=config.gemini_api_key)
        target_model = model if model.startswith("models/") else f"models/{model}"
        res = genai.embed_content(
            model=target_model,
            content=text.strip(),
            output_dimensionality=768,
        )
        return res.get("embedding")
    except Exception as e:
        logger.error(f"Erro no fallback de embedding para '{text[:30]}...': {e}")
        return None

