"""Testes para migração das tabelas de missões."""

import pytest
from unittest.mock import AsyncMock, MagicMock


class AsyncContextManagerMock:
    """Mock para async context manager (async with)."""
    def __init__(self, mock_obj):
        self.mock_obj = mock_obj

    async def __aenter__(self):
        return self.mock_obj

    async def __aexit__(self, *args):
        return None


class TestMissionsMigration:
    """Testes para migrate_missions.py."""

    @pytest.mark.asyncio
    async def test_migration_creates_mission_tables(self):
        """Migração cria 2 tabelas + 2 índices."""
        from scripts.db.migrate_missions import up

        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))

        await up(mock_pool)

        # Verifica que 2 CREATE TABLE foram chamados
        create_calls = [c for c in mock_conn.execute.call_args_list
                       if 'CREATE TABLE' in str(c)]
        assert len(create_calls) == 2

        # Verifica que 2 CREATE INDEX foram chamados
        index_calls = [c for c in mock_conn.execute.call_args_list
                      if 'CREATE INDEX' in str(c)]
        assert len(index_calls) == 2

        # Verifica nomes das tabelas
        table_names = set()
        for call in create_calls:
            sql = str(call[0][0])
            # Extract table name from CREATE TABLE IF NOT EXISTS <table_name>
            import re
            match = re.search(r'CREATE TABLE IF NOT EXISTS\s+(\w+)', sql, re.IGNORECASE)
            if match:
                table_names.add(match.group(1))

        assert table_names == {'agent_sessions', 'agent_permissions'}

        # Verifica colunas essenciais em agent_sessions
        sessions_sql = ''
        for call in create_calls:
            sql = str(call[0][0])
            if 'agent_sessions' in sql:
                sessions_sql = sql
                break
        assert 'user_id' in sessions_sql
        assert 'thread_id' in sessions_sql
        assert 'goal' in sessions_sql
        assert 'status' in sessions_sql
        assert 'graph_json' in sessions_sql
        assert 'state_json' in sessions_sql
        assert 'completed_at' in sessions_sql

        # Verifica colunas essenciais em agent_permissions
        perms_sql = ''
        for call in create_calls:
            sql = str(call[0][0])
            if 'agent_permissions' in sql:
                perms_sql = sql
                break
        assert 'session_id' in perms_sql
        assert 'task_id' in perms_sql
        assert 'tool' in perms_sql
        assert 'risk_level' in perms_sql
        assert 'REFERENCES agent_sessions' in perms_sql

    @pytest.mark.asyncio
    async def test_migration_idempotent(self):
        """Rodar up() duas vezes não lança erro."""
        from scripts.db.migrate_missions import up

        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))

        await up(mock_pool)
        await up(mock_pool)  # Segunda vez não deve lançar

        # Total de chamadas: 4 na primeira + 4 na segunda = 8
        assert mock_conn.execute.call_count == 8

    @pytest.mark.asyncio
    async def test_permissions_table_links_to_sessions(self):
        """agent_permissions tem FK para agent_sessions."""
        from scripts.db.migrate_missions import up

        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))

        await up(mock_pool)

        # Verifica que a FK existe no SQL
        perms_sql = ''
        for call in mock_conn.execute.call_args_list:
            sql = str(call[0][0])
            if 'agent_permissions' in sql and 'CREATE TABLE' in sql:
                perms_sql = sql
                break

        assert 'REFERENCES agent_sessions(id)' in perms_sql
        assert 'ON DELETE CASCADE' in perms_sql
