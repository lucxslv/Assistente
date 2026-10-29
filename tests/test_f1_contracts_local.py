"""Testes para contratos de execução e LocalExecutor."""

import pytest
from unittest.mock import MagicMock, AsyncMock

from core.execution.contracts import ToolCall, ToolResult, HostInfo, ToolCallStatus
from core.execution.local import LocalExecutor
from core.execution.transport import get_transport
from config import config


class TestContracts:
    """Testes para os modelos de contrato."""

    def test_tool_call_creation(self):
        call = ToolCall(call_id="test-1", name="list_directory", arguments={"path": "test"})
        assert call.call_id == "test-1"
        assert call.name == "list_directory"
        assert call.arguments == {"path": "test"}

    def test_tool_result_creation(self):
        result = ToolResult(
            call_id="test-1",
            status="success",
            output="OK",
            friendly_name="Listando diretório",
            duration_ms=100,
            error_type=None,
            is_recoverable=False,
            host_id="local"
        )
        assert result.call_id == "test-1"
        assert result.status == "success"
        assert result.output == "OK"
        assert result.host_id == "local"

    def test_host_info_creation(self):
        host = HostInfo(
            host_id="local",
            name="Local Host",
            capabilities=["list_directory", "read_file"],
            last_seen_at=1234567890.0,
            online=True
        )
        assert host.host_id == "local"
        assert host.online is True

    def test_tool_call_status_enum(self):
        assert ToolCallStatus.QUEUED == "queued"
        assert ToolCallStatus.DELIVERED == "delivered"
        assert ToolCallStatus.RUNNING == "running"
        assert ToolCallStatus.DONE == "done"
        assert ToolCallStatus.FAILED == "failed"
        assert ToolCallStatus.TIMEOUT == "timeout"
        assert ToolCallStatus.UNAVAILABLE == "unavailable"


class TestLocalExecutor:
    """Testes para LocalExecutor."""

    @pytest.mark.asyncio
    async def test_local_executor_wraps_registry(self):
        """LocalExecutor executa tool via registry e retorna ToolResult."""
        mock_registry = MagicMock()
        mock_registry.execute_structured = AsyncMock(return_value={
            "status": "success",
            "output": "pasta1\npasta2",
            "friendly_name": "Listando diretório",
            "duration_ms": 50,
            "error_type": None,
            "is_recoverable": False,
        })
        mock_registry.list_tools.return_value = ["list_directory", "read_file"]
        
        executor = LocalExecutor(mock_registry)
        call = ToolCall(call_id="test-1", name="list_directory", arguments={"path": "test"})
        
        result = await executor.execute(call, user_id="user1")
        
        assert result.status == "success"
        assert result.output == "pasta1\npasta2"
        assert result.call_id == "test-1"
        assert result.host_id == "local"
        mock_registry.execute_structured.assert_called_once_with(
            "list_directory", {"path": "test"}, prefer_remote=False, call_id="test-1", user_id="user1", timeout=15.0
        )

    @pytest.mark.asyncio
    async def test_local_executor_unknown_tool(self):
        """Tool desconhecida retorna unavailable/not_found."""
        mock_registry = MagicMock()
        mock_registry.execute_structured = AsyncMock(return_value={
            "status": "error",
            "output": "Ferramenta 'unknown' não encontrada.",
            "friendly_name": "Executando unknown",
            "duration_ms": 0,
            "error_type": "not_found",
            "is_recoverable": False,
        })
        mock_registry.list_tools.return_value = ["list_directory"]
        
        executor = LocalExecutor(mock_registry)
        call = ToolCall(call_id="test-2", name="unknown", arguments={})
        
        result = await executor.execute(call, user_id="user1")
        
        assert result.status == "unavailable"
        assert result.error_type == "not_found"
        assert "não encontrada" in result.output

    @pytest.mark.asyncio
    async def test_hosts_for_local(self):
        """hosts_for retorna HostInfo do host local com capabilities do registry."""
        mock_registry = MagicMock()
        mock_registry.list_tools.return_value = ["list_directory", "read_file", "write_file"]
        
        executor = LocalExecutor(mock_registry)
        hosts = await executor.hosts_for("user1")
        
        assert len(hosts) == 1
        host = hosts[0]
        assert host.host_id == "local"
        assert host.name == "Local Host"
        assert host.online is True
        assert host.capabilities == ["list_directory", "read_file", "write_file"]
        assert host.last_seen_at > 0


class TestTransportFactory:
    """Testes para a fábrica get_transport."""

    def test_get_transport_device_mode(self, monkeypatch):
        """Modo device retorna LocalExecutor."""
        monkeypatch.setenv("CHARLIE_RUNTIME_MODE", "device")
        monkeypatch.delenv("VERCEL", raising=False)
        import importlib
        import config as config_module
        importlib.reload(config_module)
        import core.execution.transport as transport_module
        importlib.reload(transport_module)
        
        transport = transport_module.get_transport()
        assert isinstance(transport, transport_module.LocalExecutor)

    @pytest.mark.asyncio
    async def test_get_transport_cloud_mode(self, monkeypatch):
        """CHARLIE_RUNTIME_MODE=cloud → RemoteHostExecutor."""
        monkeypatch.setenv("VERCEL", "1")
        monkeypatch.delenv("CHARLIE_RUNTIME_MODE", raising=False)
        import importlib
        import config as config_module
        importlib.reload(config_module)
        import core.execution.transport as transport_module
        importlib.reload(transport_module)
        
        transport = transport_module.get_transport()
        assert type(transport).__name__ == "RemoteHostExecutor"