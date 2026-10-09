"""Testes para o ReflectorAgent e FailureMemory com quebra de loop e pivot material de estratégia."""

import asyncio
import pytest
from brain.agent.task_graph import TaskNode
from brain.agent.failure_memory import FailureMemory
from brain.agent.working_memory import AgentWorkingMemory
from brain.agent.reflector import ReflectorAgent, CorrectionPlan


def test_failure_memory_hypothesis_count_and_semantic_normalization():
    """FailureMemory deve normalizar semanticamente estratégias e contar repetições."""
    fm = FailureMemory()
    task_id = "task_code_1"

    # Tentativa 1
    fm.record_failure(
        task_id=task_id,
        tool="execute_command",
        error="command not found: touch",
        cause="Linux touch command on Windows",
        attempt=1,
        strategy="execute_command: touch file.txt",
        hypothesis="touch_cmd",
    )
    assert fm.get_hypothesis_failure_count(task_id, "touch_cmd") == 1
    assert fm.is_loop_detected(task_id, "execute_command: touch file.txt") is False

    # Tentativa 2 com variação cosmética (espaço extra e aspas)
    fm.record_failure(
        task_id=task_id,
        tool="execute_command",
        error="command not found: touch",
        cause="Linux touch command on Windows",
        attempt=2,
        strategy="execute_command:  touch 'file.txt' ",
        hypothesis="touch_cmd",
    )
    assert fm.get_hypothesis_failure_count(task_id, "touch_cmd") == 2
    # Agora deve detectar loop/repetição cosmética
    assert fm.is_loop_detected(task_id, "execute_command: touch \"file.txt\"") is True


def test_reflector_forces_switch_strategy_or_abort_after_two_failures():
    """Após 2 falhas na mesma abordagem, o Reflector deve bloquear repetição e exigir pivot material."""
    fm = FailureMemory()
    wm = AgentWorkingMemory()
    task = TaskNode(
        id="task_build_1",
        title="Compilar projeto",
        tool="execute_command",
        arguments={"command": "npm run build"},
        attempts=2,
        max_attempts=3,
    )

    # Registra 2 falhas da mesma abordagem
    fm.record_failure(
        task_id=task.id,
        tool="execute_command",
        error="TS2304: Cannot find name 'foo'",
        cause="Erro de tipagem",
        attempt=1,
        strategy="execute_command: npm run build",
        hypothesis="build_without_fixes",
    )
    fm.record_failure(
        task_id=task.id,
        tool="execute_command",
        error="TS2304: Cannot find name 'foo'",
        cause="Erro de tipagem",
        attempt=2,
        strategy="execute_command:  npm run build ",
        hypothesis="build_without_fixes",
    )

    plan = asyncio.run(ReflectorAgent.reflect_and_correct(
        task=task,
        raw_error="TS2304: Cannot find name 'foo'",
        failure_memory=fm,
        working_memory=wm,
    ))

    # Não pode sugerir a mesma estratégia repetida
    assert plan.action in ("switch_strategy", "switch_tool", "abort")
    if plan.action == "abort":
        assert any(term in plan.diagnosis.lower() for term in ("evidência", "diagnóstico", "esgotado", "estratégia", "limite"))


def test_reflector_provides_transparent_diagnostics_on_abort():
    """Ao abortar, o Reflector deve fornecer diagnóstico transparente e honesto do que foi tentado."""
    fm = FailureMemory()
    wm = AgentWorkingMemory()
    task = TaskNode(
        id="task_fail_final",
        title="Acessar porta de rede",
        tool="execute_command",
        arguments={"command": "Test-NetConnection -Port 8080"},
        attempts=3,
        max_attempts=3,
    )

    fm.record_failure(
        task_id=task.id,
        tool="execute_command",
        error="Connection refused",
        cause="Porta fechada",
        attempt=1,
        strategy="net_test_1",
        hypothesis="hyp_port_test",
    )

    plan = asyncio.run(ReflectorAgent.reflect_and_correct(
        task=task,
        raw_error="Connection refused on port 8080",
        failure_memory=fm,
        working_memory=wm,
    ))

    assert plan.can_retry is False
    assert plan.action == "abort"
    assert len(plan.diagnosis) > 10
