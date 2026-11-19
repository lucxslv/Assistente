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
    session.state_json["pending_call_ids"] = {
        "call_task_01_abcd1234": {"task_id": "task_01", "host_id": "host-1"}
    }
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
                        name="list_directory",
                        arguments={"path": "Documentos"},
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


@pytest.mark.asyncio
async def test_mission_rejects_result_with_unknown_call_id():
    """Um call_id inventado não pode concluir uma task sem despacho correspondente."""
    graph = TaskGraph(goal="Retomar missão")
    graph.add_task(TaskNode(
        id="task_01",
        title="Listar Documentos",
        tool="list_directory",
        status=TaskStatus.RUNNING,
    ))
    session = _session_for(graph)
    forged = ToolResult(
        call_id="call_task_01_falso123",
        status="success",
        output="resultado inventado",
        host_id="host-1",
    )

    updated = await _execution_loop(
        session,
        graph=None,
        user_id=session.user_id,
        tool_results=[forged],
    )

    assert updated.status == "running"
    assert updated.graph_json["tasks"][0]["status"] == "running"


@pytest.mark.asyncio
async def test_mission_permission_can_be_approved_through_shared_gate(monkeypatch):
    """A aprovação da rota precisa alcançar o gate usado pela missão e liberar a tool."""
    import asyncio
    from brain.agent.governance import permission_gate
    from brain.agent.verifier import TaskEvidence

    permission_gate.clear()
    graph = TaskGraph(goal="Executar comando aprovado")
    graph.add_task(TaskNode(
        id="task_01",
        title="Executar comando",
        tool="execute_command",
        arguments={"command": "echo ok"},
    ))
    session = _session_for(graph)
    transport = AsyncMock(return_value=ToolResult(
        call_id="call-task",
        status="success",
        output="ok",
        host_id="host-1",
    ))
    monkeypatch.setattr("core.missions.executor._execute_tool_via_transport", transport)
    monkeypatch.setattr(
        "core.missions.executor.Verifier.verify_task",
        AsyncMock(return_value=(True, TaskEvidence(type="system", summary="ok"))),
    )

    loop_task = asyncio.create_task(
        _execution_loop(session, graph=None, user_id=session.user_id)
    )
    try:
        pending = []
        for _ in range(50):
            await asyncio.sleep(0.01)
            pending = permission_gate.get_pending_requests(user_id=session.user_id)
            if pending:
                break

        assert pending, "A solicitação não ficou visível para a rota de permissões"
        assert permission_gate.resolve_permission(
            pending[0].get("id") or pending[0].get("permission_id"),
            approved=True,
            user_id=session.user_id,
        )
        updated = await asyncio.wait_for(loop_task, timeout=1.0)
    finally:
        if not loop_task.done():
            loop_task.cancel()
        permission_gate.clear()

    assert transport.await_count == 1
    assert updated.status == "completed"
    assert updated.graph_json["tasks"][0]["status"] == "success"


@pytest.mark.asyncio
async def test_legacy_runtime_keeps_cloud_tools_in_process(monkeypatch):
    """search_web/save_user_memory não podem depender de um host Windows online."""
    from brain.agent.verifier import TaskEvidence

    runtime = AgentRuntime()
    runtime.working_memory = AgentWorkingMemory(
        initial_variables={"user_id": "user-real-123"}
    )
    graph = TaskGraph(goal="Pesquisar")
    task = TaskNode(id="task_01", title="Pesquisar", tool="search_web", arguments={"query": "teste"})
    graph.add_task(task)
    runtime.active_graph = graph

    transport = MagicMock()
    transport.execute = AsyncMock(return_value=ToolResult(
        call_id="call-1", status="success", output="remoto", host_id="host-1"
    ))
    cloud_execute = AsyncMock(return_value={
        "status": "success",
        "output": "resultado web",
        "friendly_name": "Pesquisando na Web",
        "duration_ms": 1,
        "error_type": None,
        "is_recoverable": False,
    })
    monkeypatch.setattr("core.execution.transport.get_transport", lambda: transport)
    monkeypatch.setattr(runtime.tools, "execute_structured", cloud_execute)
    monkeypatch.setattr(
        "brain.agent.runtime.Verifier.verify_task",
        AsyncMock(return_value=(True, TaskEvidence(type="system", summary="ok"))),
    )

    await runtime._execute_task(task)

    assert cloud_execute.await_count == 1
    assert transport.execute.await_count == 0
    assert task.observation == "resultado web"


@pytest.mark.asyncio
async def test_pipeline_budget_message_overrides_model_completion_claim(monkeypatch):
    """Texto do modelo junto à tool call não pode esconder orçamento esgotado."""
    import core.pipeline as pipeline_module

    monkeypatch.setenv("CHARLIE_RUNTIME_MODE", "device")
    monkeypatch.delenv("VERCEL", raising=False)
    transport = MagicMock()
    transport.execute = AsyncMock(return_value=ToolResult(
        call_id="call-1", status="success", output="ok", host_id="local"
    ))
    monkeypatch.setattr("core.execution.transport.get_transport", lambda: transport)

    provider = MagicMock()
    provider.chat_stream = MagicMock(return_value=_Stream([
        _Chunk(
            text="Tarefa concluída",
            tool_calls=[ProviderToolCall(id="call-1", name="get_datetime", arguments={})],
        )
    ]))
    pipeline = pipeline_module.AssistantPipeline()
    pipeline.llm = provider
    pipeline._max_agent_steps_per_turn = 1

    events = []
    async for event in pipeline.run_pipeline_stream(
        "modo agente: execute",
        thread_id="thread-budget",
        user_id="user-real-123",
    ):
        events.append(event)

    done = next(event for event in events if event.type == "done")
    assert "Limite de passos" in done.data["reply"]
    assert done.data["reply"] != "Tarefa concluída"


@pytest.mark.asyncio
async def test_pipeline_resume_restores_exhausted_budget_without_new_llm_call(monkeypatch):
    """Uma retomada com orçamento já esgotado não pode abrir outro ciclo."""
    import core.pipeline as pipeline_module

    monkeypatch.setenv("CHARLIE_RUNTIME_MODE", "cloud")
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr("api.db.get_or_init_db_pool", AsyncMock(return_value=None))
    provider = MagicMock()
    provider.chat_stream = MagicMock(side_effect=AssertionError("LLM não deveria ser chamada"))
    pipeline = pipeline_module.AssistantPipeline()
    pipeline.llm = provider
    pipeline._max_agent_steps_per_turn = 2
    pipeline._load_turn_state = AsyncMock(return_value={
        "status": "suspended",
        "state": {
            "steps_this_turn": 2,
            "iterations": 2,
            "completed_call_ids": ["call-1"],
        },
    })

    events = []
    async for event in pipeline.run_pipeline_stream(
        "",
        thread_id="thread-resume",
        user_id="user-real-123",
        tool_results=[{"call_id": "call-1", "name": "get_datetime", "result": "ok"}],
        request_id="req-resume",
    ):
        events.append(event)

    done = next(event for event in events if event.type == "done")
    assert provider.chat_stream.call_count == 0
    assert "Limite de passos" in done.data["reply"]
