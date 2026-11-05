"""Testes para loop fechado no pipeline — ExecutorTransport, step budget, fim do fire-and-forget."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio
from typing import AsyncGenerator

from core.pipeline import AssistantPipeline
from core.execution.contracts import ToolCall, ToolResult, HostInfo
from core.execution.transport import ExecutorTransport
from config import config


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


class TestPipelineClosedLoop:
    """Testes para o loop fechado no pipeline."""
    
    @pytest.mark.asyncio
    async def test_device_tool_result_feeds_model_and_continues(self, monkeypatch):
        """Cloud mode: tool result volta pro modelo e continua o loop."""
        monkeypatch.setenv("VERCEL", "1")
        monkeypatch.delenv("CHARLIE_RUNTIME_MODE", raising=False)
        import importlib
        import config as config_module
        importlib.reload(config_module)
        
        # Fake transport that returns a result
        fake_transport = FakeTransport([
            ToolResult(
                call_id="call-1",
                status="success",
                output="PASTA_OK",
                host_id="host1"
            )
        ])
        
        # Patch the transport factory
        import core.execution.transport as transport_module
        original_get_transport = transport_module.get_transport
        transport_module.get_transport = lambda: fake_transport
        
        # Mock the LLM provider with chat_stream
        fake_provider = MagicMock()
        tool_call_chunk = MockChunk(tool_calls=[{
            "id": "call-1", 
            "name": "list_directory", 
            "arguments": {"path": "test"}
        }])
        final_chunk = MockChunk(text="Final response with PASTA_OK")
        fake_provider.chat_stream = MagicMock(return_value=MockChatStream([
            tool_call_chunk,
            final_chunk
        ]))
        
        # Create pipeline with fake provider
        pipeline = AssistantPipeline()
        pipeline.llm = fake_provider
        
        # Patch the transport factory
        transport_module.get_transport = lambda: fake_transport
        
        events = []
        async for event in pipeline.run_pipeline_stream("list files", thread_id="test-thread", user_id="user1"):
            events.append(event)
        
        # Verify: tool_start + tool_end emitted, no client_tool_request
        event_types = [e.type for e in events]
        assert "tool_start" in event_types
        assert "tool_end" in event_types
        assert "client_tool_request" not in event_types
        
        # Verify model was called twice (first with tool_call, second with tool_result)
        assert fake_provider.chat_stream.call_count == 2
        
        # Restore
        import core.execution.transport as transport_module
        transport_module.get_transport = original_get_transport

    @pytest.mark.asyncio
    async def test_host_offline_result_flows_to_model(self, monkeypatch):
        """Cloud mode + host offline: unavailable/host_offline flui pro modelo."""
        monkeypatch.setenv("VERCEL", "1")
        monkeypatch.delenv("CHARLIE_RUNTIME_MODE", raising=False)
        import importlib
        import config as config_module
        importlib.reload(config_module)
        
        fake_transport = FakeTransport([
            ToolResult(
                call_id="call-1",
                status="unavailable",
                output="Sem executor disponível: nenhum host do usuário está conectado para executar 'list_directory'.",
                error_type="host_offline",
                is_recoverable=False,
                host_id=None
            )
        ])
        
        import core.execution.transport as transport_module
        original_get_transport = transport_module.get_transport
        transport_module.get_transport = lambda: fake_transport
        
        pipeline = AssistantPipeline()
        fake_provider = MagicMock()
        tool_call_chunk = MockChunk(tool_calls=[{
            "id": "call-1", 
            "name": "list_directory", 
            "arguments": {}
        }])
        final_chunk = MockChunk(text="Host está offline, não posso listar arquivos.")
        fake_provider.chat_stream = MagicMock(return_value=MockChatStream([
            tool_call_chunk,
            final_chunk
        ]))
        pipeline.llm = fake_provider
        
        transport_module.get_transport = lambda: fake_transport
        
        events = []
        async for event in pipeline.run_pipeline_stream("list files", thread_id="test-thread", user_id="user1"):
            events.append(event)
        
        # Verify: tool_end with unavailable status, no exception
        event_types = [e.type for e in events]
        assert "tool_start" in event_types
        assert "tool_end" in event_types
        assert "client_tool_request" not in event_types
        
        # Verify model received the unavailable result
        assert fake_provider.chat_stream.call_count == 2
        
        transport_module.get_transport = original_get_transport

    @pytest.mark.asyncio
    async def test_step_budget_stops_loop(self, monkeypatch):
        """Step budget para o loop após N tools."""
        monkeypatch.setenv("VERCEL", "1")
        monkeypatch.delenv("CHARLIE_RUNTIME_MODE", raising=False)
        import importlib
        import config as config_module
        importlib.reload(config_module)
        
        # Override max steps
        import config
        original_max = config.config.max_agent_steps_per_turn
        config.config.max_agent_steps_per_turn = 3
        
        fake_transport = FakeTransport([
            ToolResult(call_id=f"call-{i}", status="success", output=f"result-{i}", host_id="host1")
            for i in range(5)
        ])
        
        import core.execution.transport as transport_module
        original_get_transport = transport_module.get_transport
        transport_module.get_transport = lambda: fake_transport
        
        # Provider always returns tool_calls
        pipeline = AssistantPipeline()
        fake_provider = MagicMock()
        
        def make_chunks():
            return [MockChunk(tool_calls=[{
                "id": f"call-{i}", 
                "name": "list_directory", 
                "arguments": {}
            }]) for i in range(10)]
        
        fake_provider.chat_stream = MagicMock(side_effect=lambda *args, **kwargs: MockChatStream([
            MockChunk(tool_calls=[{
                "id": f"call-{i}", 
                "name": "list_directory", 
                "arguments": {}
            }]) for i in range(10)
        ]))
        pipeline.llm = fake_provider
        
        import core.execution.transport as transport_module
        transport_module.get_transport = lambda: fake_transport
        
        events = []
        async for event in pipeline.run_pipeline_stream("list files", thread_id="test-thread", user_id="user1"):
            events.append(event)
        
        # Should only execute 3 tools (budget)
        tool_end_count = sum(1 for e in events if e.type == "tool_end")
        assert tool_end_count <= 3
        
        # Final reply should mention limit
        final_events = [e for e in events if e.type == "done"]
        assert len(final_events) > 0
        final_reply = final_events[-1].data.get("reply", "")
        assert "Limite de passos" in final_reply or "limite" in final_reply.lower()
        
        config.config.max_agent_steps_per_turn = original_max
        transport_module.get_transport = original_get_transport

    @pytest.mark.asyncio
    async def test_device_mode_executes_in_process(self, monkeypatch):
        """Device mode: tool CLOUD roda via LocalExecutor->registry."""
        monkeypatch.setenv("CHARLIE_RUNTIME_MODE", "device")
        monkeypatch.delenv("VERCEL", raising=False)
        import importlib
        import config as config_module
        importlib.reload(config_module)
        
        fake_transport = FakeTransport([
            ToolResult(call_id="call-1", status="success", output="cloud_result", host_id="local")
        ])
        
        import core.execution.transport as transport_module
        original_get_transport = transport_module.get_transport
        transport_module.get_transport = lambda: fake_transport
        
        # Mock the LLM provider
        fake_provider = MagicMock()
        tool_call_chunk = MockChunk(tool_calls=[{
            "id": "call-1", 
            "name": "search_web", 
            "arguments": {"query": "test"}
        }])
        final_chunk = MockChunk(text="Found results")
        fake_provider.chat_stream = MagicMock(return_value=MockChatStream([
            tool_call_chunk,
            final_chunk
        ]))
        pipeline.llm = fake_provider
        
        transport_module.get_transport = lambda: fake_transport
        
        events = []
        async for event in pipeline.run_pipeline_stream("search web", thread_id="test-thread", user_id="user1"):
            events.append(event)
        
        # Should execute without client_tool_request
        event_types = [e.type for e in events]
        assert "tool_start" in event_types
        assert "tool_end" in event_types
        assert "client_tool_request" not in event_types
        
        transport_module.get_transport = original_get_transport
