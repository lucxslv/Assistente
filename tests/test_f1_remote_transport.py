"""Testes para RemoteHostExecutor via fila Postgres."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import time


class AsyncContextManagerMock:
    def __init__(self, mock_obj):
        self.mock_obj = mock_obj
    
    async def __aenter__(self):
        return self.mock_obj
    
    async def __aexit__(self, *args):
        return None


class TestRemoteHostExecutor:
    """Testes para core/execution/remote.py."""

    @pytest.mark.asyncio
    async def test_execute_no_online_host_returns_unavailable(self):
        """Sem host online → unavailable/host_offline, SEM inserir call."""
        from core.execution.remote import RemoteHostExecutor
        from core.execution.contracts import ToolCall, ToolResult
        
        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))
        mock_conn.fetch = AsyncMock(return_value=[])
        
        async def instant_sleep(duration):
            return None
        
        executor = RemoteHostExecutor(lambda: mock_pool, sleep_func=instant_sleep)
        call = ToolCall(call_id="test-1", name="list_directory", arguments={"path": "test"})
        
        result = await executor.execute(call, user_id="user1", timeout=15.0)
        
        assert result.status == "unavailable"
        assert result.error_type == "host_offline"
        assert result.call_id == "test-1"
        # Nenhuma escrita de call deve ter ocorrido
        assert not mock_conn.execute.called
        assert not mock_conn.fetchrow.called  # INSERT não deve ser chamado

    @pytest.mark.asyncio
    async def test_execute_resolves_host_result(self):
        """Com host online → INSERT queued → poll → retorna resultado do host."""
        from core.execution.remote import RemoteHostExecutor
        from core.execution.contracts import ToolCall, ToolResult
        
        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))
        
        # hosts_for retorna um host online
        mock_conn.fetch = AsyncMock(return_value=[
            {"id": "host1", "user_id": "user1", "name": "Test Host", "capabilities": ["list_directory"], "last_seen_at": time.time(), "online": True}
        ])
        
        # INSERT usa execute (não retorna nada)
        mock_conn.execute = AsyncMock(return_value=None)
        
        # Poll: primeira vez status queued, depois sempre done
        call_count = 0
        def fetchrow_side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {"call_id": "call-123", "status": "queued", "result": None, "tool": "list_directory", "args": {}}
            else:
                # Após a primeira chamada, sempre retorna done
                return {"call_id": "call-123", "status": "done", "result": {"output": "pasta1\npasta2", "duration_ms": 50}, "tool": "list_directory", "args": {}}
        
        mock_conn.fetchrow = AsyncMock(side_effect=fetchrow_side_effect)
        
        async def instant_sleep(duration):
            return None
        
        executor = RemoteHostExecutor(lambda: mock_pool, sleep_func=instant_sleep)
        call = ToolCall(call_id="test-1", name="list_directory", arguments={"path": "test"})
        result = await executor.execute(call, user_id="user1", timeout=15.0)
        
        assert result.status == "success"
        assert result.output == "pasta1\npasta2"
        assert result.call_id == "test-1"
        assert result.host_id == "host1"
        # Verifica que INSERT foi chamado
        assert mock_conn.execute.called
        # Verifica que poll aconteceu (fetchrow chamado múltiplas vezes)
        assert mock_conn.fetchrow.call_count >= 2

    @pytest.mark.asyncio
    async def test_execute_timeout_marks_row(self):
        """Timeout → row atualizada para timeout + ToolResult timeout."""
        from core.execution.remote import RemoteHostExecutor
        from core.execution.contracts import ToolCall, ToolResult
        
        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))
        
        # hosts_for retorna um host online
        mock_conn.fetch = AsyncMock(return_value=[
            {"id": "host1", "user_id": "user1", "name": "Test Host", "capabilities": ["list_directory"], "last_seen_at": time.time(), "online": True}
        ])
        
        # INSERT usa execute (não retorna nada)
        mock_conn.execute = AsyncMock(return_value=None)
        
        # Poll sempre retorna queued (simula host não respondendo)
        call_count = 0
        def fetchrow_side_effect(*args, **kwargs):
            nonlocal call_count
            if call_count == 0:
                call_count += 1
                return {"call_id": "call-123", "status": "queued", "result": None}
            else:
                return {"call_id": "call-123", "status": "queued", "result": None}
        
        mock_conn.fetchrow = AsyncMock(side_effect=fetchrow_side_effect)
        
        async def instant_sleep(duration):
            return None
        
        executor = RemoteHostExecutor(lambda: mock_pool, sleep_func=instant_sleep)
        call = ToolCall(call_id="test-1", name="list_directory", arguments={"path": "test"})
        
        result = await executor.execute(call, user_id="user1", timeout=0.1)
        
        assert result.status == "timeout"
        assert result.error_type == "host_timeout"
        assert result.call_id == "test-1"
        # Verifica que UPDATE timeout foi chamado
        assert mock_conn.execute.called
        sql_calls = [str(c[0][0]) for c in mock_conn.execute.call_args_list]
        assert any("status = 'timeout'" in sql for sql in sql_calls)


class TestTransportFactory:
    """Testes para fábrica get_transport no modo cloud."""

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
