"""Memória Estruturada de Falhas e Proteção contra Churn/Loops de Replanejamento."""

from __future__ import annotations
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("charlie.agent.failure_memory")


@dataclass
class FailureRecord:
    task_id: str
    tool: str
    error: str
    cause: str
    attempt: int
    strategy: str
    result: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return {
            "taskId": self.task_id,
            "tool": self.tool,
            "error": self.error,
            "cause": self.cause,
            "attempt": self.attempt,
            "strategy": self.strategy,
            "result": self.result,
            "timestamp": self.timestamp,
        }


class FailureMemory:
    """Registra falhas históricas e detecta repetições de estratégia (churn protection)."""

    def __init__(self) -> None:
        self.records: List[FailureRecord] = []

    def record_failure(
        self,
        task_id: str,
        tool: str,
        error: str,
        cause: str,
        attempt: int,
        strategy: str,
        result: Optional[str] = None,
    ) -> FailureRecord:
        record = FailureRecord(
            task_id=task_id,
            tool=tool,
            error=error,
            cause=cause,
            attempt=attempt,
            strategy=strategy,
            result=result,
        )
        self.records.append(record)
        logger.warning(
            f"FailureMemory: Registrada falha em {task_id} (Tentativa {attempt}). Causa: {cause[:80]}"
        )
        return record

    def is_loop_detected(self, task_id: str, current_strategy: str) -> bool:
        """
        Detecta se o agente está tentando repetidamente a mesma estratégia que já falhou.
        Evita churn e loops de tentativas cegas.
        """
        task_failures = [r for r in self.records if r.task_id == task_id]
        if len(task_failures) < 2:
            return False

        # Verifica se as duas últimas estratégias foram textualmente idênticas ou muito próximas
        recent_strategies = [r.strategy.strip().lower() for r in task_failures[-2:]]
        clean_current = current_strategy.strip().lower()

        if clean_current in recent_strategies:
            logger.error(
                f"FailureMemory: LOOP DETECTADO na tarefa {task_id}! Estratégia idêntica à que já falhou."
            )
            return True

        return False

    def get_summary_for_replanner(self, task_id: str) -> str:
        """Gera um resumo claro dos erros e estratégias falhas para guiar o Replanejador a buscar novos caminhos."""
        failures = [r for r in self.records if r.task_id == task_id]
        if not failures:
            return "Nenhuma falha prévia registrada para esta tarefa."

        lines = ["Histórico de tentativas que falharam (NÃO REPETIR ESTAS ESTRATÉGIAS):"]
        for f in failures:
            lines.append(f"- Tentativa {f.attempt} com ferramenta '{f.tool}': {f.error} (Causa: {f.cause})")

        return "\n".join(lines)
