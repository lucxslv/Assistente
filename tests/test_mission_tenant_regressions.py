"""Isolamento de tenant no store e no avanço de missions."""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from core.missions.executor import advance_session
from core.missions.models import AgentSession
from core.missions.store import (
    load_session,
    mark_session_status,
    resolve_permission,
    save_session,
    update_session_state,
)


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


def _session(user_id: str):
    now = datetime.now()
    return AgentSession(
        id="session-1",
        user_id=user_id,
        thread_id="thread-1",
        goal="Objetivo",
        status="running",
        graph_json={},
        state_json={},
        created_at=now,
        updated_at=now,
        completed_at=None,
    )


@pytest.mark.asyncio
async def test_mission_upsert_cannot_change_owner():
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value={"user_id": "owner"})
    pool = _pool_for(conn)

    with pytest.raises(PermissionError):
        await save_session(pool, _session("intruder"))

    assert conn.execute.await_count == 0


@pytest.mark.asyncio
async def test_mission_load_requires_user_id():
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value=None)
    pool = _pool_for(conn)

    result = await load_session(pool, "session-1", "user-a")

    assert result is None
    query = conn.fetchrow.await_args.args[0]
    assert "id = $1 AND user_id = $2" in query
    assert conn.fetchrow.await_args.args[1:] == ("session-1", "user-a")


@pytest.mark.asyncio
async def test_mission_state_update_requires_user_id():
    conn = AsyncMock()
    pool = _pool_for(conn)

    await update_session_state(pool, "session-1", "user-a", {"step": 2})

    query = conn.execute.await_args.args[0]
    assert "WHERE id = $2 AND user_id = $3" in query
    assert conn.execute.await_args.args[1:] == ('{"step": 2}', "session-1", "user-a")


@pytest.mark.asyncio
async def test_mission_status_update_requires_user_id():
    conn = AsyncMock()
    pool = _pool_for(conn)

    await mark_session_status(pool, "session-1", "user-a", "completed")

    query = conn.execute.await_args.args[0]
    assert "WHERE id = $3 AND user_id = $4" in query
    assert conn.execute.await_args.args[1:] == (
        "completed",
        conn.execute.await_args.args[2],
        "session-1",
        "user-a",
    )


@pytest.mark.asyncio
async def test_mission_permission_resolution_checks_session_owner():
    conn = AsyncMock()
    conn.execute = AsyncMock(return_value="UPDATE 0")
    pool = _pool_for(conn)

    result = await resolve_permission(pool, "perm-1", True, "Pessoa", "user-a")

    assert result is False
    query = conn.execute.await_args.args[0]
    assert "s.user_id = $4" in query
    assert conn.execute.await_args.args[1:] == (
        "approved",
        "Pessoa",
        "perm-1",
        "user-a",
    )


@pytest.mark.asyncio
async def test_advance_session_passes_expected_user_to_store(monkeypatch):
    """O avanço não pode carregar uma sessão apenas pelo ID global."""
    load_mock = AsyncMock(return_value=None)
    monkeypatch.setattr("core.missions.executor.load_session", load_mock)
    pool = MagicMock()

    with pytest.raises(ValueError):
        await advance_session(pool, "session-1", "user-a")

    assert load_mock.await_args.args == (pool, "session-1", "user-a")
