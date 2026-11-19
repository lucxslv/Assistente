"""Regressões das rotas agênticas e da dimensão dos embeddings de memória."""

from types import SimpleNamespace

import pytest

from brain.router.router import LLMRouter, RouteMode
from memory import embeddings


@pytest.mark.parametrize(
    ("provider", "expected_model"),
    [
        ("gemini", "gemini-3.5-flash"),
        ("openai", "gpt-4o"),
        ("groq", "llama-3.3-70b-versatile"),
    ],
)
def test_agentic_route_selects_a_defined_model_for_every_provider(provider, expected_model):
    """Toda rota AGENTIC deve ter um modelo válido, sem AttributeError no streaming."""
    decision = LLMRouter().route("modo agente: crie um projeto", preferred_provider=provider)

    assert decision.mode == RouteMode.AGENTIC
    assert decision.model_name == expected_model


class _FakeEmbeddingClient:
    def __init__(self, dimensions: int):
        self.dimensions = dimensions
        self.calls = []
        self.models = SimpleNamespace(embed_content=self._embed_content)

    def _embed_content(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            embeddings=[SimpleNamespace(values=[0.01] * self.dimensions)]
        )


def test_embedding_requests_the_pgvector_dimension(monkeypatch):
    """O modelo atual deve ser reduzido explicitamente para o vector(768) do banco."""
    client = _FakeEmbeddingClient(dimensions=768)
    monkeypatch.setattr(embeddings, "_get_client", lambda: client)

    result = embeddings.generate_embedding("O usuário prefere respostas diretas")

    assert result == [0.01] * 768
    assert len(client.calls) == 1
    call = client.calls[0]
    assert call["model"] == "gemini-embedding-001"
    assert call["config"].output_dimensionality == 768


def test_embedding_rejects_a_vector_incompatible_with_pgvector(monkeypatch):
    """Um retorno de 3072 dimensões não pode chegar ao INSERT ou à busca vetorial."""
    client = _FakeEmbeddingClient(dimensions=3072)
    monkeypatch.setattr(embeddings, "_get_client", lambda: client)

    result = embeddings.generate_embedding("Fato duradouro do usuário")

    assert result is None
