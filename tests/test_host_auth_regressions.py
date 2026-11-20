"""Regressões de autenticação duradoura e recuperação do host Tauri."""

from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from api.routes.pair import AutoLinkRequest, auto_link_device


class _Scope:
    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, *args):
        return None


def _pool_for(conn):
    pool = MagicMock()
    pool.acquire.return_value = _Scope(conn)
    return pool


@pytest.fixture
def pair_module(monkeypatch):
    import api.routes.pair as module

    monkeypatch.setattr(module, "_save_authorized_devices", lambda: None)
    module._authorized_devices.clear()
    module._token_to_device.clear()
    yield module
    module._authorized_devices.clear()
    module._token_to_device.clear()


@pytest.mark.asyncio
async def test_auto_link_persists_desktop_host_credential(pair_module, monkeypatch):
    """O token do host precisa sobreviver a workers serverless e à expiração do JWT."""
    conn = AsyncMock()
    conn.execute = AsyncMock(return_value="INSERT 0 1")
    monkeypatch.setattr(
        pair_module,
        "get_or_init_db_pool",
        AsyncMock(return_value=_pool_for(conn)),
    )

    result = await auto_link_device(
        AutoLinkRequest(device_id="host-stable", device_name="PC", platform="desktop_host"),
        user={"id": "user-real-123"},
    )

    assert result["token"].startswith("charlie_dev_")
    sql = conn.execute.await_args.args[0]
    assert "INSERT INTO device_authorized_devices" in sql
    assert "ON CONFLICT (device_id) DO UPDATE" in sql
    params = conn.execute.await_args.args[1:]
    assert "host-stable" in params
    assert "user-real-123" in params
    assert "desktop_host" in params


@pytest.mark.asyncio
async def test_auto_link_cannot_reassign_device_of_another_user(pair_module, monkeypatch):
    """Um ID reutilizado não pode trocar o proprietário da credencial."""
    conn = AsyncMock()
    conn.execute = AsyncMock(return_value="INSERT 0 0")
    monkeypatch.setattr(
        pair_module,
        "get_or_init_db_pool",
        AsyncMock(return_value=_pool_for(conn)),
    )

    with pytest.raises(HTTPException) as exc:
        await auto_link_device(
            AutoLinkRequest(device_id="host-collision", device_name="PC", platform="desktop_host"),
            user={"id": "intruder"},
        )

    assert exc.value.status_code == 403


def test_host_service_mints_reuses_and_recovers_revocable_credential():
    root = Path(__file__).resolve().parents[1]
    source = (root / "desktop/src/services/hostService.ts").read_text(encoding="utf-8")

    for expected in (
        "charlie_host_token",
        "charlie_host_id",
        "/pair/auto-link",
        "desktop_host",
        "userToken",
        "res.status === 401",
    ):
        assert expected in source


def test_host_service_keeps_retrying_after_initial_registration_failure():
    root = Path(__file__).resolve().parents[1]
    source = (root / "desktop/src/services/hostService.ts").read_text(encoding="utf-8")
    start = source.index("export async function startHostService")
    end = source.index("/** Stop the host service */")
    body = source[start:end]

    assert body.index("isPolling = true") < body.index("await registerHost()")
    assert "throw err" not in body


def test_app_restarts_host_when_authenticated_user_changes():
    root = Path(__file__).resolve().parents[1]
    source = (root / "desktop/src/App.tsx").read_text(encoding="utf-8")

    assert "stopDeviceHeartbeat" in source
    assert "}, [currentUser?.id]);" in source
