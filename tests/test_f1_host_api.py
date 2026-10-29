"""Testes para rotas do host — heartbeat autenticado, claim de calls e post de resultados."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi.testclient import TestClient
from api.main import app


class TestHostRoutes:
    """Testes para api/routes/host.py."""

    @pytest.fixture
    def client(self):
        return TestClient(app)

    @pytest.fixture
    def mock_pool(self):
        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))
        return mock_pool, mock_conn

    class AsyncContextManagerMock:
        def __init__(self, mock_obj):
            self.mock_obj = mock_obj
        
        async def __aenter__(self):
            return self.mock_obj
        
        async def __aexit__(self, *args):
            return None

    def test_heartbeat_requires_auth(self, client):
        """Sem auth → 401."""
        res = client.post("/api/host/heartbeat", json={"name": "test-host", "capabilities": []})
        assert res.status_code == 401

    @pytest.mark.asyncio
    async def test_heartbeat_upserts_host(self, mock_pool):
        """Heartbeat faz upsert em agent_hosts com user_id do token."""
        from api.routes.host import heartbeat
        from api.db import get_or_init_db_pool
        
        mock_pool_obj, mock_conn = mock_pool
        
        # Mock get_or_init_db_pool
        import api.routes.host as host_module
        original_get_pool = host_module.get_or_init_db_pool
        host_module.get_or_init_db_pool = AsyncMock(return_value=mock_pool_obj)
        
        # Mock auth - device token
        mock_device = {"device_id": "dev1", "user_id": "user123", "device_name": "Mobile"}
        from api.routes.pair import get_authorized_device_async
        import api.routes.host as host_module
        original_get_device = host_module.get_authorized_device_async
        host_module.get_authorized_device_async = AsyncMock(return_value=mock_device)
        
        # Mock current time
        import time
        original_time = time.time
        time.time = MagicMock(return_value=1234567890.0)
        
        try:
            # Create mock request
            from pydantic import BaseModel
            class HeartbeatReq(BaseModel):
                host_id: str | None = None
                name: str
                capabilities: list[str]
                telemetry: dict | None = None
            
            req = HeartbeatReq(name="Test Host", capabilities=["list_directory", "read_file"])
            
            # Call the endpoint function directly
            from fastapi import Request
            from unittest.mock import MagicMock as Mock
            mock_request = Mock(spec=Request)
            mock_request.headers = {"Authorization": "Bearer fake-token"}
            
            result = await heartbeat(req, authorization="Bearer fake-token", request=mock_request)
            
            # Verify upsert was called
            assert mock_conn.execute.called
            sql_calls = [str(c[0][0]) for c in mock_conn.execute.call_args_list]
            assert any("INSERT INTO agent_hosts" in sql and "ON CONFLICT" in sql for sql in sql_calls)
            assert any("user_id" in sql for sql in sql_calls)
            
            # Verify response
            assert "host_id" in result
            assert result["poll_interval_ms"] == 2000
            assert "server_time" in result
        finally:
            host_module.get_or_init_db_pool = original_get_pool
            host_module.get_authorized_device_async = original_get_device
            time.time = original_time

    @pytest.mark.asyncio
    async def test_pending_calls_scoped_to_token_user(self, mock_pool):
        """Claim de calls só retorna calls do user_id do token."""
        from api.routes.host import pending_calls
        import api.routes.host as host_module
        
        mock_pool_obj, mock_conn = mock_pool
        original_get_pool = host_module.get_or_init_db_pool
        host_module.get_or_init_db_pool = AsyncMock(return_value=mock_pool_obj)
        
        mock_device = {"device_id": "dev1", "user_id": "user123"}
        original_get_device = host_module.get_authorized_device_async
        host_module.get_authorized_device_async = AsyncMock(return_value=mock_device)
        
        # Mock fetchrow for claim
        mock_conn.fetch = AsyncMock(return_value=[
            {"call_id": "call1", "tool": "list_directory", "args": {"path": "test"}}
        ])
        
        try:
            from fastapi import Request
            mock_request = MagicMock()
            mock_request.headers = {"Authorization": "Bearer fake-token"}
            
            result = await pending_calls(limit=10, authorization="Bearer fake-token", request=mock_request)
            
            # Verify user_id scoping in SQL
            assert mock_conn.fetch.called
            sql_calls = [str(c[0][0]) for c in mock_conn.fetch.call_args_list]
            assert any("user_id = $2" in sql or "user_id = $1" in sql for sql in sql_calls)
            
            # Verify response shape
            assert "calls" in result
            assert isinstance(result["calls"], list)
        finally:
            host_module.get_or_init_db_pool = original_get_pool
            host_module.get_authorized_device_async = original_get_device

    @pytest.mark.asyncio
    async def test_resolve_result_of_other_user_rejected(self, mock_pool):
        """Postar resultado de call de outro usuário → 404."""
        from api.routes.host import tool_results
        from fastapi import HTTPException
        import api.routes.host as host_module
        
        mock_pool_obj, mock_conn = mock_pool
        original_get_pool = host_module.get_or_init_db_pool
        host_module.get_or_init_db_pool = AsyncMock(return_value=mock_pool_obj)
        
        mock_device = {"device_id": "dev1", "user_id": "user123"}
        original_get_device = host_module.get_authorized_device_async
        host_module.get_authorized_device_async = AsyncMock(return_value=mock_device)
        
        # Mock fetchrow returns None (no rows updated)
        mock_conn.execute = AsyncMock(return_value="UPDATE 0")
        
        try:
            class ToolResultReq:
                def __init__(self):
                    self.call_id = "other_user_call"
                    self.status = "success"
                    self.output = "OK"
                    self.duration_ms = 100
                    self.error_type = None
            
            req = ToolResultReq()
            
            with pytest.raises(HTTPException) as exc_info:
                await tool_results(req, authorization="Bearer fake-token")
            
            assert exc_info.value.status_code == 404
        finally:
            host_module.get_or_init_db_pool = original_get_pool
            host_module.get_authorized_device_async = original_get_device


class AsyncContextManagerMock:
    def __init__(self, mock_obj):
        self.mock_obj = mock_obj
    
    async def __aenter__(self):
        return self.mock_obj
    
    async def __aexit__(self, *args):
        return None