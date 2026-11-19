"""Regressões do runtime agêntico em missões longas e execução remota."""

import time
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from brain.agent.runtime import AgentRuntime
from brain.agent.task_graph import TaskGraph, TaskNode, TaskStatus
from brain.agent.working_memory import AgentWorkingMemory
from core.execution.contracts import ToolCall, ToolResult
from core.execution.remote import RemoteHostExecutor
from core.missions.executor import _execution_loop, _tool_requires_permission
from core.missions.models import AgentSession
from providers.base import ToolCall as ProviderToolCall


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


def _session_for(graph: TaskGraph) -> AgentSession:
    now = datetime.now(timezone.utc)
    return AgentSession(
        id=str(uuid.uuid4()),
        user_id="user-real-123",
        thread_id=str(uuid.uuid4()),
        goal=graph.goal,
        status="running",
        graph_json=graph.to_dict(),
        state_json={"step": 1, "completed_call_ids": []},
        created_at=now,
        updated_at=now,
    )


def test_task_graph_json_roundtrip_preserves_verification_contract():
    """Persistir uma missão não pode apagar os critérios de evidência das tarefas."""
    graph = TaskGraph(goal="Criar e validar projeto")
    graph.add_task(
        TaskNode(
            id="task_01",
            title="Criar arquivo Python",
            tool="write_file",
            arguments={"path": "Documentos/projeto/main.py", "content": "print('ok')"},
            expected_evidence_type="file",
            expected_evidence_criteria={
                "path": "Documentos/projeto/main.py",
                "contains": "print('ok')",
            },
        )
    )

    restored = TaskGraph.from_json(graph.to_json())

    task = restored.nodes["task_01"]
    assert task.expected_evidence_type == "file"
    assert task.expected_evidence_criteria["contains"] == "print('ok')"


@pytest.mark.asyncio
async def test_mission_device_tool_uses_session_user_and_completes(monkeypatch):
    """DEVICE tools devem usar o usuário da sessão e concluir a missão após sucesso."""
    graph = TaskGraph(goal="Listar arquivos do usuário")
    graph.add_task(
        TaskNode(
            id="task_01",
            title="Listar Documentos",
            tool="list_directory",
            arguments={"path": "Documentos"},
        )
    )
    session = _session_for(graph)
    transport = AsyncMock(
        return_value=ToolResult(
            call_id="call_task_01_abcd1234",
            status="success",
            output="listagem concluída",
            host_id="host-1",
        )
    )
    monkeypatch.setattr("core.missions.executor._execute_tool_via_transport", transport)

    updated = await _execution_loop(session, graph=None, user_id=session.user_id)

    assert transport.await_count == 1
    assert transport.await_args.args[2] == "user-real-123"
    assert updated.status == "completed"
    assert updated.completed_at is not None
    assert updated.graph_json["tasks"][0]["status"] == "success"


@pytest.mark.asyncio
async def test_mission_result_matches_task_id_inside_call_id():
    """call_task_01_<uuid> deve atualizar task_01, não procurar uma tool chamada call."""
    graph = TaskGraph(goal="Retomar missão após tool remota")
    graph.add_task(
        TaskNode(
            id="task_01",
            title="Listar Documentos",
            tool="list_directory",
            status=TaskStatus.RUNNING,
        )
    )
    session = _session_for(graph)
    result = ToolResult(
        call_id="call_task_01_abcd1234",
        status="success",
        output="listagem concluída",
        host_id="host-1",
    )

    updated = await _execution_loop(
        session,
        graph=None,
        user_id=session.user_id,
        tool_results=[result],
    )

    assert updated.status == "completed"
    assert updated.graph_json["tasks"][0]["status"] == "success"


def test_high_risk_tools_require_permission():
    """Comandos de terminal não podem escapar da permissão por erro na avaliação de risco."""
    assert _tool_requires_permission("execute_command") is True
    assert _tool_requires_permission("list_directory") is False


