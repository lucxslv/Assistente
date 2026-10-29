"""Testes para estados honestos — substituição de resultados fabricados."""

import os
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from tools.file_explorer import read_file, create_folder, list_directory, write_file, replace_in_file
from brain.agent.verifier import Verifier
from brain.agent.task_graph import TaskNode, TaskEvidence


def _setup_cloud_env(monkeypatch):
    """Configura ambiente cloud e recarrega módulos dependentes."""
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("CHARLIE_RUNTIME_MODE", raising=False)
    import importlib
    import config as config_module
    importlib.reload(config_module)
    import tools.registry as registry_module
    importlib.reload(registry_module)
    import tools.file_explorer as fe_module
    importlib.reload(fe_module)
    import brain.agent.verifier as verifier_module
    importlib.reload(verifier_module)
    from tools.registry import ToolRegistry, ToolScope
    return ToolRegistry, ToolScope, fe_module, verifier_module


def _setup_device_env(monkeypatch):
    """Configura ambiente device e recarrega módulos dependentes."""
    monkeypatch.setenv("CHARLIE_RUNTIME_MODE", "device")
    monkeypatch.delenv("VERCEL", raising=False)
    import importlib
    import config as config_module
    importlib.reload(config_module)
    import tools.registry as registry_module
    importlib.reload(registry_module)
    from tools.registry import ToolRegistry, ToolScope
    return ToolRegistry, ToolScope


class TestRegistryHonestStates:
    """Testes para ToolRegistry.execute_structured com estados honestos."""

    @pytest.mark.asyncio
    async def test_execute_device_tool_cloud_without_host_is_honest(self, monkeypatch):
        """Modo cloud sem host → unavailable/host_offline."""
        ToolRegistry, ToolScope, _, _ = _setup_cloud_env(monkeypatch)
        
        registry = ToolRegistry()
        async def fake_handler(**kwargs):
            return "should not be called"
        registry.register("fake_device_tool", fake_handler, scope=ToolScope.DEVICE, description="test")
        
        result = await registry.execute_structured("fake_device_tool", {}, user_id="test_user")
        
        assert result["status"] == "unavailable"
        assert result["error_type"] == "host_offline"
        assert result["is_recoverable"] is False
        assert "Sem executor disponível" in result["output"]
        assert "fake_device_tool" in result["output"]

    def test_no_fabricated_success_strings(self, monkeypatch):
        """Output NÃO contém strings fabricadas."""
        ToolRegistry, ToolScope, _, _ = _setup_cloud_env(monkeypatch)
        
        registry = ToolRegistry()
        async def fake_handler(**kwargs):
            return "should not be called"
        registry.register("fake_device_tool", fake_handler, scope=ToolScope.DEVICE, description="test")
        
        import asyncio
        result = asyncio.run(registry.execute_structured("fake_device_tool", {}, user_id="test_user"))
        
        output = result["output"]
        forbidden = ["níveis ideais", "enviado para execução", "via Charlie Desktop", "despachado para o"]
        for f in forbidden:
            assert f not in output, f"String fabricada encontrada: {f}"

    @pytest.mark.asyncio
    async def test_local_mode_still_executes(self, monkeypatch):
        """Modo device executa tool CLOUD normalmente."""
        ToolRegistry, ToolScope = _setup_device_env(monkeypatch)
        
        registry = ToolRegistry()
        called = {}
        async def fake_cloud_handler(**kwargs):
            called["yes"] = True
            return "real result"
        registry.register("fake_cloud_tool", fake_cloud_handler, scope=ToolScope.CLOUD, description="test")
        
        result = await registry.execute_structured("fake_cloud_tool", {}, user_id="test_user")
        
        assert called.get("yes") is True
        assert result["status"] == "success"
        assert result["output"] == "real result"


class TestFileExplorerHonestStates:
    """Testes para tools de file_explorer com estados honestos."""

    def test_file_explorer_cloud_honest(self, monkeypatch):
        """Em modo cloud, tools retornam unavailable/host_offline."""
        _, _, fe_module, _ = _setup_cloud_env(monkeypatch)
        
        # Test read_file
        result = fe_module.read_file("test.txt")
        assert "Sem executor disponível" in result or "host_offline" in result or "unavailable" in result
        
        # Test create_folder
        result = fe_module.create_folder("test")
        assert "Sem executor disponível" in result or "host_offline" in result or "unavailable" in result
        
        # Test list_directory
        result = fe_module.list_directory("test")
        assert "Sem executor disponível" in result or "host_offline" in result or "unavailable" in result
        
        # Test write_file
        result = fe_module.write_file("test.txt", "content")
        assert "Sem executor disponível" in result or "host_offline" in result or "unavailable" in result
        
        # Test replace_in_file
        result = fe_module.replace_in_file("test.txt", "a", "b")
        assert "Sem executor disponível" in result or "host_offline" in result or "unavailable" in result


class TestVerifierHonestStates:
    """Testes para verifier com estados honestos."""

    @pytest.mark.asyncio
    async def test_verifier_cloud_honest(self, monkeypatch):
        """Verifier em modo cloud não fabrica sucesso."""
        _, _, _, verifier_module = _setup_cloud_env(monkeypatch)
        
        task = TaskNode(
            id="test",
            title="Test task",
            tool="create_folder",
            arguments={"path": "test"},
            description="test",
            expected_evidence_type="file",
            expected_evidence_criteria={"path": "test"}
        )
        
        tool_result = "Sem executor disponível: nenhum host do usuário está conectado para executar 'create_folder'."
        
        passed, evidence = await verifier_module.Verifier.verify_task(
            task, tool_result
        )
        
        assert isinstance(evidence, TaskEvidence)
        assert passed is False
        assert evidence.passed is False
