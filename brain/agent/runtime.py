"""Motor Central de Execução (Local Agent Runtime) do Charlie."""

from __future__ import annotations
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, Optional

from brain.agent.task_graph import TaskGraph, TaskNode, TaskStatus
from brain.agent.verifier import Verifier
from brain.agent.failure_memory import FailureMemory
from brain.agent.planner import AgentPlanner
from tools.registry import ToolRegistry

logger = logging.getLogger("charlie.agent.runtime")


class AgentRuntime:
    """Gerencia o ciclo de vida do agente, grafo de execução e eventos."""

    def __init__(self) -> None:
        self.active_graph: Optional[TaskGraph] = None
        self.failure_memory = FailureMemory()
        self.tools = ToolRegistry()
        self.is_paused = False
        self.is_cancelled = False
        self._event_queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue()

    async def emit_event(self, event_type: str, data: Any):
        payload = {
            "type": event_type,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self._event_queue.put(payload)

    async def event_stream(self) -> AsyncGenerator[str, None]:
        """Gera eventos SSE contínuos para a interface do Desktop."""
        import json
        while True:
            ev = await self._event_queue.get()
            yield f"event: {ev['type']}\ndata: {json.dumps(ev['data'])}\n\n"

    async def start_session(self, goal: str, project: str = "Charlie") -> TaskGraph:
        """Inicia um novo objetivo: planeja, constrói o DAG e inicia o loop."""
        self.is_paused = False
        self.is_cancelled = False

        await self.emit_event("agent.started", {"goal": goal, "project": project})

        # 1. Planejamento e Decomposição
        graph = await AgentPlanner.create_plan(goal, project)
        self.active_graph = graph

        await self.emit_event("task.created", graph.to_dict())

        # Dispara execução do loop de tarefas em background
        asyncio.create_task(self._execution_loop())
        return graph

    async def _execution_loop(self):
        """Loop autônomo de execução do grafo até conclusão ou falha."""
        if not self.active_graph:
            return

        logger.info(f"AgentRuntime: Iniciando loop de tarefas para meta: '{self.active_graph.goal}'")

        while not self.is_cancelled:
            if self.is_paused:
                await asyncio.sleep(0.5)
                continue

            ready_tasks = self.active_graph.get_ready_tasks()

            if not ready_tasks:
                if self.active_graph.is_completed():
                    logger.info("AgentRuntime: Todas as tarefas concluídas e verificadas com sucesso!")
                    await self.emit_event("agent.completed", {
                        "goal": self.active_graph.goal,
                        "progress": 100,
                        "summary": "Objetivo concluído com evidências comprovadas.",
                    })
                    break
                elif self.active_graph.has_active_failures():
                    logger.error("AgentRuntime: Grafo estagnado por falhas permanentes.")
                    await self.emit_event("agent.failed", {
                        "goal": self.active_graph.goal,
                        "reason": "Tentativas máximas esgotadas sem sucesso.",
                    })
                    break
                else:
                    # Nenhuma tarefa pronta no momento (pode estar aguardando dependência assíncrona)
                    await asyncio.sleep(0.5)
                    continue

            # Executa a próxima tarefa pronta
            task = ready_tasks[0]
            await self._execute_task(task)

    async def _execute_task(self, task: TaskNode):
        """Executa uma tarefa individual, valida permissão, executa ferramenta e passa pelo Verifier."""
        task.status = TaskStatus.RUNNING
        task.attempts += 1
        task.started_at = datetime.now(timezone.utc).isoformat()

        await self.emit_event("task.started", task.to_dict())

        tool_result = ""
        # 1. Execução de Ferramenta
        if task.tool:
            try:
                await self.emit_event("tool.started", {
                    "taskId": task.id,
                    "tool": task.tool,
                    "arguments": task.arguments,
                })

                tool_result = await self.tools.execute(task.tool, task.arguments)

                await self.emit_event("tool.completed", {
                    "taskId": task.id,
                    "tool": task.tool,
                    "result": tool_result,
                })
            except Exception as e:
                tool_result = f"Erro ao executar {task.tool}: {e}"
                await self.emit_event("tool.failed", {
                    "taskId": task.id,
                    "tool": task.tool,
                    "error": str(e),
                })

        # 2. Verificação de Evidências (Verifier)
        task.status = TaskStatus.VERIFYING
        await self.emit_event("verification.started", {"taskId": task.id})

        passed, evidence = await Verifier.verify_task(task, tool_result)
        task.evidence = evidence

        if passed:
            task.status = TaskStatus.SUCCESS
            task.completed_at = datetime.now(timezone.utc).isoformat()
            await self.emit_event("verification.completed", {
                "taskId": task.id,
                "evidence": evidence.to_dict(),
            })
            await self.emit_event("task.completed", task.to_dict())
        else:
            task.status = TaskStatus.FAILURE
            task.error = evidence.summary
            self.failure_memory.record_failure(
                task_id=task.id,
                tool=task.tool or "none",
                error=evidence.summary,
                cause=evidence.details or "",
                attempt=task.attempts,
                strategy=f"{task.tool}:{task.arguments}",
                result=tool_result,
            )
            await self.emit_event("task.failed", task.to_dict())

    def pause(self):
        self.is_paused = True

    def resume(self):
        self.is_paused = False

    def cancel(self):
        self.is_cancelled = True


# Instância global singleton do Agent Runtime
agent_runtime = AgentRuntime()
