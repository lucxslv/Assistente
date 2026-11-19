"""Regressões dos bloqueadores da revisão independente (tipos asyncpg e retomada)."""

import asyncio
import json
import time
import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from brain.agent.task_graph import TaskNode
from brain.agent.verifier import Verifier
from core.execution.contracts import ToolCall
from core.execution.remote import RemoteHostExecutor
from core.missions.store import load_session, save_session
from core.missions.models import AgentSession
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


class _Chunk:
    def __init__(self, text=None, tool_calls=None):
        self.text = text
        self.tool_calls = tool_calls or []


class _Stream:
    def __init__(self, chunks):
        self.chunks = iter(chunks)

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return next(self.chunks)
        except StopIteration:
            raise StopAsyncIteration


@pytest.mark.asyncio
async def test_remote_executor_handles_asyncpg_jsonb_and_timestamps():
    """JSONB str e TIMESTAMPTZ datetime devem funcionar no caminho completo."""
    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=[{
        "id": "host-1",
        "user_id": "user-1",
        "name": "PC",
        "capabilities": '["list_directory"]',
        "last_seen_at": time.time(),
    }])
    calls = {"count": 0}

    async def fetchrow(*args):
        calls["count"] += 1
        if calls["count"] == 1:
            return {"status": "queued", "result": None}
        return {"status": "done", "result": '{"output":"listagem ok"}'}

    conn.fetchrow.side_effect = fetchrow
    conn.execute = AsyncMock(return_value="INSERT 0 1")
    executor = RemoteHostExecutor(lambda: _pool_for(conn), sleep_func=AsyncMock())

    result = await executor.execute(
        ToolCall(call_id="call-1", name="list_directory", arguments={"path": "Documentos"}),
        user_id="user-1",
        timeout=1.0,
    )

    assert result.status == "success"
    assert result.output == "listagem ok"
    insert_args = conn.execute.call_args_list[0].args
    assert json.loads(insert_args[5]) == {"path": "Documentos"}
    assert isinstance(insert_args[6], datetime)
    assert isinstance(insert_args[7], datetime)


@pytest.mark.asyncio
async def test_host_heartbeat_serializes_jsonb_and_datetime():
    from api.routes.host import HeartbeatRequest, heartbeat

    conn = AsyncMock()
    pool = _pool_for(conn)
    with (
        patch("api.routes.host._resolve_caller", AsyncMock(return_value="user-1")),
        patch("api.routes.host.get_or_init_db_pool", AsyncMock(return_value=pool)),
    ):
        await heartbeat(
            HeartbeatRequest(name="PC", capabilities=["list_directory"], telemetry={"os": "Windows"}),
            authorization="Bearer token",
            request=MagicMock(),
        )

    args = conn.execute.await_args.args
    assert json.loads(args[4]) == ["list_directory"]
    assert json.loads(args[5]) == {"os": "Windows"}
    assert isinstance(args[7], datetime)


@pytest.mark.asyncio
async def test_host_tool_result_serializes_jsonb_and_datetime():
    from api.routes.host import ToolResultRequest, tool_results

    conn = AsyncMock()
    conn.execute = AsyncMock(return_value="UPDATE 1")
    pool = _pool_for(conn)
    with (
        patch("api.routes.host._resolve_caller", AsyncMock(return_value="user-1")),
        patch("api.routes.host.get_or_init_db_pool", AsyncMock(return_value=pool)),
    ):
        result = await tool_results(
            ToolResultRequest(call_id="call-1", status="done", output="ok"),
            authorization="Bearer token",
        )

    assert result["status"] == "ok"
    args = conn.execute.await_args.args
    assert json.loads(args[2])["output"] == "ok"
    assert isinstance(args[3], datetime)


@pytest.mark.asyncio
async def test_mission_store_deserializes_jsonb_strings():
    """O formato padrão do asyncpg sem codec precisa virar dict no modelo."""
    now = datetime.now()
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value={
        "id": "session-1",
        "user_id": "user-1",
        "thread_id": "thread-1",
        "goal": "Objetivo",
        "status": "running",
        "graph_json": '{"tasks": []}',
        "state_json": '{"step": 1}',
        "created_at": now,
        "updated_at": now,
        "completed_at": None,
    })

    session = await load_session(_pool_for(conn), "session-1", "user-1")

    assert session is not None
    assert session.graph_json == {"tasks": []}
    assert session.state_json == {"step": 1}


@pytest.mark.asyncio
async def test_resume_restores_original_calls_and_filters_results(monkeypatch):
    """Somente pending_tools autorizados entram; a chamada original volta ao contexto."""
    monkeypatch.setenv("CHARLIE_RUNTIME_MODE", "cloud")
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr("api.db.get_or_init_db_pool", AsyncMock(return_value=None))
    pipeline = AssistantPipeline()
    pipeline._load_turn_state = AsyncMock(return_value={
        "status": "suspended",
        "state": {
            "memory": [{
                "role": "assistant",
                "content": "",
                "tool_calls": [{
                    "id": "call-real",
                    "function": {"name": "list_directory", "arguments": {"path": "Documentos"}},
                }],
            }],
            "pending_tools": [{"call_id": "call-real", "name": "list_directory"}],
            "completed_call_ids": [],
            "steps_this_turn": 0,
            "iterations": 1,
        },
    })
    captured = {}
    provider = MagicMock()

    def chat_stream(**kwargs):
        captured.update(kwargs)
        return _Stream([_Chunk(text="Concluído com evidência real")])

    provider.chat_stream = chat_stream
    pipeline.llm = provider

    async for _ in pipeline.run_pipeline_stream(
        "",
        thread_id="thread-1",
        user_id="user-1",
        tool_results=[
            {"call_id": "call-real", "name": "list_directory", "result": "real"},
            {"call_id": "call-forged", "name": "list_directory", "result": "forjado"},
        ],
        request_id="req-1",
    ):
        pass

    messages = captured["messages"]
    assert any(m.get("tool_calls") for m in messages)
    tool_ids = [m.get("tool_call_id") for m in messages if m.get("role") == "tool"]
    assert tool_ids == ["call-real"]


