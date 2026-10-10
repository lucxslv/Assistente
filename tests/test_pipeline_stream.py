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


def test_pipeline_stream_emits_thought_and_clean_tokens():
    """Garante que tags <thought> geradas pelo modelo são emitidas como eventos 'thought' e não vazam no 'token'."""
    pipeline = AssistantPipeline()
    mock_llm = MagicMock()

    async def mock_chat_stream(*args, **kwargs):
        yield StreamChunk(text="<thou", is_done=False)
        yield StreamChunk(text="ght>analisando requisitos do usuário</thought>", is_done=False)
        yield StreamChunk(text="Resposta final sem tags internas.", is_done=True)

    mock_llm.chat_stream = mock_chat_stream
    pipeline.llm = mock_llm

    events = []

    async def run():
        async for ev in pipeline.run_pipeline_stream(
            user_text="Como funciona?",
            thread_id="test_thread_thought",
            user_id="user_test_thought",
        ):
            events.append(ev)

    asyncio.run(run())

    token_events = [e for e in events if e.type == "token"]
    thought_events = [e for e in events if e.type == "thought"]

    # 1. Deve ter emitido o evento de pensamento
    assert len(thought_events) > 0, "Evento 'thought' não foi emitido durante o streaming!"
    all_thoughts = " ".join([e.data.get("thought", "") for e in thought_events])
    assert "analisando requisitos do usuário" in all_thoughts

    # 2. Os tokens emitidos não podem conter <thought>, </thought> nem o texto interno
    all_tokens = "".join([e.data.get("token", "") for e in token_events])
    assert "<thought>" not in all_tokens
    assert "</thought>" not in all_tokens
    assert "analisando requisitos do usuário" not in all_tokens
    assert "Resposta final sem tags internas." in all_tokens


def test_remote_device_broker_multi_tenant_isolation():
    """Valida que o RemoteDeviceBroker isola dispositivos estritamente por user_id."""
    from unittest.mock import AsyncMock
    from brain.broker.device_broker import RemoteDeviceBroker

    broker = RemoteDeviceBroker()
    ws_alice = AsyncMock()
    ws_bob = AsyncMock()

    broker.register_device_connection(ws_alice, user_id="user_alice")
    broker.register_device_connection(ws_bob, user_id="user_bob")

    assert broker.has_active_device(user_id="user_alice") is True
    assert broker.has_active_device(user_id="user_bob") is True
    assert broker.has_active_device(user_id="user_charlie") is False

    async def test_dispatch():
        # Dispatch para Alice
        task = asyncio.create_task(
            broker.dispatch_device_tool(
                call_id="call_alice_1",
                tool_name="get_system_status",
                arguments={},
                user_id="user_alice",
                timeout=1.0,
            )
        )
        await asyncio.sleep(0.01)
        # Verifica que apenas o WS da Alice recebeu o comando
        assert ws_alice.send_json.call_count == 1
        assert ws_bob.send_json.call_count == 0

        # Resolve chamada da Alice
        broker.resolve_tool_result("call_alice_1", "Alice PC OK")
        res = await task
        assert res == "Alice PC OK"

        # Dispatch para usuário desconectado
        res_unknown = await broker.dispatch_device_tool(
            call_id="call_unknown_1",
            tool_name="get_system_status",
            arguments={},
            user_id="user_unknown",
            timeout=1.0,
        )
        assert "Aviso: Nenhum dispositivo" in res_unknown

        # Desconecta Alice
        broker.unregister_device_connection(ws_alice, user_id="user_alice")
        assert broker.has_active_device(user_id="user_alice") is False
        assert broker.has_active_device(user_id="user_bob") is True

    asyncio.run(test_dispatch())
