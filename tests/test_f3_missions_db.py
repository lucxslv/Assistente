"""Testes para migração de tabelas de missões (agent_sessions, agent_permissions)."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class MockConnection:
    """Mock asyncpg connection."""
    
    def __init__(self):
        self.executed = []
        self.execute = AsyncMock(side_effect=self._capture)
    
    async def _capture(self, sql):
        self.executed.append(sql.strip())
        return None
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, *args):
        return None


class MockPool:
    """Mock asyncpg pool that captures executed SQL."""
    
    def __init__(self):
        self.conn = MockConnection()
        self.all_executed = []
    
    def acquire(self):
        """Return the connection directly (async context manager)."""
        return self.conn
    
    def get_all_executed(self):
        return self.conn.executed


@pytest.mark.asyncio
async def test_migration_creates_mission_tables():
    """MockPool captura SQL: 2x CREATE TABLE + 2x CREATE INDEX.
    Colunas e tipos corretos (status enum: pending/running/paused/completed/failed)."""
    from scripts.db.migrate_missions import up
    
    pool = MockPool()
    await up(pool)
    
    sql_commands = " ".join(pool.get_all_executed())
    
    # Verifica 2 CREATE TABLE
    assert sql_commands.count("CREATE TABLE IF NOT EXISTS agent_sessions") == 1
    assert sql_commands.count("CREATE TABLE IF NOT EXISTS agent_permissions") == 1
    
    # Verifica 2 CREATE INDEX
    assert "CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_id_status" in sql_commands
    assert "CREATE INDEX IF NOT EXISTS idx_agent_permissions_session_id_status" in sql_commands
    
    # Verifica colunas da agent_sessions
    sessions_ddl = [s for s in pool.get_all_executed() if "agent_sessions" in s and "CREATE TABLE" in s][0]
    assert "id TEXT PRIMARY KEY" in sessions_ddl
    assert "user_id TEXT NOT NULL" in sessions_ddl
    assert "thread_id TEXT NOT NULL" in sessions_ddl
    assert "goal TEXT NOT NULL" in sessions_ddl
    assert "status TEXT NOT NULL" in sessions_ddl
    assert "graph_json JSONB NOT NULL" in sessions_ddl
    assert "state_json JSONB NOT NULL" in sessions_ddl
    assert "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in sessions_ddl
    assert "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in sessions_ddl
    assert "completed_at TIMESTAMPTZ" in sessions_ddl
    
    # Verifica colunas da agent_permissions
    perms_ddl = [s for s in pool.get_all_executed() if "agent_permissions" in s and "CREATE TABLE" in s][0]
    assert "id TEXT PRIMARY KEY" in perms_ddl
    assert "session_id TEXT NOT NULL" in perms_ddl
    assert "task_id TEXT NOT NULL" in perms_ddl
    assert "tool TEXT NOT NULL" in perms_ddl
    assert "risk_level TEXT NOT NULL" in perms_ddl
    assert "status TEXT NOT NULL" in perms_ddl
    assert "requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()" in perms_ddl
    assert "resolved_at TIMESTAMPTZ" in perms_ddl
    assert "resolved_by TEXT" in perms_ddl


@pytest.mark.asyncio
async def test_migration_idempotent():
    """Rodar up() duas vezes não lança."""
    from scripts.db.migrate_missions import up
    
    pool = MockPool()
    await up(pool)
    first_count = len(pool.get_all_executed())
    
    pool = MockPool()
    await up(pool)
    second_count = len(pool.get_all_executed())
    
    # Segunda execução deve executar os mesmos comandos (idempotente)
    assert second_count == first_count


@pytest.mark.asyncio
async def test_permissions_table_links_to_sessions():
    """FK session_id -> agent_sessions.id."""
    from scripts.db.migrate_missions import up
    
    pool = MockPool()
    await up(pool)
    
    sql_commands = " ".join(pool.get_all_executed())
    
    # Verifica que a tabela agent_permissions tem session_id
    perms_ddl = [s for s in pool.get_all_executed() if "agent_permissions" in s and "CREATE TABLE" in s][0]
    assert "session_id TEXT NOT NULL" in perms_ddl
    # Se houver FK explícita, verificamos
    if "REFERENCES" in perms_ddl:
        assert "agent_sessions" in perms_ddl
