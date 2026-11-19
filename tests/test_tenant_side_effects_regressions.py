"""Regressões contra efeitos colaterais e estados compartilhados entre tenants."""

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.routes.auth import _token_cache
from api.services.chat_persistence import (
    _in_memory_feedback,
    _in_memory_messages,
    _in_memory_sessions,
    save_chat_message_record,
    save_message_feedback_record,
)
from core.pipeline import AssistantPipeline


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


def _headers(user_id: str, email: str):
    token = f"token-{user_id}"
    _token_cache.set(token, {"id": user_id, "email": email, "name": email})
    return {"Authorization": f"Bearer {token}"}


def _reset_stores():
    _in_memory_sessions.clear()
    _in_memory_messages.clear()
    _in_memory_feedback.clear()


def test_foreign_message_list_does_not_mutate_in_progress_messages():
    """Listar a thread de outro usuário não pode marcar suas mensagens como interrupted."""
    _reset_stores()
    owner = str(uuid.uuid4())
    intruder = str(uuid.uuid4())
    thread_id = str(uuid.uuid4())
    _in_memory_sessions[thread_id] = {
        "id": thread_id,
        "title": "Privado",
        "user_id": owner,
    }
    message_id = asyncio.run(
        save_chat_message_record(
            None,
            session_id=thread_id,
            user_id=owner,
            role="assistant",
            content="Resposta ainda sendo gerada",
            status="in_progress",
            request_id="req-owner",
        )
    )
    client = TestClient(app)
    with patch("api.routes.messages.get_or_init_db_pool", return_value=None):
        response = client.get(
            f"/api/messages?thread_id={thread_id}",
            headers=_headers(intruder, "intruder@example.com"),
        )

    assert response.status_code in (403, 404)
    messages = _in_memory_messages[thread_id]
    target = next(m for m in messages if m["id"] == message_id)
    assert target["status"] == "in_progress"


def test_foreign_feedback_is_rejected_without_persistence():
    """Usuário B não pode avaliar uma mensagem do usuário A."""
    _reset_stores()
    owner = str(uuid.uuid4())
    intruder = str(uuid.uuid4())
    thread_id = str(uuid.uuid4())
    _in_memory_sessions[thread_id] = {
        "id": thread_id,
        "title": "Privado",
        "user_id": owner,
    }
    message_id = asyncio.run(
        save_chat_message_record(
            None,
            session_id=thread_id,
            user_id=owner,
            role="assistant",
            content="Resposta privada",
        )
    )
    client = TestClient(app)
    with patch("api.routes.messages.get_or_init_db_pool", return_value=None):
        response = client.post(
            f"/api/messages/{message_id}/feedback",
            headers=_headers(intruder, "intruder@example.com"),
            json={"thread_id": thread_id, "rating": 1},
        )

    assert response.status_code in (403, 404)
    assert _in_memory_feedback == {}


@pytest.mark.asyncio
async def test_feedback_db_rejects_foreign_message_before_insert():
    """Também no Postgres, a relação mensagem↔thread↔usuário é validada antes do INSERT."""
    conn = AsyncMock()
    conn.fetchval = AsyncMock(return_value=None)
    pool = _pool_for(conn)

    with pytest.raises(PermissionError):
        await save_message_feedback_record(
            pool,
            message_id=str(uuid.uuid4()),
            session_id=str(uuid.uuid4()),
            user_id="intruder",
            rating=1,
        )

    assert conn.execute.await_count == 0


@pytest.mark.asyncio
async def test_turn_state_load_requires_request_user_and_thread():
    """O carregamento do turno precisa filtrar request_id, user_id e thread_id."""
    pipeline = AssistantPipeline()
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value=None)
    pool = _pool_for(conn)
    request_id = "req-shared"
    user_id = str(uuid.uuid4())
    thread_id = str(uuid.uuid4())

    with patch("api.db.get_or_init_db_pool", AsyncMock(return_value=pool)):
        result = await pipeline._load_turn_state(request_id, user_id, thread_id)

    assert result is None
    query = conn.fetchrow.await_args.args[0]
    assert "request_id = $1" in query
    assert "user_id = $2" in query
    assert "thread_id = $3" in query
    assert conn.fetchrow.await_args.args[1:] == (request_id, user_id, thread_id)


@pytest.mark.asyncio
async def test_turn_state_cannot_overwrite_other_tenant():
    """Um request_id reutilizado não pode substituir o estado de outro usuário."""
    pipeline = AssistantPipeline()
    conn = AsyncMock()
    request_id = "req-shared"
    owner_id = str(uuid.uuid4())
    other_id = str(uuid.uuid4())
    thread_id = str(uuid.uuid4())
    conn.fetchrow = AsyncMock(
        return_value={"user_id": owner_id, "thread_id": thread_id}
    )
    pool = _pool_for(conn)
    memory = pipeline.memory

    with patch("api.db.get_or_init_db_pool", AsyncMock(return_value=pool)):
        await pipeline._persist_turn_state(
            request_id=request_id,
            user_id=other_id,
            thread_id=thread_id,
            memory=memory,
            status="suspended",
        )

    assert conn.execute.await_count == 0
