"""Testes para MissionStore (persistência multi-tenant de missões)."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime
from uuid import uuid4

from core.missions.models import AgentSession


class MockRecord:
    """Mock asyncpg Record that supports dict-like access."""
    
    def __init__(self, data: dict):
        self._data = data
    
    def __getitem__(self, key):
        return self._data[key]
    
    def __contains__(self, key):
        return key in self._data
    
    def get(self, key, default=None):
        return self._data.get(key, default)
    
    def keys(self):
        return self._data.keys()
    
    def items(self):
        return self._data.items()
    
    def values(self):
        return self._data.values()


class MockConnection:
    """Mock asyncpg connection."""
    
    def __init__(self):
        self.executed = []
        self.fetchrow_results = []
        self.fetch_results = []
        self.execute = AsyncMock(side_effect=self._capture)
        self.fetchrow = AsyncMock(side_effect=self._fetchrow)
        self.fetch = AsyncMock(side_effect=self._fetch)
    
    async def _capture(self, sql, *args):
        self.executed.append((sql.strip(), args))
        return None
    
    async def _fetchrow(self, sql, *args):
        if self.fetchrow_results:
            result = self.fetchrow_results.pop(0)
            if result is None:
                return None
            return MockRecord(result)
        return None
    
    async def _fetch(self, sql, *args):
        if self.fetch_results:
            results = self.fetch_results.pop(0)
            if isinstance(results, list):
                return [MockRecord(r) for r in results]
            return [MockRecord(r) for r in results]
        return []
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, *args):
        return None


class MockPool:
    """Mock asyncpg pool."""
    
    def __init__(self):
        self.conn = MockConnection()
    
    def acquire(self):
        return self.conn
    
    def get_all_executed(self):
        return self.conn.executed


@pytest.fixture
def mock_pool():
    return MockPool()


@pytest.fixture
def sample_session():
    return AgentSession(
        id=str(uuid4()),
        user_id="user_123",
        thread_id="thread_456",
        goal="Test mission",
        status="running",
        graph_json={"nodes": [], "edges": []},
        state_json={"step": 1, "completed_calls": []},
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        completed_at=None
    )


@pytest.mark.asyncio
async def test_save_load_roundtrip(mock_pool, sample_session):
    """save_session -> load_session retorna mesmo objeto."""
    from core.missions.store import save_session, load_session
    
    # Save
    await save_session(mock_pool, sample_session)
    
    # Setup mock for load
    mock_pool.conn.fetchrow_results = [{
        "id": sample_session.id,
        "user_id": sample_session.user_id,
        "thread_id": sample_session.thread_id,
        "goal": sample_session.goal,
        "status": sample_session.status,
        "graph_json": sample_session.graph_json,
        "state_json": sample_session.state_json,
        "created_at": sample_session.created_at,
        "updated_at": sample_session.updated_at,
        "completed_at": sample_session.completed_at,
    }]
    
    # Load
    loaded = await load_session(mock_pool, sample_session.id)
    
    assert loaded is not None
    assert loaded.id == sample_session.id
    assert loaded.user_id == sample_session.user_id
    assert loaded.thread_id == sample_session.thread_id
    assert loaded.goal == sample_session.goal
    assert loaded.status == sample_session.status
    assert loaded.graph_json == sample_session.graph_json
    assert loaded.state_json == sample_session.state_json


@pytest.mark.asyncio
async def test_list_user_sessions_filtered(mock_pool):
    """Cria sessões para user1 e user2; list_user_sessions(user1) retorna só de user1."""
    from core.missions.store import list_user_sessions
    
    # Setup mock for list - fetch_results is a list of result sets (each is a list of records)
    user1_id = "user_111"
    user2_id = "user_222"
    
    # First call (no status filter) - returns 2 records for user1
    # Second call (status="running") - returns 1 record for user1
    mock_pool.conn.fetch_results = [
        [
            {
                "id": str(uuid4()),
                "user_id": user1_id,
                "thread_id": "t1",
                "goal": "Mission 1",
                "status": "running",
                "graph_json": {},
                "state_json": {},
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "completed_at": None,
            },
            {
                "id": str(uuid4()),
                "user_id": user1_id,
                "thread_id": "t2",
                "goal": "Mission 2",
                "status": "completed",
                "graph_json": {},
                "state_json": {},
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "completed_at": datetime.utcnow(),
            },
        ],
        [
            {
                "id": str(uuid4()),
                "user_id": user1_id,
                "thread_id": "t1",
                "goal": "Mission 1",
                "status": "running",
                "graph_json": {},
                "state_json": {},
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "completed_at": None,
            },
        ],
    ]
    
    sessions = await list_user_sessions(mock_pool, user1_id)
    
    assert len(sessions) == 2
    assert all(s.user_id == user1_id for s in sessions)
    
    # Test with status filter
    running_sessions = await list_user_sessions(mock_pool, user1_id, status="running")
    assert len(running_sessions) == 1
    assert running_sessions[0].status == "running"


@pytest.mark.asyncio
async def test_update_state_preserves_graph(mock_pool, sample_session):
    """update_session_state atualiza state_json mantendo graph_json."""
    from core.missions.store import update_session_state, load_session
    
    # Setup mock for load after update
    updated_state = {"step": 2, "completed_calls": ["call_1"]}
    mock_pool.conn.fetchrow_results = [{
        "id": sample_session.id,
        "user_id": sample_session.user_id,
        "thread_id": sample_session.thread_id,
        "goal": sample_session.goal,
        "status": sample_session.status,
        "graph_json": sample_session.graph_json,  # Original graph preserved
        "state_json": updated_state,
        "created_at": sample_session.created_at,
        "updated_at": datetime.utcnow(),
        "completed_at": sample_session.completed_at,
    }]
    
    await update_session_state(mock_pool, sample_session.id, updated_state)
    
    loaded = await load_session(mock_pool, sample_session.id)
    assert loaded.state_json == updated_state
    assert loaded.graph_json == sample_session.graph_json  # Preserved


@pytest.mark.asyncio
async def test_nonexistent_session_returns_none(mock_pool):
    """load_session(unknown_id) retorna None."""
    from core.missions.store import load_session
    
    mock_pool.conn.fetchrow_results = [None]
    
    result = await load_session(mock_pool, "nonexistent_id")
    assert result is None


@pytest.mark.asyncio
async def test_mark_session_status_completed_sets_completed_at(mock_pool):
    """mark_session_status com completed/failed define completed_at."""
    from core.missions.store import mark_session_status
    
    await mark_session_status(mock_pool, "test_id", "completed")
    
    # Verify the execute was called with completed_at
    executed_sql = [e[0] for e in mock_pool.get_all_executed() if "agent_sessions" in e[0] and "UPDATE" in e[0]]
    assert len(executed_sql) == 1
    assert "completed_at" in executed_sql[0]
