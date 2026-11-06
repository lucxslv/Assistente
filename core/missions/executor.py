"""Executor de missões event-driven — orquestra avanço de sessão."""

import json
import asyncio
from datetime import datetime, timezone
from typing import Optional, List
from uuid import uuid4

from core.missions.models import AgentSession
from core.missions.store import (
    save_session, load_session, list_user_sessions, update_session_state, mark_session_status
)
from core.execution.contracts import ToolCall, ToolResult, ToolCallStatus
from core.execution.transport import get_transport
from brain.agent.task_graph import TaskGraph, TaskNode, TaskStatus
from brain.agent.planner import AgentPlanner
from brain.agent.verifier import Verifier
from brain.agent.governance import PermissionGate, RiskLevel
from tools.registry import ToolScope, ToolRegistry
from tools.registry import registry as default_registry


def _tool_requires_permission(tool_name: str) -> bool:
    """Verifica se tool exige permissão (risk_level alto/crítico)."""
    # Delegate to governance permission_gate risk assessment
    try:
        tool_info = default_registry._schemas.get(tool_name)
        if tool_info:
            from brain.agent.governance import assess_risk
            risk = assess_risk(tool_name, {})
            return risk.value >= 3  # HIGH=3, CRITICAL=4
    except Exception:
        pass
    return False


def _get_tool_scope(tool_name: str) -> ToolScope:
    """Obtém escopo da tool via registry."""
    try:
        return default_registry.get_scope(tool_name)
    except Exception:
        return ToolScope.CLOUD


async def _execute_tool_via_transport(tool_name: str, arguments: dict, user_id: str, call_id: str) -> ToolResult:
    """Executa tool via transport (LocalExecutor no device, RemoteHostExecutor no cloud)."""
    transport = get_transport()
    tool_call = ToolCall(
        call_id=call_id,
        name=tool_name,
        arguments=arguments,
    )
    return await transport.execute(tool_call, user_id, timeout=15.0)


def _get_risk_level(tool_name: str) -> str:
    """Mapeia tool para risk_level para permission_gate."""
    critical_tools = {"execute_command", "system_power_action", "execute_system_command", "run_command"}
    high_tools = {"create_folder", "write_file", "replace_in_file", "manage_application", "press_key", "type_text"}
    
    if tool_name in critical_tools:
        return RiskLevel.CRITICAL.value
    if tool_name in high_tools:
        return RiskLevel.HIGH.value
    return RiskLevel.MEDIUM.value


async def _execution_loop(
    session: AgentSession,
    graph: TaskGraph,
    user_id: str,
    tool_results: Optional[List[ToolResult]] = None,
    permission_resolved: Optional[dict] = None,
) -> AgentSession:
    """Loop de execução event-driven — roda até próximo ponto de espera."""
    
    # Reconstrói graph se necessário
    if isinstance(session.graph_json, dict):
        graph = TaskGraph.from_json(session.graph_json)
    else:
        graph = TaskGraph(goal=session.goal)
    
    # Cria permission gate local para esta sessão
    permission_gate = PermissionGate()
    
    # Atualiza completed_call_ids do state
    state = session.state_json or {}
    completed_call_ids = set(state.get("completed_call_ids", []))
    step = state.get("step", 1)
    
    # Processa tool_results recebidos
    if tool_results:
        for result in tool_results:
            if result.call_id in completed_call_ids:
                continue
            completed_call_ids.add(result.call_id)
            # Encontra task correspondente pelo call_id ou tool name
            for task in graph.nodes.values():
                if task.status == TaskStatus.RUNNING and task.tool == result.call_id.split("_")[0] if "_" in result.call_id else task.tool:
                    task.status = TaskStatus.SUCCESS if result.status == "success" else TaskStatus.FAILURE
                    if result.status != "success":
                        task.error = result.output
                    # Verifica evidência se tool completed
                    if result.status == "success" and task.expected_evidence_type:
                        passed, evidence = await Verifier.verify_task(task, result.output)
                        if not passed:
                            task.status = TaskStatus.FAILURE
                            task.error = evidence.summary
                    break
    
    # Processa permission_resolved
    if permission_resolved and permission_resolved.get("approved"):
        task_id = permission_resolved.get("task_id")
        if task_id in graph.nodes:
            graph.nodes[task_id].status = TaskStatus.PENDING  # Reativa para execução
    
    # Loop de execução até próximo ponto de espera
    max_steps = 10  # Safety limit por iteração
    steps = 0
    
    while steps < max_steps:
        # Pega tasks prontas
        ready_tasks = graph.get_ready_tasks()
        if not ready_tasks:
            if graph.is_completed():
                session.status = "completed"
            break
        
        # Executa uma task por iteração (event-driven: um passo por avanço)
        task = ready_tasks[0]
        task.status = TaskStatus.RUNNING
        step += 1
        
        # Verifica se é tool DEVICE (precisa transporte) ou CLOUD (executa in-process)
        tool_scope = _get_tool_scope(task.tool)
        
        if tool_scope == ToolScope.DEVICE:
            # Verifica permissão se necessário
            if _tool_requires_permission(task.tool):
                task.status = TaskStatus.WAITING_PERMISSION
                # Solicita permissão
                perm_id = await permission_gate.request_permission(
                    task_id=task.id,
                    tool=task.tool,
                    arguments=task.arguments,
                    description=f"Missão: {task.title}",
                    risk_level=_get_risk_level(task.tool),
                )
                # Marca task como waiting_permission e sai do loop
                # A retomada virá via permission_resolved no próximo advance_session
                break
            
            # Executa via transport
            call_id = f"call_{task.id}_{uuid4().hex[:8]}"
            result = await _execute_tool_via_transport(task.tool, task.arguments, task.user_id if hasattr(task, 'user_id') else "unknown", call_id)
            
            # Processa resultado
            if result.status == "success":
                task.status = TaskStatus.SUCCESS
                # Verifica evidência
                if task.expected_evidence_type:
                    passed, evidence = await Verifier.verify_task(task, result.output)
                    if not passed:
                        task.status = TaskStatus.FAILURE
                        task.error = evidence.summary
            else:
                task.status = TaskStatus.FAILURE
                task.error = result.output
        
        else:
            # CLOUD tool - executa in-process via registry
            try:
                tool_registry = default_registry
                result_output = await tool_registry.execute(
                    task.tool, task.arguments, prefer_remote=False, call_id=f"call_{task.id}", user_id=user_id
                )
                is_err = str(result_output).lower().startswith("erro")
                if is_err:
                    task.status = TaskStatus.FAILURE
                    task.error = result_output
                else:
                    task.status = TaskStatus.SUCCESS
            except Exception as e:
                task.status = TaskStatus.FAILURE
                task.error = str(e)
        
        # Atualiza state_json
        session.state_json = {
            **session.state_json,
            "completed_call_ids": list(completed_call_ids),
            "step": step,
            "paused": session.state_json.get("paused", False),
            "cancel_requested": session.state_json.get("cancel_requested", False),
        }
        
        # Serializa graph e state
        session.graph_json = graph.to_json()
        session.state_json = {**session.state_json, "completed_call_ids": list(completed_call_ids), "step": step}
        session.updated_at = datetime.now(timezone.utc)
        
        # Se task ficou waiting_permission ou completed/failed, sai do loop
        # O loop será retomado via advance_session com tool_results ou permission_resolved
        if any(t.status == TaskStatus.WAITING_PERMISSION for t in graph.nodes.values()):
            break
        
        steps += 1
        if steps >= 5:  # Limit steps per advance
            break
    
    return session


