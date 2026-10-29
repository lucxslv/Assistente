"""Testes para migração das tabelas do runtime agêntico."""

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


class TestMigration:
    """Testes para migrate_agent_runtime.py."""

    @pytest.mark.asyncio
    async def test_migration_creates_all_tables(self):
        """Migração cria 3 tabelas + 3 índices."""
        from scripts.db.migrate_agent_runtime import up
        
        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))
        
        await up(mock_pool)
        
        # Verifica que 3 CREATE TABLE foram chamados
        create_calls = [c for c in mock_conn.execute.call_args_list 
                       if 'CREATE TABLE' in str(c)]
        assert len(create_calls) == 3
        
        # Verifica que 3 CREATE INDEX foram chamados
        index_calls = [c for c in mock_conn.execute.call_args_list 
                      if 'CREATE INDEX' in str(c)]
        assert len(index_calls) == 3
        
        # Verifica nomes das tabelas
        table_names = set()
        for call in create_calls:
            sql = str(call[0][0])
            if 'agent_hosts' in sql:
                table_names.add('agent_hosts')
            elif 'agent_tool_calls' in sql:
                table_names.add('agent_tool_calls')
            elif 'chat_turn_state' in sql:
                table_names.add('chat_turn_state')
        
        assert table_names == {'agent_hosts', 'agent_tool_calls', 'chat_turn_state'}

    @pytest.mark.asyncio
    async def test_migration_idempotent(self):
        """Rodar up() duas vezes não lança erro."""
        from scripts.db.migrate_agent_runtime import up
        
        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))
        
        await up(mock_pool)
        await up(mock_pool)  # Segunda vez não deve lançar
        
        # Total de chamadas: 6 na primeira + 6 na segunda = 12
        assert mock_conn.execute.call_count == 12


class TestCleanup:
    """Testes para limpeza de tabelas desnecessárias."""

    @pytest.mark.asyncio
    async def test_cleanup_removes_legacy_tables(self):
        """Cleanup remove tabelas legadas desnecessárias."""
        from scripts.db.cleanup_agent_runtime import cleanup
        
        mock_pool = MagicMock()
        mock_conn = AsyncMock()
        mock_pool.acquire = MagicMock(return_value=AsyncContextManagerMock(mock_conn))
        
        await cleanup(mock_pool)
        
        # Verifica DROP TABLE para tabelas legadas
        drop_calls = [c for c in mock_conn.execute.call_args_list 
                     if 'DROP TABLE' in str(c)]
        dropped_tables = set()
        for call in drop_calls:
            sql = str(call[0][0])
            if 'device_host_state' in sql:
                dropped_tables.add('device_host_state')
            elif 'device_pending_commands' in sql:
                dropped_tables.add('device_pending_commands')
            elif 'device_pairing_sessions' in sql:
                dropped_tables.add('device_pairing_sessions')
            elif 'device_authorized_devices' in sql:
                dropped_tables.add('device_authorized_devices')
        
        # Pelo menos estas 4 tabelas legadas devem ser removidas
        assert {'device_host_state', 'device_pending_commands', 
                'device_pairing_sessions', 'device_authorized_devices'}.issubset(dropped_tables)
