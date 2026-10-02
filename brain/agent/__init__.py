"""
Charlie Agentic Runtime 1.2
Engine de execução agêntica com Task Graph DAG, Verificador Multi-Modal e Memória de Falhas.
"""

from .task_graph import TaskGraph, TaskNode, TaskEvidence, TaskStatus
from .verifier import Verifier, VerificationResult
from .failure_memory import FailureMemory, FailureRecord
from .planner import AgentPlanner
from .runtime import AgentRuntime
from .persistence import AgentPersistence, agent_persistence

__all__ = [
    "TaskGraph",
    "TaskNode",
    "TaskEvidence",
    "TaskStatus",
    "Verifier",
    "VerificationResult",
    "FailureMemory",
    "FailureRecord",
    "AgentPlanner",
    "AgentRuntime",
    "AgentPersistence",
    "agent_persistence",
]
