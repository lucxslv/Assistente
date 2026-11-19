"""Isolamento de sessões e runtimes agênticos por usuário."""

import uuid

import pytest

from brain.agent.persistence import AgentPersistence
from brain.agent.task_graph import TaskGraph


def _session(session_id: str, user_id: str):
    graph = TaskGraph(goal="Objetivo privado")
    graph.id = session_id
    graph.working_memory_state = {"user_id": user_id}
    payload = graph.to_dict()
    payload["id"] = session_id
    payload["user_id"] = user_id
    return payload


def test_task_graph_id_survives_serialization_roundtrip():
    """O ID gerado no start_session precisa chegar ao payload de persistência."""
    graph = TaskGraph(goal="Objetivo")
    graph.id = "session-123"

    payload = graph.to_dict()
    restored = TaskGraph.from_dict(payload)

    assert payload["id"] == "session-123"
    assert restored.id == "session-123"


def test_default_agent_session_is_not_shared_between_users(tmp_path):
    """Registros default antigos não aparecem para usuários autenticados."""
    persistence = AgentPersistence(db_path=str(tmp_path / "agent.db"))
    session_id = f"legacy-{uuid.uuid4()}"
    persistence.save_session(_session(session_id, "default"), user_id="default")
    user_a = str(uuid.uuid4())

    assert persistence.get_session(session_id, user_id=user_a) is None
    assert persistence.list_sessions(user_id=user_a) == []
    assert persistence.get_metrics(user_id=user_a)["total_sessions"] == 0
    assert persistence.delete_session(session_id, user_id=user_a) is False
    # O modo local/default continua enxergando apenas seus próprios dados.
    assert persistence.get_session(session_id, user_id="default") is not None


def test_agent_session_owner_cannot_be_reassigned(tmp_path):
    """Conhecer o ID não permite assumir uma sessão de outro tenant."""
    persistence = AgentPersistence(db_path=str(tmp_path / "agent.db"))
    session_id = f"session-{uuid.uuid4()}"
    persistence.save_session(_session(session_id, "default"), user_id="default")

    with pytest.raises(PermissionError):
        persistence.save_session(_session(session_id, "intruder"), user_id="intruder")


def test_runtime_instances_are_isolated_per_user():
    """O grafo ativo de um usuário não pode ser sobrescrito pelo de outro."""
    from api.routes.agent import _runtime_for_user
    from brain.agent.runtime import agent_runtime

    user_a = str(uuid.uuid4())
    user_b = str(uuid.uuid4())
    runtime_a = _runtime_for_user(user_a)
    runtime_b = _runtime_for_user(user_b)

    assert runtime_a is not runtime_b
    assert _runtime_for_user(user_a) is runtime_a
    assert _runtime_for_user("default") is agent_runtime


def test_graph_payload_can_be_persisted_with_generated_id(tmp_path):
    """Integração mínima: start gera id e o save não o descarta silenciosamente."""
    persistence = AgentPersistence(db_path=str(tmp_path / "agent.db"))
    user_id = str(uuid.uuid4())
    graph = TaskGraph(goal="Objetivo")
    graph.id = f"session-{uuid.uuid4().hex[:12]}"
    graph.working_memory_state = {"user_id": user_id}

    persistence.save_session(graph.to_dict(), user_id=user_id)
    stored = persistence.get_session(graph.id, user_id=user_id)

    assert stored is not None
    assert stored["id"] == graph.id
    assert stored["user_id"] == user_id
