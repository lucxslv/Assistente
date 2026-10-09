"""Estrutura de Grafo Acíclico Dirigido (DAG) para o Task Graph do Charlie Agent Runtime."""

from __future__ import annotations
import enum
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


class TaskStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILURE = "failure"
    WAITING_PERMISSION = "waiting_permission"
    VERIFYING = "verifying"
    SKIPPED = "skipped"


@dataclass
class TaskEvidence:
    type: str  # "code" | "file" | "system" | "visual"
    summary: str
    details: Optional[str] = None
    passed: bool = True
    verified_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type,
            "summary": self.summary,
            "details": self.details,
            "passed": self.passed,
            "verifiedAt": self.verified_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> TaskEvidence:
        return cls(
            type=data.get("type", "system"),
            summary=data.get("summary", ""),
            details=data.get("details"),
            passed=data.get("passed", True),
            verified_at=data.get("verifiedAt", datetime.now(timezone.utc).isoformat()),
        )


@dataclass
class TaskNode:
    id: str
    title: str
    description: str = ""
    dependencies: List[str] = field(default_factory=list)
    tool: Optional[str] = None
    arguments: Dict[str, Any] = field(default_factory=dict)
    status: TaskStatus = TaskStatus.PENDING
    attempts: int = 0
    max_attempts: int = 3
    result: Optional[str] = None
    evidence: Optional[TaskEvidence] = None
    error: Optional[str] = None
    expected_evidence_type: str = "system"
    expected_evidence_criteria: Dict[str, Any] = field(default_factory=dict)
    thought: Optional[str] = None
    observation: Optional[str] = None
    reflection: Optional[str] = None
    agent_role: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None

    def can_run(self, completed_task_ids: set[str]) -> bool:
        """Uma tarefa só pode executar se todas as suas dependências tiverem concluído com sucesso."""
        if self.status != TaskStatus.PENDING:
            return False
        return all(dep in completed_task_ids for dep in self.dependencies)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "dependencies": self.dependencies,
            "tool": self.tool,
            "arguments": self.arguments,
            "status": self.status.value,
            "attempts": self.attempts,
            "maxAttempts": self.max_attempts,
            "result": self.result,
            "evidence": self.evidence.to_dict() if self.evidence else None,
            "error": self.error,
            "thought": self.thought,
            "observation": self.observation,
            "reflection": self.reflection,
            "agentRole": self.agent_role,
            "startedAt": self.started_at,
            "completedAt": self.completed_at,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> TaskNode:
        ev_data = data.get("evidence")
        ev = TaskEvidence.from_dict(ev_data) if ev_data else None
        return cls(
            id=data["id"],
            title=data.get("title", ""),
            description=data.get("description", ""),
            dependencies=data.get("dependencies", []),
            tool=data.get("tool"),
            arguments=data.get("arguments", {}),
            status=TaskStatus(data.get("status", "pending")),
            attempts=data.get("attempts", 0),
            max_attempts=data.get("maxAttempts", 3),
            result=data.get("result"),
            evidence=ev,
            error=data.get("error"),
            thought=data.get("thought"),
            observation=data.get("observation"),
            reflection=data.get("reflection"),
            agent_role=data.get("agentRole"),
            started_at=data.get("startedAt"),
            completed_at=data.get("completedAt"),
        )