@pytest.mark.asyncio
async def test_remote_executor_awaits_async_pool_factory():
    """A factory real get_or_init_db_pool é async e precisa ser aguardada."""
    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=[])
    pool = _pool_for(conn)

    async def pool_factory():
        return pool

    executor = RemoteHostExecutor(pool_factory=pool_factory)
    result = await executor.execute(
        ToolCall(call_id="call-1", name="list_directory", arguments={"path": "Documentos"}),
        user_id="user-real-123",
        timeout=0.1,
    )

    assert result.status == "unavailable"
    assert result.error_type == "host_offline"


@pytest.mark.asyncio
async def test_legacy_agent_runtime_uses_unified_transport_and_real_user(monkeypatch):
    """O runtime usado por /agent/goal também deve sair pelo ExecutorTransport."""
    runtime = AgentRuntime()
    runtime.working_memory = AgentWorkingMemory(
        initial_variables={"user_id": "user-real-123"}
    )
    graph = TaskGraph(goal="Listar Documentos")
    task = TaskNode(
        id="task_01",
        title="Listar Documentos",
        tool="list_directory",
        arguments={"path": "Documentos"},
    )
    graph.add_task(task)
    runtime.active_graph = graph

    transport = MagicMock()
    transport.execute = AsyncMock(
        return_value=ToolResult(
            call_id="call-1",
            status="success",
            output="listagem concluída",
            host_id="host-1",
        )
    )
    monkeypatch.setattr("core.execution.transport.get_transport", lambda: transport)
    direct_registry = AsyncMock(return_value="fallback")
    monkeypatch.setattr(runtime.tools, "execute", direct_registry)

    await runtime._execute_task(task)

    assert task.status == TaskStatus.SUCCESS
    assert transport.execute.await_count == 1
    assert transport.execute.await_args.kwargs["user_id"] == "user-real-123"
    assert direct_registry.await_count == 0


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
async def test_pipeline_processes_more_than_five_tool_iterations(monkeypatch):
    """Uma tarefa que precisa de seis ciclos não pode ser cortada com sucesso fabricado."""
    monkeypatch.setenv("CHARLIE_RUNTIME_MODE", "device")
    monkeypatch.delenv("VERCEL", raising=False)
    import importlib
    import config as config_module
    importlib.reload(config_module)
    import core.pipeline as pipeline_module
    importlib.reload(pipeline_module)
    import core.execution.transport as transport_module

    transport = MagicMock()
    transport.execute = AsyncMock(
        side_effect=lambda call, user_id, timeout=15.0: ToolResult(
            call_id=call.call_id,
            status="success",
            output=f"resultado:{call.call_id}",
            host_id="local",
        )
    )
    monkeypatch.setattr(transport_module, "get_transport", lambda: transport)

    provider = MagicMock()
    calls = {"count": 0}

    def chat_stream(*args, **kwargs):
        calls["count"] += 1
        if calls["count"] <= 6:
            return _Stream([
                _Chunk(tool_calls=[
                    ProviderToolCall(
                        id=f"call-{calls['count']}",
                        name="get_datetime",
                        arguments={},
                    )
                ])
            ])
        return _Stream([_Chunk(text="Tarefa complexa concluída com evidências.")])

    provider.chat_stream = chat_stream
    pipeline = pipeline_module.AssistantPipeline()
    pipeline.llm = provider

    events = []
    async for event in pipeline.run_pipeline_stream(
        "modo agente: execute uma tarefa complexa em seis etapas",
        thread_id="thread-complex",
        user_id="user-real-123",
    ):
        events.append(event)

    successes = [
        event for event in events
        if event.type == "tool_end" and event.data.get("status") == "success"
    ]
    done = next(event for event in events if event.type == "done")
    assert len(successes) == 6
    assert transport.execute.await_count == 6
    assert done.data["reply"] == "Tarefa complexa concluída com evidências."
    assert done.data["reply"] != "Ação concluída com sucesso."
