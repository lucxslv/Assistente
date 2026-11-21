"""Regressões da serialização de tool calls entre iterações do runtime."""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from core.execution.contracts import ToolResult
from core.memory import ConversationMemory
from core.pipeline import AssistantPipeline
from providers.base import ToolCall as ProviderToolCall
from providers.gemini import GeminiProvider
from providers.openai import OpenAIProvider


TOOL_HISTORY = [
    {
        "role": "assistant",
        "content": "",
        "tool_calls": [{
            "id": "call-1",
            "function": {"name": "execute_command", "arguments": {"command": "Get-ChildItem"}},
            "thought_signature": "c2ln",
        }],
    },
    {
        "role": "tool",
        "name": "execute_command",
        "tool_call_id": "call-1",
        "content": "STDOUT:\narquivo.txt",
    },
]


def test_gemini_history_preserves_native_function_call_and_response():
    normalized = GeminiProvider._normalize_messages(TOOL_HISTORY)

    assert "Ação do assistente" not in str(normalized)
    model_part = normalized[0]["parts"][0]
    tool_part = normalized[1]["parts"][0]
    assert model_part["function_call"] == {
        "name": "execute_command",
        "args": {"command": "Get-ChildItem"},
        "thought_signature": "c2ln",
    }
    assert tool_part["function_response"]["name"] == "execute_command"
    assert "arquivo.txt" in str(tool_part["function_response"]["response"])

    from google.genai import types
    contents = GeminiProvider._convert_to_genai_contents(normalized, types)
    assert contents[0].parts[0].function_call.name == "execute_command"
    assert contents[0].parts[0].thought_signature == b"sig"
    assert contents[1].parts[0].function_response.name == "execute_command"


def test_openai_history_preserves_native_tool_call_contract():
    normalized = OpenAIProvider._normalize_messages(TOOL_HISTORY)

    assistant = normalized[0]
    assert assistant["role"] == "assistant"
    assert assistant["tool_calls"][0]["id"] == "call-1"
    assert assistant["tool_calls"][0]["type"] == "function"
    assert json.loads(assistant["tool_calls"][0]["function"]["arguments"]) == {
        "command": "Get-ChildItem"
    }
    assert normalized[1] == {
        "role": "tool",
        "tool_call_id": "call-1",
        "content": "STDOUT:\narquivo.txt",
    }


def test_gemini_drops_orphan_response_left_by_history_truncation():
    history = [TOOL_HISTORY[1], *TOOL_HISTORY]
    normalized = GeminiProvider._normalize_messages(history)

    assert len(normalized) == 3
    assert normalized[0]["role"] == "user"
    assert "truncado" in normalized[0]["parts"][0].lower()
    assert normalized[1]["role"] == "model"
    assert normalized[1]["parts"][0]["function_call"]["name"] == "execute_command"
    assert normalized[2]["role"] == "user"
    assert len(normalized[2]["parts"]) == 1


def test_gemini_groups_multiple_function_responses_in_one_turn():
    assistant = {
        "role": "assistant",
        "content": "",
        "tool_calls": [
            {"id": "call-1", "function": {"name": "execute_command", "arguments": {"command": "dir"}}},
            {"id": "call-2", "function": {"name": "list_directory", "arguments": {"path": "."}}},
        ],
    }
    responses = [
        {"role": "tool", "name": "execute_command", "tool_call_id": "call-1", "content": "dir ok"},
        {"role": "tool", "name": "list_directory", "tool_call_id": "call-2", "content": "list ok"},
    ]
    normalized = GeminiProvider._normalize_messages([assistant, *responses])

    assert len(normalized) == 2
    assert len(normalized[0]["parts"]) == 2
    assert len(normalized[1]["parts"]) == 2
    assert [p["function_response"]["name"] for p in normalized[1]["parts"]] == [
        "execute_command", "list_directory"
    ]


