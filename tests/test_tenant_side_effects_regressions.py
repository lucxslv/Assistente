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


def test_sse_propagates_external_request_id_to_pipeline():
    """O SSE e a retomada precisam usar o mesmo request_id persistido."""
    from core.streaming import StreamEvent

    captured = {}

    class FakePipeline:
        last_model_used = "gemini-test"
        last_provider_used = "gemini"
        last_fallback_used = False
        last_fallback_reason = None
        last_route_mode = "fast"
        last_usage_metadata = {}
        last_error_detail = None

        async def run_pipeline_stream(self, user_text, **kwargs):
            captured.update(kwargs)
            yield StreamEvent(type="done", data={"reply": "ok"})

    _reset_stores()
    user_id = str(uuid.uuid4())
    client = TestClient(app)
    with (
        patch("api.routes.chat.get_pipeline", return_value=FakePipeline()),
        patch("api.routes.chat.get_or_init_db_pool", return_value=None),
        patch("api.security.rate_limiter.rate_limiter.enforce", AsyncMock()),
    ):
        response = client.post(
            "/api/chat/stream",
            headers=_headers(user_id, "owner@example.com"),
            json={"message": "Continuar", "request_id": "req-external"},
        )

    assert response.status_code == 200
    assert captured["request_id"] == "req-external"


@pytest.mark.asyncio
async def test_foreign_thread_is_rejected_before_any_write_or_cache():
    """Thread estrangeira não pode gerar INSERT/cache do invasor antes do 403."""
    from api.services.chat_persistence import ensure_session_record

    session_id = str(uuid.uuid4())
    owner_id = str(uuid.uuid4())
    intruder_id = str(uuid.uuid4())
    conn = AsyncMock()

    async def fetchrow(query, *args):
        if 'FROM "Thread"' in query:
            return {
                "userId": owner_id,
                "userIdentifier": "owner@example.com",
                "name": "Privado",
            }
        return None

    conn.fetchrow.side_effect = fetchrow
    conn.execute = AsyncMock()
    _in_memory_sessions.pop(session_id, None)

    with pytest.raises(PermissionError):
        await ensure_session_record(
            _pool_for(conn),
            session_id=session_id,
            user_id=intruder_id,
            user_email="intruder@example.com",
            prompt="Tentativa de acesso",
        )

    assert conn.execute.await_count == 0
    assert session_id not in _in_memory_sessions


@pytest.mark.asyncio
async def test_turn_state_persists_budget_and_completed_call_ids():
    """O estado salvo precisa permitir retomar sem reiniciar o orçamento."""
    import json

    pipeline = AssistantPipeline()
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value=None)
    pool = _pool_for(conn)

    with patch("api.db.get_or_init_db_pool", AsyncMock(return_value=pool)):
        await pipeline._persist_turn_state(
            request_id="req-budget",
            user_id=str(uuid.uuid4()),
            thread_id=str(uuid.uuid4()),
            memory=pipeline.memory,
            status="suspended",
            steps_this_turn=4,
            iterations=3,
            completed_call_ids={"call-b", "call-a"},
        )

    state_json = conn.execute.await_args.args[5]
    state = json.loads(state_json)
    assert state["steps_this_turn"] == 4
    assert state["iterations"] == 3
    assert state["completed_call_ids"] == ["call-a", "call-b"]
