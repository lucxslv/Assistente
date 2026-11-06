"""Testes para MissionStore (persistência multi-tenant)."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime

from core.missions.models import AgentSession, AgentPermission


class AsyncContextManagerMock:
    """Mock para async context manager (async with)."""
    def __init__(self, mock_obj):
        self.mock_obj = mock_obj

    async def __aenter__(self):
        return self.mock_obj

    async def __aexit__(self, *args):
        return None


class TestMissionStore:
    """Testes para core.missions.store."""

    @pytest.mark.asyncio
    async def test_save_load_roundtrip(self):
        """Save + load retorna sessão idêntica."""
        from core.missions.store import save_session, load_session

        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))

        session = AgentSession(
            id="test-session-1",
            user_id="user-123",
            thread_id="thread-456",
            goal="Criar projeto Python",
            status="running",
            graph_json={"nodes": ["task1", "task2"]},
            state_json={"step": 1, "completed_call_ids": ["call-1"]},
            created_at=datetime.now(),
            updated_at=datetime.now(),
            completed_at=None
        )

        await save_session(mock_pool, session)

        # Mock fetchrow for load_session
        mock_row = {
            'id': session.id,
            'user_id': session.user_id,
            'thread_id': session.thread_id,
            'goal': session.goal,
            'status': session.status,
            'graph_json': session.graph_json,
            'state_json': session.state_json,
            'created_at': session.created_at,
            'updated_at': session.updated_at,
            'completed_at': session.completed_at
        }
        mock_conn.fetchrow = AsyncMock(return_value=mock_row)

        loaded = await load_session(mock_pool, "test-session-1")

        assert loaded is not None
        assert loaded.id == session.id
        assert loaded.user_id == session.user_id
        assert loaded.thread_id == session.thread_id
        assert loaded.goal == session.goal
        assert loaded.status == session.status
        assert loaded.graph_json == session.graph_json
        assert loaded.state_json == session.state_json

    @pytest.mark.asyncio
    async def test_list_user_sessions_filtered(self):
        """Lista sessões do usuário com filtro de status."""
        from core.missions.store import list_user_sessions

        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))

        # Mock fetch returns 2 rows
        mock_row1 = {
            'id': 's1', 'user_id': 'u1', 'thread_id': 't1', 'goal': 'g1',
            'status': 'running', 'graph_json': {}, 'state_json': {},
            'created_at': datetime.now(), 'updated_at': datetime.now(), 'completed_at': None
        }
        mock_row2 = {
            'id': 's2', 'user_id': 'u1', 'thread_id': 't2', 'goal': 'g2',
            'status': 'completed', 'graph_json': {}, 'state_json': {},
            'created_at': datetime.now(), 'updated_at': datetime.now(), 'completed_at': datetime.now()
        }
        mock_conn.fetch = AsyncMock(return_value=[mock_row1, mock_row2])

        sessions = await list_user_sessions(mock_pool, "u1", status="running")
        assert len(sessions) == 2
        assert sessions[0].status == "running"
        assert sessions[1].status == "completed"

        # Verifica que o SQL inclui o filtro de status
        call_args = mock_conn.fetch.call_args
        assert "status = $2" in str(call_args)

    @pytest.mark.asyncio
    async def test_update_state_preserves_graph(self):
        """update_session_state atualiza state_json sem perder graph_json."""
        from core.missions.store import update_session_state

        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))

        await update_session_state(mock_pool, "test-session", {"step": 2}, {"nodes": ["t1"]})

        # Verifica que ambos foram passados no execute
        call_args = mock_conn.execute.call_args
        args = call_args[0][0]
        assert "state_json = $1" in args
        assert "graph_json = $2" in args
        assert "WHERE id = $3" in args

    @pytest.mark.asyncio
    async def test_nonexistent_session_returns_none(self):
        """load_session retorna None para sessão inexistente."""
        from core.missions.store import load_session

        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))
        mock_conn.fetchrow = AsyncMock(return_value=None)

        loaded = await load_session(mock_pool, "nonexistent")
        assert loaded is None

    @pytest.mark.asyncio
    async def test_mark_session_status_completed_sets_completed_at(self):
        """mark_session_status com 'completed' define completed_at."""
        from core.missions.store import mark_session_status

        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))

        await mark_session_status(mock_pool, "test-session", "completed")

        call_args = mock_conn.execute.call_args
        args = call_args[0]
        assert args[1] == "completed"  # status
        assert args[2] is not None     # completed_at
        assert args[3] == "test-session"

    @pytest.mark.asyncio
    async def test_mark_session_status_running_clears_completed_at(self):
        """mark_session_status com 'running' limpa completed_at."""
        from core.missions.store import mark_session_status

        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))

        await mark_session_status(mock_pool, "test-session", "running")

        call_args = mock_conn.execute.call_args
        args = call_args[0]
        assert args[1] == "running"
        assert args[2] is None  # completed_at = None

    @pytest.mark.asyncio
    async def test_save_permission_and_get_pending(self):
        """save_permission + get_pending_permissions roundtrip."""
        from core.missions.store import save_permission, get_pending_permissions

        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))

        perm = AgentPermission(
            id="perm-1",
            session_id="session-1",
            task_id="task-1",
            tool="execute_command",
            risk_level="high",
            status="pending",
            requested_at=datetime.now(),
            resolved_at=None,
            resolved_by=None
        )

        await save_permission(mock_pool, perm)

        # Mock fetch for get_pending_permissions
        mock_row = {
            'id': 'perm-1', 'session_id': 'session-1', 'task_id': 'task-1',
            'tool': 'execute_command', 'risk_level': 'high', 'status': 'pending',
            'requested_at': datetime.now(), 'resolved_at': None, 'resolved_by': None
        }
        mock_conn.fetch = AsyncMock(return_value=[mock_row])

        perms = await get_pending_permissions(mock_pool, "session-1")
        assert len(perms) == 1
        assert perms[0].id == "perm-1"
        assert perms[0].tool == "execute_command"

    @pytest.mark.asyncio
    async def test_resolve_permission_returns_true_on_success(self):
        """resolve_permission retorna True quando atualiza."""
        from core.missions.store import resolve_permission

        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))
        mock_conn.execute = AsyncMock(return_value="UPDATE 1")

        result = await resolve_permission(mock_pool, "perm-1", True, "user-123")
        assert result is True

    @pytest.mark.asyncio
    async def test_resolve_permission_returns_false_when_not_pending(self):
        """resolve_permission retorna False se permissão não está pending."""
        from core.missions.store import resolve_permission

        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))
        mock_conn.execute = AsyncMock(return_value="UPDATE 0")

        result = await resolve_permission(mock_pool, "perm-1", True, "user-123")
        assert result is False
