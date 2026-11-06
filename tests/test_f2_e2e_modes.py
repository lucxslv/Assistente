"""E2E tests for F0-F2: closed loop in both device and cloud modes."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio
from typing import AsyncGenerator

from core.execution.contracts import ToolCall, ToolResult, HostInfo
from core.execution.transport import ExecutorTransport


class FakeTransport(ExecutorTransport):
    """Fake transport for testing."""
    
    def __init__(self, results=None):
        self.results = results or []
        self.call_count = 0
        self.hosts_list = [HostInfo(
            host_id="local",
            name="Local Host",
            capabilities=["list_directory"],
            last_seen_at=9999999999.0,
            online=True
        )]
    
    async def hosts_for(self, user_id: str):
        return self.hosts_list
    
    async def execute(self, call: ToolCall, user_id: str, timeout: float = 15.0) -> ToolResult:
        if self.call_count < len(self.results):
            result = self.results[self.call_count]
            self.call_count += 1
            return result
        return ToolResult(
            call_id=call.call_id,
            status="success",
            output="default",
            host_id="local"
        )


class MockToolCall:
    """Mock tool call object with attributes."""
    def __init__(self, id, name, arguments):
        self.id = id
        self.name = name
        self.arguments = arguments


class MockChunk:
    """Mock chunk for chat_stream."""
    def __init__(self, tool_calls=None, text=None):
        self.tool_calls = tool_calls
        self.text = text


class MockChatStream:
    """Mock chat_stream that yields chunks."""
    def __init__(self, chunks):
        self.chunks = chunks
        self.index = 0
    
    def __aiter__(self):
        return self
    
    async def __anext__(self):
        if self.index < len(self.chunks):
            chunk = self.chunks[self.index]
            self.index += 1
            return chunk
        raise StopAsyncIteration


@pytest.mark.asyncio
async def test_e2e_device_mode_turn_with_tool(monkeypatch):
    """Device mode: full turn with CLOUD tool via LocalExecutor, emits tool_start/tool_end/done."""
    monkeypatch.setenv("CHARLIE_RUNTIME_MODE", "device")
    monkeypatch.delenv("VERCEL", raising=False)
    import importlib
    import config as config_module
    importlib.reload(config_module)
    import core.pipeline as pipeline_module
    importlib.reload(pipeline_module)
    from core.pipeline import AssistantPipeline
    
    # Fake transport for CLOUD tool (LocalExecutor)
    fake_transport = FakeTransport([
        ToolResult(
            call_id="call-1",
            status="success",
            output="14:30:00",
            friendly_name="Consultando data e hora",
            duration_ms=10,
            host_id="local"
        )
    ])
    
    # Patch the transport factory at module level
    import core.execution.transport as transport_module
    original_get_transport = transport_module.get_transport
    transport_module.get_transport = lambda: fake_transport
    
    try:
        # Mock the LLM provider with chat_stream - returns a CLOUD tool call (get_datetime) first, then final text
        fake_provider = MagicMock()
        call_count = {"count": 0}
        
        def make_chat_stream(*args, **kwargs):
            call_count["count"] += 1
            if call_count["count"] == 1:
                # First call: returns tool call
                tool_call_chunk = MockChunk(tool_calls=[MockToolCall(
                    "call-1", "get_datetime", {}
                )])
                return MockChatStream([tool_call_chunk])
            else:
                # Second call: returns final text
                final_chunk = MockChunk(text="São 14:30.")
                return MockChatStream([final_chunk])
        
        fake_provider.chat_stream = make_chat_stream
        
        # Create pipeline with fake provider
        pipeline = AssistantPipeline()
        pipeline.llm = fake_provider
        
        events = []
        events = []
        async for event in pipeline.run_pipeline_stream(
            user_text="Que horas são?",
            thread_id="test-thread",
            user_id="user1"
        ):
            events.append(event)
        
        # Verify: tool_start + tool_end emitted, no client_tool_request
        event_types = [e.type for e in events]
        assert "tool_start" in event_types
        assert "tool_end" in event_types
        assert "done" in event_types
        assert "client_tool_request" not in event_types
        
        # Verify tool_end has host_id
        tool_end_events = [e for e in events if e.type == "tool_end"]
        assert len(tool_end_events) == 1
        assert tool_end_events[0].data.get("host_id") == "local"
        
        # Verify final reply
        done_events = [e for e in events if e.type == "done"]
        assert len(done_events) == 1
        assert "14:30" in done_events[0].data.get("reply", "")
    finally:
        transport_module.get_transport = original_get_transport


@pytest.mark.asyncio
async def test_e2e_cloud_mode_device_tool_suspends_turn(monkeypatch):
    """Cloud mode: DEVICE tool suspends turn (turn_suspended), no tool_end until host executes."""
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("CHARLIE_RUNTIME_MODE", raising=False)
    import importlib
    import config as config_module
    importlib.reload(config_module)
    import core.pipeline as pipeline_module
    importlib.reload(pipeline_module)
    from core.pipeline import AssistantPipeline
    
    # Fake transport (not used for DEVICE tools in cloud mode)
    fake_transport = FakeTransport([])
    
    # Patch the transport factory at module level
    import core.execution.transport as transport_module
    original_get_transport = transport_module.get_transport
    transport_module.get_transport = lambda: fake_transport
    
    try:
        # Mock the LLM provider with chat_stream - returns a DEVICE tool call
        fake_provider = MagicMock()
        tool_call_chunk = MockChunk(tool_calls=[MockToolCall(
            "call-1", "list_directory", {"path": "/"}
        )])
        fake_provider.chat_stream = MagicMock(return_value=MockChatStream([tool_call_chunk]))
        
        # Create pipeline with fake provider
        pipeline = AssistantPipeline()
        pipeline.llm = fake_provider
        
        events = []
        async for event in pipeline.run_pipeline_stream(
            user_text="Liste meus arquivos",
            thread_id="test-thread",
            user_id="user1"
        ):
            events.append(event)
        
        # Verify: tool_start + turn_suspended emitted (no tool_end, no client_tool_request)
        event_types = [e.type for e in events]
        assert "tool_start" in event_types
        assert "turn_suspended" in event_types
        assert "tool_end" not in event_types  # DEVICE tool suspends, doesn't execute
        assert "client_tool_request" not in event_types
        
        # Verify turn_suspended has correct data
        suspended_event = next(e for e in events if e.type == "turn_suspended")
        assert suspended_event.data.get("request_id") is not None
        assert suspended_event.data.get("status") == "awaiting_device_execution"
    finally:
        transport_module.get_transport = original_get_transport


@pytest.mark.asyncio
async def test_sse_event_names_unchanged(monkeypatch):
    """SSE events emitted are subset of stable set: status, token, tool_start, tool_end, thought, cancelled, done, error."""
    monkeypatch.setenv("CHARLIE_RUNTIME_MODE", "device")
    monkeypatch.delenv("VERCEL", raising=False)
    import importlib
    import config as config_module
    importlib.reload(config_module)
    import core.pipeline as pipeline_module
    importlib.reload(pipeline_module)
    from core.pipeline import AssistantPipeline
    
    fake_transport = FakeTransport([])
    
    import core.execution.transport as transport_module
    original_get_transport = transport_module.get_transport
    transport_module.get_transport = lambda: fake_transport
    
    try:
        fake_provider = MagicMock()
        fake_provider.chat_stream = MagicMock(return_value=MockChatStream([
            MockChunk(text="Olá!")
        ]))
        
        pipeline = AssistantPipeline()
        pipeline.llm = fake_provider
        
        allowed_events = {"status", "token", "tool_start", "tool_end", "thought", "cancelled", "done", "error"}
        
        events = []
        async for event in pipeline.run_pipeline_stream(
            user_text="Oi",
            thread_id="test-thread",
            user_id="user1"
        ):
            events.append(event)
        
        event_types = {e.type for e in events}
        assert event_types.issubset(allowed_events), f"Unexpected event types: {event_types - allowed_events}"
        
        assert "token" in event_types or "done" in event_types
    finally:
        transport_module.get_transport = original_get_transport