async def start_mission(
    pool,
    user_id: str,
    thread_id: str,
    goal: str,
) -> AgentSession:
    """Cria nova missão, planeja, e executa até primeiro wait."""
    
    # Cria sessão inicial
    session_id = str(uuid4())
    now = datetime.now(timezone.utc)
    
    session = AgentSession(
        id=str(uuid4()),
        user_id=user_id,
        thread_id=thread_id,
        goal=goal,
        status="pending",
        graph_json={},
        state_json={"step": 1, "completed_call_ids": [], "paused": False, "cancel_requested": False},
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        completed_at=None,
    )
    
    # Salva sessão pending
    await save_session(pool, session)
    
    # Cria plano via Planner
    planner = AgentPlanner()
    graph = await planner.create_plan(goal)
    graph_json = graph.to_json()
    
    # Atualiza sessão com plano
    session.graph_json = graph_json
    session.status = "running"
    session.updated_at = datetime.now(timezone.utc)
    
    # Salva e executa primeira iteração
    await save_session(pool, session)
    
    # Executa primeira iteração (pode parar no primeiro DEVICE tool ou permission)
    from core.missions.store import load_session
    updated = await advance_session(
        pool=pool,
        session_id=session.id,
        tool_results=None,
        permission_resolved=None,
    )
    
    return updated


async def advance_session(
    pool,
    session_id: str,
    tool_results: Optional[List] = None,
    permission_resolved: Optional[dict] = None,
) -> AgentSession:
    """Avança uma sessão de missão event-driven.
    
    Args:
        pool: asyncpg pool
        session_id: ID da sessão
        tool_results: Lista de ToolResult de execuções anteriores (DEVICE tools)
        permission_resolved: Dict com {task_id, approved, resolved_by} para reativar task
    
    Returns:
        AgentSession atualizada
    """
    # Carrega sessão
    session = await load_session(pool, session_id)
    if not session:
        raise ValueError(f"Session {session_id} not found")
    
    # Se sessão já finalizada, retorna como está
    if session.status in ("completed", "failed", "cancelled"):
        return session
    
    # Converte tool_results para ToolResult se necessário
    tool_results_typed = None
    if tool_results:
        from core.execution.contracts import ToolResult, ToolCallStatus
        tool_results_typed = []
        for r in tool_results:
            if isinstance(r, dict):
                tool_results_typed.append(ToolResult(
                    call_id=r.get("call_id", ""),
                    status=r.get("status", "success"),
                    output=r.get("output", ""),
                    friendly_name=r.get("friendly_name", ""),
                    duration_ms=r.get("duration_ms", 0),
                    error_type=r.get("error_type"),
                    is_recoverable=r.get("is_recoverable", False),
                    host_id=r.get("host_id"),
                ))
            else:
                tool_results_typed.append(r)
    
    # Executa loop
    updated = await _execution_loop(
        session=session,
        graph=None,  # Será reconstruído do session.graph_json
        user_id=session.user_id,
        tool_results=tool_results_typed,
        permission_resolved=permission_resolved,
    )
    
    # Salva sessão atualizada
    await save_session(pool, updated)
    
    return updated
