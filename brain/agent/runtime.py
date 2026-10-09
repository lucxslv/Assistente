"""
Motor Central de Execução (Local Agent Runtime) do Charlie.
Executa o ciclo operacional em 6 etapas:
1. Percepção e Parsing da Meta
2. Avaliação de Estado (Working Memory + Long-Term Memory)
3. Seleção de Ação e Formulação de Pensamento (ReAct Thought & Resolução de Variáveis)
4. Execução de Ferramenta e Coleta de Evidências (Observation)
5. Avaliação Crítica (CriticVerifier) e Auto-Correção Reflexiva (Reflector / Self-Healing)
6. Finalização e Síntese Executiva (SynthesizerAgent)
"""

from __future__ import annotations
import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, Optional

from brain.agent.task_graph import TaskGraph, TaskNode, TaskStatus
from brain.agent.verifier import Verifier
from brain.agent.failure_memory import FailureMemory
from brain.agent.planner import AgentPlanner
from brain.agent.working_memory import AgentWorkingMemory
from brain.agent.reflector import ReflectorAgent, CorrectionPlan
from brain.agent.governance import permission_gate, RiskLevel
from brain.agent.multi_agent import (
    MultiAgentCoordinator,
    AgentRole,
    SynthesizerAgent,
)
from tools.registry import ToolRegistry

logger = logging.getLogger("charlie.agent.runtime")


