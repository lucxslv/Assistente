"""Regressões de identidade canônica e compatibilidade com dados legados."""

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from api.routes.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    forgot_password,
    register,
)
from api.services.chat_persistence import load_chat_history, search_user_chat_history


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


class _HttpResponse:
    def __init__(self, payload):
        self.payload = payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return None

    def read(self):
        return json.dumps(self.payload).encode()


@pytest.mark.asyncio
async def test_register_fails_closed_when_supabase_user_id_is_missing():
    """Uma conta Supabase sem id não pode virar um UUID local desconectado."""
    responses = iter([
        _HttpResponse({"user": {}}),
        _HttpResponse({"access_token": "token", "user": {}}),
    ])

    def fake_urlopen(request, timeout=0):
        return next(responses)

    with (
        patch(
            "api.routes.auth.config",
            MagicMock(
                supabase_url="https://project.supabase.co",
                supabase_key="key",
            ),
        ),
        patch("api.routes.auth.rate_limiter.enforce", AsyncMock()),
        patch("urllib.request.urlopen", fake_urlopen),
        patch("api.routes.auth._upsert_user_profile_record", AsyncMock(return_value={})) as upsert,
    ):
        with pytest.raises(HTTPException) as exc_info:
            await register(
                RegisterRequest(name="Pessoa", email="pessoa@example.com", password="senha-forte"),
                request=MagicMock(),
                response=MagicMock(),
            )

    assert exc_info.value.status_code in (400, 503)
    assert upsert.await_count == 0


@pytest.mark.asyncio
async def test_forgot_password_resolves_uuid_from_profile_with_cold_cache():
    """Recuperação não pode gravar o e-mail como se fosse user_id."""
    canonical_id = str(uuid.uuid4())
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value={"user_id": canonical_id})
    pool = _pool_for(conn)
    token_store = {}

    with (
        patch("api.routes.auth.get_or_init_db_pool", AsyncMock(return_value=pool)),
        patch("api.routes.auth.rate_limiter.enforce", AsyncMock()),
        patch("api.routes.auth._in_memory_reset_tokens", token_store),
    ):
        result = await forgot_password(
            ForgotPasswordRequest(email="pessoa@example.com"),
            request=MagicMock(),
        )

    assert result["ok"] is True
    assert token_store
    saved = next(iter(token_store.values()))
    assert saved["user_id"] == canonical_id
    assert saved["user_id"] != "pessoa@example.com"


@pytest.mark.asyncio
async def test_legacy_email_owned_history_loads_for_matching_authenticated_uuid():
    """O UUID dono pode ler uma sessão legada cujo user_id era seu próprio e-mail."""
    session_id = str(uuid.uuid4())
    canonical_id = str(uuid.uuid4())
    conn = AsyncMock()

    async def fetch(query, *args):
        if "SELECT role, content" in query:
            return [{"role": "user", "content": "Mensagem legada"}]
        return []

    async def fetchrow(query, *args):
        if "SELECT user_id FROM public.chat_sessions" in query:
            return {"user_id": "pessoa@example.com"}
        return None

    conn.fetch.side_effect = fetch
    conn.fetchrow.side_effect = fetchrow

    history = await load_chat_history(
        _pool_for(conn),
        session_id,
        user_id=canonical_id,
        user_email="pessoa@example.com",
    )

    assert history == [{"role": "user", "content": "Mensagem legada"}]


@pytest.mark.asyncio
async def test_cross_chat_search_uses_uuid_and_legacy_email_aliases():
    """A busca aceita os dois identificadores do mesmo usuário, sem abrir para outros."""
    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=[])
    canonical_id = str(uuid.uuid4())

    await search_user_chat_history(
        _pool_for(conn),
        user_id=canonical_id,
        query="projeto",
        user_email="pessoa@example.com",
    )

    owner_ids = conn.fetch.await_args.args[1]
    assert set(owner_ids) == {canonical_id, "pessoa@example.com"}