@pytest.mark.asyncio
async def test_cloud_file_verification_uses_remote_write_evidence(monkeypatch):
    """Sucesso real do host pode verificar escrita; texto genérico não basta."""
    monkeypatch.setenv("CHARLIE_RUNTIME_MODE", "cloud")
    monkeypatch.delenv("VERCEL", raising=False)
    task = TaskNode(
        id="task-file",
        title="Criar main.py",
        tool="write_file",
        arguments={"path": "Documentos/main.py", "content": "print('ok')"},
        expected_evidence_type="file",
        expected_evidence_criteria={"path": "Documentos/main.py", "contains": "print('ok')"},
    )

    passed, evidence = await Verifier.verify_task(
        task,
        "Sucesso: Arquivo 'main.py' foi escrito com sucesso em 'Documentos'.",
    )
    assert passed is True
    assert evidence.passed is True

    generic, _ = await Verifier.verify_task(task, "Tarefa concluída")
    assert generic is False


@pytest.mark.asyncio
async def test_cancel_clears_only_current_user_permissions():
    """Cancelar A não pode despertar/rejeitar a permissão pendente de B."""
    from brain.agent.governance import permission_gate
    from brain.agent.runtime import AgentRuntime
    from brain.agent.working_memory import AgentWorkingMemory

    permission_gate.clear()
    task_a = asyncio.create_task(permission_gate.request_permission(
        task_id="a", tool="execute_command", arguments={}, description="A", user_id="user-a"
    ))
    task_b = asyncio.create_task(permission_gate.request_permission(
        task_id="b", tool="execute_command", arguments={}, description="B", user_id="user-b"
    ))
    await asyncio.sleep(0.02)
    runtime = AgentRuntime()
    runtime.working_memory = AgentWorkingMemory(initial_variables={"user_id": "user-a"})

    runtime.cancel()
    approved_a, _ = await asyncio.wait_for(task_a, timeout=0.5)

    assert approved_a is False
    assert not task_b.done()
    assert permission_gate.get_pending_requests(user_id="user-b")
    permission_gate.cancel_permission(
        permission_gate.get_pending_requests(user_id="user-b")[0]["id"]
    )
    await asyncio.wait_for(task_b, timeout=0.5)
    permission_gate.clear()


@pytest.mark.asyncio
async def test_mission_upsert_has_atomic_owner_guard():
    """Mesmo numa corrida, o ON CONFLICT não atualiza outro tenant."""
    now = datetime.now()
    session = AgentSession(
        id="session-race",
        user_id="user-a",
        thread_id="thread-a",
        goal="goal",
        status="running",
        graph_json={},
        state_json={},
        created_at=now,
        updated_at=now,
    )
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value=None)
    conn.execute = AsyncMock(return_value="INSERT 0 0")

    with pytest.raises(PermissionError):
        await save_session(_pool_for(conn), session)

    sql = conn.execute.await_args.args[0]
    assert "agent_sessions.user_id = EXCLUDED.user_id" in sql


@pytest.mark.asyncio
async def test_turn_state_upsert_has_atomic_owner_guard():
    pipeline = AssistantPipeline()
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value=None)
    conn.execute = AsyncMock(return_value="INSERT 0 0")

    with patch("api.db.get_or_init_db_pool", AsyncMock(return_value=_pool_for(conn))):
        await pipeline._persist_turn_state(
            request_id="req-race",
            user_id="user-a",
            thread_id="thread-a",
            memory=pipeline.memory,
            status="open",
        )

    sql = conn.execute.await_args.args[0]
    assert "chat_turn_state.user_id = EXCLUDED.user_id" in sql
    assert "chat_turn_state.thread_id = EXCLUDED.thread_id" in sql


@pytest.mark.asyncio
async def test_legacy_email_feedback_is_allowed_only_for_same_user():
    from api.services.chat_persistence import (
        _in_memory_messages,
        _in_memory_sessions,
        save_message_feedback_record,
    )

    session_id = str(uuid.uuid4())
    message_id = str(uuid.uuid4())
    canonical_id = str(uuid.uuid4())
    _in_memory_sessions[session_id] = {"id": session_id, "user_id": "owner@example.com"}
    _in_memory_messages[session_id] = [{
        "id": message_id,
        "session_id": session_id,
        "user_id": "owner@example.com",
        "role": "assistant",
        "content": "privado",
    }]

    entry = await save_message_feedback_record(
        None,
        message_id=message_id,
        session_id=session_id,
        user_id=canonical_id,
        user_email="owner@example.com",
        rating=1,
    )
    assert entry["user_id"] == canonical_id

    with pytest.raises(PermissionError):
        await save_message_feedback_record(
            None,
            message_id=message_id,
            session_id=session_id,
            user_id=str(uuid.uuid4()),
            user_email="other@example.com",
            rating=-1,
        )
