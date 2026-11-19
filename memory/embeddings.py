"""Serviço de geração de embeddings vetoriais para o Charlie Cloud Brain."""

import logging
from typing import List, Optional
from config import config

logger = logging.getLogger("charlie.memory.embeddings")

_client = None

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768


def _get_client():
    global _client
    if _client is None and config.gemini_api_key:
        try:
            try:
                from google import genai
            except (ImportError, AttributeError):
                import importlib
                genai = importlib.import_module("google.genai")
            _client = genai.Client(api_key=config.gemini_api_key)
        except Exception as e:
            logger.warning("Falha ao inicializar google.genai Client: %s", e)
    return _client


def generate_embedding(text: str, model: str = EMBEDDING_MODEL) -> Optional[List[float]]:
    """Gera embeddings compatíveis com as colunas e funções ``vector(768)``."""
    if not text or not text.strip():
        return None

    client = _get_client()
    if client:
        try:
            from google.genai import types

            target_model = model.replace("models/", "")
            res = client.models.embed_content(
                model=target_model,
                contents=text.strip(),
                config=types.EmbedContentConfig(
                    output_dimensionality=EMBEDDING_DIMENSIONS
                ),
            )
            if res and res.embeddings:
                emb = res.embeddings[0]
                values = None
                if hasattr(emb, "values") and emb.values:
                    values = list(emb.values)
                elif isinstance(emb, list):
                    values = emb

                if values is not None:
                    if len(values) != EMBEDDING_DIMENSIONS:
                        logger.error(
                            "Embedding rejeitado: modelo '%s' retornou %d dimensões; "
                            "o schema pgvector exige %d.",
                            target_model,
                            len(values),
                            EMBEDDING_DIMENSIONS,
                        )
                        return None
                    return values
        except Exception as e:
            logger.error(f"Erro ao gerar embedding com google-genai para '{text[:30]}...': {e}")

    return None

