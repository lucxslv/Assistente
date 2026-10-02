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
            started_at=data.get("startedAt"),
            completed_at=data.get("completedAt"),
        )


class TaskGraph:
    """Grafo de Tarefas orientado a dependências (DAG) com ciclo de verificação."""

    def __init__(self, goal: str, project: str = "Charlie") -> None:
        self.goal = goal
        self.project = project
        self.nodes: Dict[str, TaskNode] = {}

    def add_task(self, task: TaskNode) -> None:
        self.nodes[task.id] = task

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
        """Verifica se alguma tarefa falhou em definitivo (esgotou tentativas)."""
        return any(
            t.status == TaskStatus.FAILURE and t.attempts >= t.max_attempts
            for t in self.nodes.values()
        )

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
            "tasks": [task.to_dict() for task in self.nodes.values()],
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> TaskGraph:
        graph = cls(goal=data.get("goal", ""), project=data.get("project", "Charlie"))
        for t_dict in data.get("tasks", []):
            graph.add_task(TaskNode.from_dict(t_dict))
        return graph