class TaskGraph:
    """Grafo de Tarefas orientado a dependências (DAG) com ciclo de verificação e ReAct."""

    def __init__(self, goal: str, project: str = "Charlie") -> None:
        self.goal = goal
        self.project = project
        self.nodes: Dict[str, TaskNode] = {}
        self.parsed_goal: Optional[Dict[str, Any]] = None
        self.working_memory_state: Optional[Dict[str, Any]] = None

    def add_task(self, task: TaskNode) -> None:
        self.nodes[task.id] = task

    def add_node(self, task: TaskNode) -> None:
        """Alias para add_task."""
        self.add_task(task)

    def get_task(self, task_id: str) -> Optional[TaskNode]:
        return self.nodes.get(task_id)

    def get_ready_tasks(self) -> List[TaskNode]:
        """Retorna tarefas que estão prontas para execução imediata."""
        completed = {
            t_id
            for t_id, task in self.nodes.items()
            if task.status in (TaskStatus.SUCCESS, TaskStatus.SKIPPED)
        }
        return [task for task in self.nodes.values() if task.can_run(completed)]

    def is_completed(self) -> bool:
        """Verifica se todo o grafo foi concluído."""
        if not self.nodes:
            return False
        return all(t.status in (TaskStatus.SUCCESS, TaskStatus.SKIPPED) for t in self.nodes.values())

    def has_active_failures(self) -> bool:
        """Verifica se alguma tarefa falhou em definitivo (esgotou tentativas máximas)."""
        return any(
            t.status == TaskStatus.FAILURE and t.attempts >= t.max_attempts
            for t in self.nodes.values()
        )

    def validate_acyclic(self) -> tuple[bool, Optional[str]]:
        """
        Verifica se o grafo é um DAG válido sem ciclos ou dependências circulares.
        Retorna (is_valid, error_message).
        """
        if not self.nodes:
            return True, None

        all_ids = set(self.nodes.keys())
        for task_id, task in self.nodes.items():
            for dep in task.dependencies:
                if dep not in all_ids:
                    return False, f"Tarefa '{task_id}' depende de '{dep}', que não existe no grafo."
                if dep == task_id:
                    return False, f"Tarefa '{task_id}' tem auto-dependência circular."

        in_degree = {t_id: 0 for t_id in self.nodes}
        adj = {t_id: [] for t_id in self.nodes}

        for task_id, task in self.nodes.items():
            for dep in task.dependencies:
                adj[dep].append(task_id)
                in_degree[task_id] += 1

        queue = [t_id for t_id, deg in in_degree.items() if deg == 0]
        visited_count = 0

        while queue:
            curr = queue.pop(0)
            visited_count += 1
            for neighbor in adj[curr]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        if visited_count != len(self.nodes):
            cycle_tasks = [t_id for t_id, deg in in_degree.items() if deg > 0]
            return False, f"Ciclo detectado no grafo envolvendo tarefas: {cycle_tasks}."

        return True, None

    def reset_task_for_retry(
        self,
        task_id: str,
        new_tool: Optional[str] = None,
        new_arguments: Optional[Dict[str, Any]] = None,
        reason: Optional[str] = None,
    ) -> Optional[TaskNode]:
        """Reabre uma tarefa para nova tentativa após auto-correção (Self-Reflection)."""
        task = self.nodes.get(task_id)
        if not task:
            return None

        if new_tool:
            task.tool = new_tool
        if new_arguments is not None:
            task.arguments = new_arguments

        task.status = TaskStatus.PENDING
        task.reflection = reason or "Tarefa reaberta com estratégia corrigida."
        task.error = None
        return task

    def insert_subtasks_before(self, target_task_id: str, new_subtasks: List[TaskNode]) -> bool:
        """
        Insere novas subtarefas imediatamente antes de uma tarefa alvo,
        reconectando as arestas de dependência no grafo (Dynamic Subtask Spawning).
        """
        target = self.nodes.get(target_task_id)
        if not target or not new_subtasks:
            return False

        original_deps = list(target.dependencies)
        prev_subtask_id = None
        for i, subtask in enumerate(new_subtasks):
            if i == 0:
                subtask.dependencies = original_deps
            else:
                subtask.dependencies = [prev_subtask_id] if prev_subtask_id else []
            self.add_task(subtask)
            prev_subtask_id = subtask.id

        if prev_subtask_id:
            target.dependencies = [prev_subtask_id]
            target.status = TaskStatus.PENDING

        return True

    def spawn_followup_subtasks(self, parent_task_id: str, new_tasks: List[TaskNode]) -> bool:
        """Adiciona novas tarefas a jusante (downstream) dependentes de uma tarefa pai."""
        parent = self.nodes.get(parent_task_id)
        if not parent or not new_tasks:
            return False

        for task in new_tasks:
            if parent_task_id not in task.dependencies:
                task.dependencies.append(parent_task_id)
            self.add_task(task)

        return True

    def prune_redundant_tasks(self, completed_context: Dict[str, Any]) -> List[str]:
        """Remove ou marca como SKIPPED tarefas que se tornaram redundantes ou desnecessárias."""
        pruned_ids = []
        for task in list(self.nodes.values()):
            if task.status == TaskStatus.PENDING:
                if completed_context.get(f"skip_{task.id}") or completed_context.get(f"solved_{task.tool}"):
                    task.status = TaskStatus.SKIPPED
                    task.reflection = "Tarefa pulada: objetivo já alcançado por etapas precedentes."
                    pruned_ids.append(task.id)

        return pruned_ids

    def progress_percentage(self) -> int:
        if not self.nodes:
            return 0
        completed = sum(1 for t in self.nodes.values() if t.status == TaskStatus.SUCCESS)
        return int((completed / len(self.nodes)) * 100)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "goal": self.goal,
            "project": self.project,
            "progress": self.progress_percentage(),
            "parsedGoal": self.parsed_goal,
            "workingMemory": self.working_memory_state,
            "tasks": [task.to_dict() for task in self.nodes.values()],
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> TaskGraph:
        graph = cls(goal=data.get("goal", ""), project=data.get("project", "Charlie"))
        graph.parsed_goal = data.get("parsedGoal")
        graph.working_memory_state = data.get("workingMemory")
        for t_dict in data.get("tasks", []):
            graph.add_task(TaskNode.from_dict(t_dict))
        return graph
