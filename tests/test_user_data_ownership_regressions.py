"""Regressões de titularidade e associação dos dados aos usuários."""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from api.routes.auth import current_user_id_var
from api.services.audit_service import get_audit_users_summary
from api.services.chat_persistence import (
    ensure_session_record,
    save_user_memory_entry,
    save_user_preference_entry,
)
from memory.database import db as legacy_memory_db
from tools.registry import ToolRegistry


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


@pytest.mark.asyncio
async def test_audit_summary_loads_profile_display_name_and_account_state(monkeypatch):
    """O diretório admin não pode perder perfil, suspensão e cotas por coluna SQL inválida."""
    profile = {
        "user_id": "user-1",
        "user_email": "pessoa@example.com",
        "name": "Nome Completo",
        "username": "pessoa",
        "is_suspended": True,
        "suspended_reason": "Revisão",
        "created_at": None,
        "daily_token_limit": 12345,
        "daily_request_limit": 67,
        "monthly_cost_limit_usd": 8.5,
    }
    audit = {
        "user_id": "user-1",
        "user_email": "pessoa@example.com",
        "total_messages": 4,
        "total_sessions": 2,
        "total_cost_usd": 0.25,
        "total_tokens": 100,
        "total_prompt_tokens": 60,
        "total_completion_tokens": 40,
        "last_active": None,
        "ip_address": "127.0.0.1",
    }

    class Conn:
        async def fetch(self, query, *args):
            if "FROM auth.users" in query:
                if "p.name" in query:
                    raise RuntimeError("column p.name does not exist")
                return [profile]
            if "FROM audit_chat_logs" in query:
                return [audit]
            raise AssertionError(f"Query inesperada: {query}")

    import api.db as db_module

    monkeypatch.setattr(
        db_module,
        "get_or_init_db_pool",
        AsyncMock(return_value=_pool_for(Conn())),
    )

    users = await get_audit_users_summary()

    assert len(users) == 1
    assert users[0]["name"] == "Nome Completo"
    assert users[0]["username"] == "pessoa"
    assert users[0]["is_suspended"] is True
    assert users[0]["daily_token_limit"] == 12345
    assert users[0]["daily_request_limit"] == 67
    assert users[0]["monthly_cost_limit_usd"] == 8.5
    assert users[0]["total_messages"] == 4


@pytest.mark.asyncio
async def test_thread_uuid_owner_takes_precedence_over_conflicting_identifier():
    """Um userIdentifier coincidente não pode autorizar acesso ao Thread de outro UUID."""
    session_id = str(uuid.uuid4())
    owner_uuid = uuid.uuid4()
    intruder_uuid = uuid.uuid4()
    conn = AsyncMock()

    async def fetchrow(query, *args):
        if "FROM public.chat_sessions" in query:
            return None
        if 'FROM "Thread"' in query:
            return {
                "id": uuid.UUID(session_id),
                "name": "Conversa protegida",
                "userId": owner_uuid,
                "userIdentifier": "intruder@example.com",
            }
        return None

    conn.fetchrow.side_effect = fetchrow

    with pytest.raises(PermissionError):
        await ensure_session_record(
            _pool_for(conn),
            session_id=session_id,
            user_id=str(intruder_uuid),
            user_email="intruder@example.com",
            prompt="Tentativa de acesso",
        )


@pytest.mark.asyncio
async def test_memory_service_rejects_default_owner_before_touching_db():
    """Memória nova sem identidade real não pode ser gravada no tenant compartilhado default."""
    pool = MagicMock()
    pool.acquire.side_effect = AssertionError("O banco não deveria ser acessado")

    result = await save_user_memory_entry(
        pool,
        user_id="default",
        fact="O usuário mantém o projeto Charlie em Python",
        importance=0.95,
        confidence=0.95,
    )

    assert result == ""
    assert pool.acquire.call_count == 0


@pytest.mark.asyncio
async def test_preference_service_rejects_default_owner_before_touching_db():
    """Preferências também exigem um proprietário explícito."""
    pool = MagicMock()
    pool.acquire.side_effect = AssertionError("O banco não deveria ser acessado")

    result = await save_user_preference_entry(
        pool,
        user_id="default",
        key="tom",
        value="direto",
    )

    assert result == ""
    assert pool.acquire.call_count == 0


@pytest.mark.asyncio
async def test_memory_tool_does_not_report_success_without_authenticated_user(monkeypatch):
    """Sem usuário autenticado, a tool falha honestamente e não chama nenhum fallback."""
    import api.db as db_module

    monkeypatch.setattr(db_module, "get_or_init_db_pool", AsyncMock(return_value=None))
    add_memory = MagicMock()
    monkeypatch.setattr("tools.registry.db.add_memory", add_memory)
    current_user_id_var.set("default")

    result = await ToolRegistry()._wrap_save_user_memory(
        "O usuário mantém o projeto Charlie em Python"
    )

    assert result.startswith("Erro:")
    assert "autenticado" in result
    assert "sucesso" not in result.lower()
    add_memory.assert_not_called()


@pytest.mark.asyncio
async def test_memory_tool_does_not_report_success_when_all_persistence_fails(monkeypatch):
    """Falha dos dois caminhos de persistência deve chegar ao modelo como erro."""
    import api.db as db_module

    monkeypatch.setattr(db_module, "get_or_init_db_pool", AsyncMock(return_value=None))
    monkeypatch.setattr(
        "tools.registry.db.add_memory",
        MagicMock(return_value={"action": "error", "error": "database_unavailable"}),
    )
    current_user_id_var.set("user-valid-123")

    result = await ToolRegistry()._wrap_save_user_memory(
        "O usuário mantém o projeto Charlie em Python"
    )

    assert result.startswith("Erro:")
    assert "sucesso" not in result.lower()


def test_legacy_memory_write_rejects_default_owner_before_connection(monkeypatch):
    """O fallback síncrono não pode contornar a regra e recriar dados em default."""
    get_connection = MagicMock()
    monkeypatch.setattr(legacy_memory_db, "_get_connection", get_connection)

    result = legacy_memory_db.add_or_reinforce_memory(
        content="Fato duradouro sem proprietário",
        user_id="default",
    )

    assert result["action"] == "error"
    assert result["error"] == "user_id_required"
    get_connection.assert_not_called()
