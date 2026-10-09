"""Configuração e fixtures globais para os testes do Charlie Agent Runtime."""

import asyncio
import os
import shutil
import tempfile
from pathlib import Path
import pytest

from brain.agent.runtime import AgentRuntime
from brain.agent.governance import permission_gate
from tests.torture.framework import global_safety_monitor


@pytest.fixture(autouse=True)
def setup_test_environment(monkeypatch):
    """Garante que variáveis de ambiente estejam isoladas e seguras para testes."""
    monkeypatch.setenv("CHARLIE_ENV", "test")
    monkeypatch.setenv("CHARLIE_AUTO_APPROVE", "0")
    monkeypatch.setenv("CHARLIE_RUNTIME_MODE", "device")
    permission_gate.clear()
    global_safety_monitor.reset()
    yield
    permission_gate.clear()
    global_safety_monitor.reset()


@pytest.fixture
def temp_workspace():
    """Diretório temporário isolado para operações de arquivo."""
    tmp_dir = tempfile.mkdtemp(prefix="charlie_test_ws_")
    yield Path(tmp_dir)
    shutil.rmtree(tmp_dir, ignore_errors=True)


@pytest.fixture
def fresh_runtime():
    """Instância limpa e isolada do AgentRuntime."""
    rt = AgentRuntime()
    return rt
