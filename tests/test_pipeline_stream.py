"""Teste para o fluxo run_pipeline_stream do AssistantPipeline garantindo integridade de imports."""

import asyncio
import pytest
from unittest.mock import MagicMock
from core.pipeline import AssistantPipeline
from providers.base import StreamChunk


def test_pipeline_stream_builds_prompt_without_name_error():
    """Garante que run_pipeline_stream constrói o prompt e executa sem NameError para build_system_prompt."""
    pipeline = AssistantPipeline()

    # Mock do provedor LLM para simular resposta em stream sem chamar APIs remotas
    mock_llm = MagicMock()

    async def mock_chat_stream(*args, **kwargs):
        yield StreamChunk(text="Olá! Como posso ajudar?", is_done=True)

    mock_llm.chat_stream = mock_chat_stream
    pipeline.llm = mock_llm

    events = []

    async def run():
        async for ev in pipeline.run_pipeline_stream(
            user_text="Olá Charlie",
            thread_id="test_thread_123",
            user_id="user_test_456",
        ):
            events.append(ev)

    asyncio.run(run())
    assert len(events) > 0
    event_types = [e.type for e in events]
    assert "status" in event_types or "token" in event_types or "done" in event_types