def test_memory_truncation_never_leaves_leading_tool_result():
    memory = ConversationMemory(max_messages=2)
    memory.add_assistant_tool_calls([
        ProviderToolCall(id="call-1", name="execute_command", arguments={"command": "dir"})
    ])
    memory.add_tool_result("execute_command", "dir ok", tool_call_id="call-1")
    memory.add_assistant("erro transitório")

    messages = memory.get_messages()
    assert all(message.get("role") != "tool" for message in messages[:-1])
    assert messages[0]["role"] != "tool"


def test_unavailable_gemini_3_8_lite_is_not_a_fallback():
    from brain.router.router import LLMRouter

    assert "gemini-3.8-flash-lite" not in GeminiProvider._resolve_models_to_try("gemini-3.5-flash")
    decision = LLMRouter().route("modo agente: execute uma tarefa completa")
    assert all(model != "gemini-3.8-flash-lite" for _, model in LLMRouter().get_fallback_chain(decision))


class _Chunk:
    def __init__(self, text=None, tool_calls=None):
        self.text = text
        self.tool_calls = tool_calls or []


class _Stream:
    def __init__(self, chunks):
        self.chunks = iter(chunks)

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return next(self.chunks)
        except StopIteration:
            raise StopAsyncIteration


@pytest.mark.asyncio
async def test_pipeline_continues_to_second_tool_with_normalized_history(monkeypatch):
    """O modelo deve enxergar a primeira chamada e executar a próxima etapa."""
    monkeypatch.setenv("CHARLIE_RUNTIME_MODE", "device")
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr("api.db.get_or_init_db_pool", AsyncMock(return_value=None))

    transport = MagicMock()
    transport.execute = AsyncMock(side_effect=lambda call, user_id, timeout=15.0: ToolResult(
        call_id=call.call_id,
        status="success",
        output=f"resultado:{call.name}",
        host_id="host-test",
    ))
    monkeypatch.setattr("core.execution.transport.get_transport", lambda: transport)

    provider = MagicMock()
    calls = {"count": 0}

    def chat_stream(*args, **kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            return _Stream([_Chunk(tool_calls=[
                ProviderToolCall(
                    id="call-1",
                    name="execute_command",
                    arguments={"command": "Get-ChildItem"},
                    thought_signature="c2ln",
                )
            ])])

        normalized = GeminiProvider._normalize_messages(kwargs["messages"])
        has_native_call = any(
            isinstance(part, dict)
            and "function_call" in part
            and part["function_call"].get("thought_signature") == "c2ln"
            for message in normalized for part in message.get("parts", [])
        )
        if calls["count"] == 2 and has_native_call:
            return _Stream([_Chunk(tool_calls=[
                ProviderToolCall(id="call-2", name="list_directory", arguments={"path": "Documentos"})
            ])])
        if calls["count"] == 2:
            return _Stream([_Chunk(text="[Ação do assistente: consulta realizada aos sistemas via execute_command]")])
        return _Stream([_Chunk(text="Duas etapas executadas e verificadas.")])

    provider.chat_stream = chat_stream
    pipeline = AssistantPipeline()
    pipeline.llm = provider
    pipeline.retriever.get_summary_context = lambda **kwargs: ""
    pipeline.context_manager.refresh_weather_if_needed = AsyncMock(return_value=None)

    async def collect_events():
        return [
            event
            async for event in pipeline.run_pipeline_stream(
                "modo agente: inspecione o projeto e continue por múltiplas etapas",
                thread_id="thread-native-history",
                user_id="user-real-123",
            )
        ]

    events = await asyncio.wait_for(collect_events(), timeout=5.0)
    tool_names = [event.data.get("name") for event in events if event.type == "tool_end"]
    done = next(event for event in events if event.type == "done")
    assert tool_names == ["execute_command", "list_directory"]
    assert transport.execute.await_count == 2
    assert done.data["reply"] == "Duas etapas executadas e verificadas."
