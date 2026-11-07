"""Testes para config.runtime_mode e max_agent_steps_per_turn."""

import pytest
from config import config


def test_runtime_mode_cloud_on_vercel(monkeypatch):
    """VERCEL=1 força modo cloud."""
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("CHARLIE_RUNTIME_MODE", raising=False)
    assert config.runtime_mode == "cloud"


def test_runtime_mode_explicit_env(monkeypatch):
    """CHARLIE_RUNTIME_MODE=cloud força modo cloud."""
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setenv("CHARLIE_RUNTIME_MODE", "cloud")
    assert config.runtime_mode == "cloud"


def test_runtime_mode_device_default(monkeypatch):
    """CHARLIE_RUNTIME_MODE=device força modo device."""
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setenv("CHARLIE_RUNTIME_MODE", "device")
    assert config.runtime_mode == "device"


def test_max_agent_steps_per_turn_default():
    """Step budget padrão é 15."""
    assert config.max_agent_steps_per_turn == 15