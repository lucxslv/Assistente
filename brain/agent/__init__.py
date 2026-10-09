"""
Charlie Agentic Runtime 2.0
Engine de execução agêntica com Task Graph DAG, Verificador Multi-Modal,
Memória de Trabalho ReAct, Auto-Correção Reflexiva e Sistema Multi-Agente (MAS).
"""

from .task_graph import TaskGraph, TaskNode, TaskEvidence, TaskStatus
from .verifier import Verifier, VerificationResult
from .failure_memory import FailureMemory, FailureRecord
from .planner import AgentPlanner
from .runtime import AgentRuntime, agent_runtime
from .persistence import AgentPersistence, agent_persistence
from .working_memory import AgentWorkingMemory, ReActTraceStep
from .reflector import ReflectorAgent, CorrectionPlan
from .multi_agent import (
    MultiAgentCoordinator,
    AgentRole,
    SubagentState,
    SynthesizerAgent,
)

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
    "agent_runtime",
    "AgentPersistence",
    "agent_persistence",
    "AgentWorkingMemory",
    "ReActTraceStep",
    "ReflectorAgent",
    "CorrectionPlan",
    "MultiAgentCoordinator",
    "AgentRole",
    "SubagentState",
    "SynthesizerAgent",
]
