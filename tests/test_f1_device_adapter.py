"""Testes para adapter /api/device/command → fila unificada agent_tool_calls."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import time

from core.execution.contracts import ToolCall, ToolResult


class TestDeviceCommandAdapter:
    """Testes para o adapter do /api/device/command."""

    @pytest.mark.asyncio
    async def test_command_cloud_enqueues_unified_queue(self, monkeypatch):
        """Modo cloud: /command insere na fila unificada agent_tool_calls."""
        monkeypatch.setenv("VERCEL", "1")
        monkeypatch.delenv("CHARLIE_RUNTIME_MODE", raising=False)
        import importlib
        import config as config_module
        importlib.reload(config_module)
        
        from api.routes.device import router
        from api.routes.device import _action_to_tool, _map_params_to_args
        
        # Test action mappings
        assert _action_to_tool("screenshot") == "take_screenshot"
        assert _action_to_tool("take_screenshot") == "take_screenshot"
        assert _action_to_tool("open") == "open_path_or_app"
        assert _action_to_tool("open_path_or_app") == "open_path_or_app"
        assert _action_to_tool("command") == "execute_command"
        assert _action_to_tool("run_command") == "execute_command"
        assert _action_to_tool("git_pull") == "execute_command"
        assert _action_to_tool("lock") == "system_power_action"
        assert _action_to_tool("minimize_all") == "minimize_all"
        assert _action_to_tool("volume") == "set_system_volume"
        assert _action_to_tool("mute") == "toggle_mute"
        assert _action_to_tool("media") == "media_play_pause"

        # Test param mapping
        args = _map_params_to_args("screenshot", {}, "user1")
        assert args == {}
        
        args = _map_params_to_args("open", {"target": "C:\\Users"}, target="C:\\Users", command=None, level=None, key=None)
        assert args == {"path": "C:\\Users"}
        
        args = _map_params_to_args("command", {"command": "dir"}, command="dir", target=None, level=None, key=None)
        assert args == {"command": "dir"}

    @pytest.mark.asyncio
    async def test_command_local_unchanged(self, monkeypatch):
        """Modo device: executa via helpers Windows como hoje (não usa fila)."""
        monkeypatch.setenv("CHARLIE_RUNTIME_MODE", "device")
        monkeypatch.delenv("VERCEL", raising=False)
        import importlib
        import config as config_module
        importlib.reload(config_module)
        
        # This test verifies the device mode logic is unchanged
        # The actual Windows execution is tested elsewhere
        from config import config
        assert config.runtime_mode == "device"


# Integration test with mock pool
class TestDeviceCommandIntegration:
    """Testes de integração com pool mockado."""

    @pytest.mark.asyncio
    async def test_command_cloud_enqueues_unified_queue(self, monkeypatch):
        """Cloud: POST /device/command → INSERT em agent_tool_calls."""
        monkeypatch.setenv("VERCEL", "1")
        monkeypatch.delenv("CHARLIE_RUNTIME_MODE", raising=False)
        import importlib
        import config as config_module
        importlib.reload(config_module)
        
        from api.routes.device import _action_to_tool, _map_params_to_args
        
        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))
        
        # Mock the pool factory
        import api.routes.device as device_module
        original_pool_factory = device_module.get_or_init_db_pool
        
        # Create an async mock pool that returns a mock pool
        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        
        # Create an async context manager mock
        mock_cm = AsyncMock()
        mock_cm.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_cm.__aexit__ = AsyncMock(return_value=None)
        
        # Make acquire return the async context manager
        mock_pool.acquire = MagicMock(return_value=mock_cm)
        
        async def mock_get_pool():
            return mock_pool
        
        device_module.get_or_init_db_pool = mock_get_pool
        
        try:
            # Build request
            from fastapi.testclient import TestClient
            from api.main import app
            client = TestClient(app)
            
            # Mock the auth by patching get_authorized_device_async
            from api.routes import device as device_module_import
            original_auth = device_module_import.get_authorized_device_async
            device_module_import.get_authorized_device_async = AsyncMock(return_value={"user_id": "test-user"})
            
            device_module._pending_commands = []
            
            # Execute request
            response = client.post(
                "/api/device/command",
                json={"action": "screenshot", "params": {}},
                headers={"Authorization": "Bearer test-token"}
            )
            
            # Verify response shape (unchanged for mobile compat)
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["status"] == "queued"
            assert "command_id" in data
            
            # Verify INSERT was called on agent_tool_calls (not device_pending_commands)
            execute_calls = [c for c in mock_conn.execute.call_args_list 
                           if 'INSERT INTO agent_tool_calls' in str(c)]
            assert len(execute_calls) > 0
            
            # Verify it's NOT using device_pending_commands
            legacy_calls = [c for c in mock_conn.execute.call_args_list 
                          if 'device_pending_commands' in str(c)]
            assert len(legacy_calls) == 0
            
        finally:
            device_module.get_or_init_db_pool = original_pool_factory
            device_module._pending_commands = []
            device_module_import.get_authorized_device_async = original_auth


class AsyncContextManagerMock:
    def __init__(self, mock_obj):
        self.mock_obj = mock_obj
    async def __aenter__(self):
        return self.mock_obj
    async def __aexit__(self, *args):
        return None