class AgentRuntime:
    """Gerencia o ciclo de vida do agente, grafo de execução, memória de trabalho e coordenação multi-agente."""

    def __init__(self) -> None:
        self.active_graph: Optional[TaskGraph] = None
        self.failure_memory = FailureMemory()
        self.working_memory = AgentWorkingMemory()
        self.multi_agent_coordinator: Optional[MultiAgentCoordinator] = None
        self.tools = ToolRegistry()
        self.is_paused = False
        self.is_cancelled = False
        self._event_queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue()
        self._listeners: set[asyncio.Queue] = set()

    def register_listener(self, queue: asyncio.Queue):
        """Registra uma fila de escuta SSE/WebSocket para receber todos os eventos do agente em tempo real."""
        self._listeners.add(queue)

    def unregister_listener(self, queue: asyncio.Queue):
        """Desregistra uma fila de escuta."""
        self._listeners.discard(queue)

    async def emit_event(self, event_type: str, data: Any):
        payload = {
            "type": event_type,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self._event_queue.put(payload)
        for listener in list(self._listeners):
            try:
                listener.put_nowait(payload)
            except Exception:
                pass

    async def event_stream(self) -> AsyncGenerator[str, None]:
        """Gera eventos SSE contínuos para a interface do Desktop."""
        while True:
            ev = await self._event_queue.get()
            yield f"event: {ev['type']}\ndata: {json.dumps(ev['data'])}\n\n"

    async def start_session(self, goal: str, project: str = "Charlie") -> TaskGraph:
        """Inicia um novo objetivo: parsing, instanciação do MAS, planejamento DAG e loop autônomo."""
        self.is_paused = False
        self.is_cancelled = False
        session_id = f"session_{uuid.uuid4().hex[:8]}"

        # Inicializa memórias e coordenador multi-agente
        self.working_memory = AgentWorkingMemory(initial_variables={
            "session_id": session_id,
            "project": project,
            "target_os": "Windows",
            "working_directory": "C:\\",
        })
        self.multi_agent_coordinator = MultiAgentCoordinator(session_id=session_id)

        await self.emit_event("agent.started", {
            "sessionId": session_id,
            "goal": goal,
            "project": project,
            "subagents": self.multi_agent_coordinator.get_all_subagents_dict(),
        })

        # Etapa 1: Parsing e Planejamento Multi-Agente
        self.multi_agent_coordinator.activate_role(AgentRole.PLANNER, current_task="Decomposição analítica da meta")
        graph = await AgentPlanner.create_plan(goal, project)
        graph.id = session_id
        self.active_graph = graph

        self.multi_agent_coordinator.complete_role(
            AgentRole.PLANNER,
            result=f"Meta decomposta em {len(graph.nodes)} tarefas com evidências planejadas.",
        )

        await self.emit_event("agent.perception_parsed", {
            "sessionId": session_id,
            "parsedGoal": graph.parsed_goal,
        })
        await self.emit_event("task.created", graph.to_dict())
        await self.emit_event("agent.subagents_updated", {
            "subagents": self.multi_agent_coordinator.get_all_subagents_dict(),
        })

        # Dispara execução do loop de tarefas em background
        asyncio.create_task(self._execution_loop())
        return graph

    async def _execution_loop(self):
        """Loop autônomo de execução do grafo até conclusão com evidências ou falha permanente."""
        if not self.active_graph:
            return

        # Validação estrita de aciclicidade do Grafo (DAG)
        is_valid, dag_err = self.active_graph.validate_acyclic()
        if not is_valid:
            logger.error(f"AgentRuntime: Grafo inválido rejeitado ({dag_err})")
            await self.emit_event("agent.failed", {
                "sessionId": self.active_graph.id,
                "goal": self.active_graph.goal,
                "reason": f"Grafo rejeitado por inconsistência estrutural: {dag_err}",
                "subagents": self.multi_agent_coordinator.get_all_subagents_dict() if self.multi_agent_coordinator else [],
            })
            return

        logger.info(f"AgentRuntime: Loop iniciado para meta: '{self.active_graph.goal}'")

        while not self.is_cancelled:
            if self.is_paused:
                await asyncio.sleep(0.5)
                continue

            ready_tasks = self.active_graph.get_ready_tasks()

            if not ready_tasks:
                if self.active_graph.is_completed():
                    logger.info("AgentRuntime: Todas as tarefas concluídas e verificadas com sucesso!")

                    # Etapa 6: Finalização e Síntese Executiva Multi-Agente
                    if self.multi_agent_coordinator:
                        self.multi_agent_coordinator.activate_role(AgentRole.SYNTHESIZER, current_task="Consolidação de evidências")

                    summary = await SynthesizerAgent.synthesize(
                        goal=self.active_graph.goal,
                        tasks=list(self.active_graph.nodes.values()),
                        working_memory=self.working_memory,
                        failure_memory=self.failure_memory,
                    )

                    if self.multi_agent_coordinator:
                        self.multi_agent_coordinator.complete_role(AgentRole.SYNTHESIZER, result=summary)

                    await self.emit_event("agent.completed", {
                        "sessionId": self.active_graph.id,
                        "goal": self.active_graph.goal,
                        "progress": 100,
                        "summary": summary,
                        "subagents": self.multi_agent_coordinator.get_all_subagents_dict() if self.multi_agent_coordinator else [],
                        "workingMemory": self.working_memory.to_dict(),
                    })
                    break
                elif self.active_graph.has_active_failures():
                    logger.error("AgentRuntime: Grafo estagnado por falhas permanentes.")
                    await self.emit_event("agent.failed", {
                        "sessionId": self.active_graph.id,
                        "goal": self.active_graph.goal,
                        "reason": "Tentativas máximas esgotadas sem sucesso após auto-correções.",
                        "subagents": self.multi_agent_coordinator.get_all_subagents_dict() if self.multi_agent_coordinator else [],
                    })
                    break
                else:
                    # Aguarda resolução assíncrona
                    await asyncio.sleep(0.5)
                    continue

            # Executa tarefas concorrentes prontas que não possuam dependências entre si
            pending_ready = [t for t in ready_tasks if t.status == TaskStatus.PENDING]
            if not pending_ready:
                await asyncio.sleep(0.3)
                continue

            # Executa até max_parallel tarefas simultaneamente
            max_parallel = 3
            tasks_to_run = pending_ready[:max_parallel]

            # Marca como RUNNING antes do gather para evitar seleção repetida
            for t in tasks_to_run:
                t.status = TaskStatus.RUNNING

            await asyncio.gather(*(self._execute_task(t) for t in tasks_to_run), return_exceptions=True)

    async def _execute_task(self, task: TaskNode):
        """
        Executa uma tarefa individual aplicando o ciclo operacional:
        Etapa 2: Avaliação de Estado
        Etapa 3: Formulação de Pensamento ReAct e Resolução de Variáveis
        Etapa 4: Governança (HITL), Execução de Ferramenta e Coleta de Evidências (Observation)
        Etapa 5: Avaliação Crítica (CriticVerifier) e Auto-Correção (Reflector)
        """
        task.attempts += 1
        task.started_at = datetime.now(timezone.utc).isoformat()

        # Etapa 2: Avaliação de Estado (Working Memory + Failure Memory)
        recent_context = self.working_memory.get_recent_context_summary(max_steps=2)
        failures_summary = self.failure_memory.get_summary_for_replanner(task.id)

        # Etapa 3: Formulação de Pensamento (ReAct Thought)
        if not task.thought:
            task.thought = f"Executar {task.tool or 'ação'} para atingir '{task.title}', garantindo critérios objetivos de validação."
        if task.attempts > 1:
            task.thought = f"[Retentativa {task.attempts}] Aplicando ajustes de rota para corrigir erro prévio na tarefa '{task.title}'."

        await self.emit_event("thought.generated", {
            "taskId": task.id,
            "role": task.agent_role or "Coding Agent",
            "thought": task.thought,
            "attempts": task.attempts,
        })
        await self.emit_event("task.started", task.to_dict())

        # Resolução Dinâmica de Parâmetros com variáveis da Working Memory
        resolved_args = self.working_memory.resolve_arguments(task.arguments)

        # Etapa 4: Governança Human-in-the-Loop (HITL) e Execução de Ferramenta
        if self.multi_agent_coordinator:
            self.multi_agent_coordinator.activate_role(AgentRole.EXECUTOR, current_task=task.title)

        # Validação de Fronteira de Papéis Multi-Agente (Role Boundary Enforcement)
        if task.agent_role in ("Researcher", AgentRole.RESEARCHER.value, "researcher"):
            restricted_tools = {
                "execute_command", "execute_system_command", "start_background_process",
                "kill_background_process", "system_power_action_native", "write_file", "create_folder"
            }
            if task.tool in restricted_tools:
                err_msg = f"Segurança MAS: O papel '{task.agent_role}' é estritamente restrito a leitura/pesquisa e não pode executar '{task.tool}'."
                logger.warning(err_msg)
                task.status = TaskStatus.FAILURE
                task.error = err_msg
                await self.emit_event("task.failed", task.to_dict())
                return

        tool_result = ""
        if task.tool:
            # Avaliação de Risco e Permissão
            risk = permission_gate.assess_risk(task.tool, resolved_args)
            if permission_gate.needs_approval(risk):
                task.status = TaskStatus.WAITING_PERMISSION
                perm_id = f"perm_{uuid.uuid4().hex[:8]}"

                await self.emit_event("agent.permission_requested", {
                    "permissionId": perm_id,
                    "taskId": task.id,
                    "tool": task.tool,
                    "arguments": resolved_args,
                    "riskLevel": risk.value,
                    "description": f"A tarefa '{task.title}' requer permissão para executar ação de risco {risk.value.upper()}.",
                })

                approved, perm_reason = await permission_gate.request_permission(
                    task_id=task.id,
                    tool=task.tool,
                    arguments=resolved_args,
                    description=f"Ação {task.tool} com risco {risk.value.upper()}",
                    timeout_seconds=300.0,
                    permission_id=perm_id,
                    user_id=self.working_memory.get_variable("user_id"),
                )

                if not approved:
                    logger.warning(f"AgentRuntime: Permissão negada pelo usuário para {task.tool} na tarefa {task.id}: {perm_reason}")
                    tool_result = f"Execução negada pelo usuário: {perm_reason}"
                    task.observation = tool_result
                    task.status = TaskStatus.FAILURE
                    task.error = tool_result

                    await self.emit_event("agent.permission_rejected", {
                        "taskId": task.id,
                        "tool": task.tool,
                        "reason": perm_reason,
                    })

                    # Auto-correção para contornar a restrição de permissão
                    correction_plan = await ReflectorAgent.reflect_and_correct(
                        task=task,
                        raw_error=tool_result,
                        failure_memory=self.failure_memory,
                        working_memory=self.working_memory,
                    )
                    if correction_plan.can_retry and self.active_graph:
                        task.thought = f"[Auto-Correção] {correction_plan.hypothesis}"
                        if correction_plan.new_tool:
                            task.tool = correction_plan.new_tool
                        if correction_plan.new_arguments:
                            task.arguments = correction_plan.new_arguments
                        self.active_graph.reset_task_for_retry(task.id)
                        await self.emit_event("task.recovered", {
                            "taskId": task.id,
                            "newTool": task.tool,
                            "reason": "Rota ajustada após bloqueio de permissão.",
                        })
                    else:
                        await self.emit_event("task.failed", task.to_dict())
                    return
                else:
                    task.status = TaskStatus.RUNNING
                    await self.emit_event("agent.permission_granted", {
                        "taskId": task.id,
                        "tool": task.tool,
                    })

            try:
                await self.emit_event("tool.started", {
                    "taskId": task.id,
                    "tool": task.tool,
                    "arguments": resolved_args,
                })

                tool_result = await self.tools.execute(task.tool, resolved_args)

                if self.multi_agent_coordinator:
                    self.multi_agent_coordinator.record_tool_used(AgentRole.EXECUTOR, task.tool)

                await self.emit_event("tool.completed", {
                    "taskId": task.id,
                    "tool": task.tool,
                    "result": tool_result,
                })
            except Exception as e:
                tool_result = f"Erro ao executar {task.tool}: {e}"
                if self.multi_agent_coordinator:
                    self.multi_agent_coordinator.record_error(AgentRole.EXECUTOR, str(e))
                await self.emit_event("tool.failed", {
                    "taskId": task.id,
                    "tool": task.tool,
                    "error": str(e),
                })

        # Armazena observação bruta e extrai variáveis para a Memória de Trabalho
        task.observation = str(tool_result)
        self.working_memory.extract_and_store_variables(task.id, task.tool or "none", resolved_args, task.observation)

        await self.emit_event("observation.captured", {
            "taskId": task.id,
            "observation": task.observation[:500],
        })

        # Etapa 5: Avaliação Crítica (CriticVerifierAgent)
        task.status = TaskStatus.VERIFYING
        if self.multi_agent_coordinator:
            self.multi_agent_coordinator.activate_role(AgentRole.CRITIC_VERIFIER, current_task=f"Auditar {task.title}")

        await self.emit_event("verification.started", {"taskId": task.id})

        passed, evidence = await Verifier.verify_task(task, tool_result)
        task.evidence = evidence

        if passed:
            # Conclusão com sucesso e registro no trace ReAct
            task.status = TaskStatus.SUCCESS
            task.completed_at = datetime.now(timezone.utc).isoformat()
            task.reflection = "Evidências validadas e em total conformidade com os critérios de sucesso."

            # Se a tarefa foi corrigida após falha prévia, registra a lição aprendida na Memória Procedural
            if task.attempts > 1:
                try:
                    from brain.agent.experience_memory import experience_memory
                    recent_failure = self.failure_memory.get_recent_failures(task.id)
                    err_cause = recent_failure[0].error if recent_failure else "Erro em tentativa inicial"
                    experience_memory.record_lesson(
                        intent_pattern=task.title,
                        root_cause_error=err_cause,
                        successful_correction=f"Ferramenta '{task.tool}' com argumentos validados com sucesso.",
                        tags=[task.tool or "system", "windows", "self_healed"],
                    )
                except Exception as ex_err:
                    logger.debug(f"Aviso ao registrar lição aprendida: {ex_err}")

            self.working_memory.record_trace(
                task_id=task.id,
                thought=task.thought,
                action=f"Execução bem-sucedida de {task.tool}",
                tool=task.tool,
                arguments=resolved_args,
                observation=task.observation,
                reflection=task.reflection,
            )

            if self.multi_agent_coordinator:
                self.multi_agent_coordinator.complete_role(
                    AgentRole.CRITIC_VERIFIER,
                    result=f"Tarefa '{task.title}' verificada com evidência: {evidence.summary}",
                )

            await self.emit_event("verification.completed", {
                "taskId": task.id,
                "evidence": evidence.to_dict(),
            })
            await self.emit_event("task.completed", task.to_dict())
        else:
            # Falha de verificação -> Acionamento do ReflectorAgent (Auto-Correção / Self-Healing)
            logger.warning(f"AgentRuntime: Verificação falhou na tarefa {task.id}. Ativando ReflectorAgent.")
            self.failure_memory.record_failure(
                task_id=task.id,
                tool=task.tool or "none",
                error=evidence.summary,
                cause=evidence.details or "",
                attempt=task.attempts,
                strategy=f"{task.tool}:{json.dumps(resolved_args)}",
                result=tool_result,
            )

            if self.multi_agent_coordinator:
                self.multi_agent_coordinator.activate_role(AgentRole.REFLECTOR, current_task=f"Auto-correção em {task.title}")

            correction_plan: CorrectionPlan = await ReflectorAgent.reflect_and_correct(
                task=task,
                raw_error=tool_result or evidence.summary,
                failure_memory=self.failure_memory,
                working_memory=self.working_memory,
            )

            task.reflection = f"Diagnóstico: {correction_plan.diagnosis}. Ajuste: {correction_plan.explanation}"

            await self.emit_event("reflection.diagnosed", {
                "taskId": task.id,
                "plan": correction_plan.to_dict(),
            })

            # Se for possível auto-corrigir e retentar sem travar o sistema
            if correction_plan.can_retry and self.active_graph:
                logger.info(f"AgentRuntime: Aplicando auto-correção na tarefa {task.id}. Ação: {correction_plan.action}")
                task.thought = f"[Auto-Correção] {correction_plan.hypothesis}"
                if correction_plan.action == "switch_tool" and correction_plan.new_tool:
                    task.tool = correction_plan.new_tool
                    if correction_plan.new_arguments:
                        task.arguments = correction_plan.new_arguments
                elif correction_plan.new_arguments:
                    task.arguments = correction_plan.new_arguments

                # Reseta tarefa para que volte ao estado PENDING e seja executada na nova estratégia
                self.active_graph.reset_task_for_retry(task.id)

                self.working_memory.record_trace(
                    task_id=task.id,
                    thought=task.thought,
                    action=f"Auto-correção prescrita ({correction_plan.action})",
                    tool=task.tool,
                    arguments=task.arguments,
                    observation=task.observation,
                    reflection=task.reflection,
                )

                await self.emit_event("task.recovered", {
                    "taskId": task.id,
                    "attempts": task.attempts,
                    "newTool": task.tool,
                    "newArguments": task.arguments,
                    "reason": correction_plan.explanation,
                })
            else:
                # Falha definitiva
                task.status = TaskStatus.FAILURE
                task.error = correction_plan.diagnosis or evidence.summary
                if self.multi_agent_coordinator:
                    self.multi_agent_coordinator.record_error(AgentRole.REFLECTOR, task.error)
                await self.emit_event("task.failed", task.to_dict())

    def pause(self):
        self.is_paused = True

    def resume(self):
        self.is_paused = False

    def cancel(self):
        self.is_cancelled = True
        if self.active_graph:
            for t in self.active_graph.nodes.values():
                if t.status in (TaskStatus.PENDING, TaskStatus.RUNNING, TaskStatus.WAITING_PERMISSION):
                    t.status = TaskStatus.SKIPPED
                    t.error = "Operação cancelada pelo usuário."
        permission_gate.clear()
        try:
            asyncio.create_task(self.emit_event("agent.cancelled", {
                "sessionId": self.active_graph.id if self.active_graph else None,
                "reason": "Sessão cancelada explicitamente pelo usuário.",
            }))
        except Exception:
            pass


# Instância global singleton do Agent Runtime
agent_runtime = AgentRuntime()
