"""Contratos entre o schema/RPC de memória e seus consumidores Python."""

import inspect

from memory import migrations
from memory.database import MemoryDatabase
from scripts.db import cleanup_agent_runtime


def test_memory_migration_contains_columns_used_by_queries():
    """Colunas lidas/escritas pelo MemoryDatabase precisam existir na migração."""
    required = {
        "memory_type",
        "confidence",
        "importance",
        "last_confirmed_at",
        "last_used_at",
        "metadata",
        "fact",
    }
    for column in required:
        assert column in migrations.MIGRATION_SQL


def test_match_memories_returns_full_shape_consumed_by_search():
    """A RPC precisa devolver as nove colunas consumidas por search_memories."""
    return_columns = (
        "id UUID",
        "content TEXT",
        "category TEXT",
        "similarity FLOAT",
        "memory_type TEXT",
        "confidence FLOAT",
        "importance FLOAT",
        "metadata JSONB",
        "created_at TIMESTAMPTZ",
    )
    for column in return_columns:
        assert column in migrations.MIGRATION_SQL
    assert "DROP FUNCTION IF EXISTS match_memories" in migrations.MIGRATION_SQL


def test_dedup_query_selects_five_named_fields():
    """A desduplicação não pode depender da ordem das quatro colunas antigas."""
    source = inspect.getsource(MemoryDatabase.add_or_reinforce_memory)
    assert "SELECT id, content, confidence, importance, metadata" in source


def test_cleanup_does_not_drop_live_tenant_columns():
    """Cleanup do broker antigo não pode remover identidade dos dados ativos."""
    forbidden = (
        'DROP COLUMN IF EXISTS "userId"',
        "DROP COLUMN IF EXISTS user_id",
    )
    for statement in forbidden:
        assert statement not in cleanup_agent_runtime.CLEANUP_SQL
