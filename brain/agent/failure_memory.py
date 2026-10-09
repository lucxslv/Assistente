"""Memória Estruturada de Falhas e Proteção contra Churn/Loops de Replanejamento."""

from __future__ import annotations
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("charlie.agent.failure_memory")


def _normalize_strategy(strategy: str) -> str:
    """Normaliza semanticamente uma estratégia para evitar que variações cosméticas burlem o loop detector."""
    if not strategy:
        return ""
    # minúsculas
    text = strategy.lower().strip()
    # remove aspas simples e duplas
    text = re.sub(r"['\"]", "", text)
    # colapsa múltiplos espaços em um só
    text = re.sub(r"\s+", " ", text)
    return text


@dataclass
class FailureRecord:
    task_id: str
    tool: str
    error: str
    cause: str
    attempt: int
    strategy: str
    hypothesis: Optional[str] = None
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
            "hypothesis": self.hypothesis,
            "result": self.result,
            "timestamp": self.timestamp,
        }


class FailureMemory:
    """Registra falhas históricas e detecta repetições de estratégia (churn protection)."""

    def __init__(self) -> None:
        self.records: List[FailureRecord] = []
        self._hypothesis_counts: Dict[str, Dict[str, int]] = {}

    def record_failure(
        self,
        task_id: str,
        tool: str,
        error: str,
        cause: str,
        attempt: int,
        strategy: str,
        hypothesis: Optional[str] = None,
        result: Optional[str] = None,
    ) -> FailureRecord:
        record = FailureRecord(
            task_id=task_id,
            tool=tool,
            error=error,
            cause=cause,
            attempt=attempt,
            strategy=strategy,
            hypothesis=hypothesis,
            result=result,
        )
        self.records.append(record)

        if hypothesis:
            hyp_key = hypothesis.strip().lower()
            task_map = self._hypothesis_counts.setdefault(task_id, {})
            task_map[hyp_key] = task_map.get(hyp_key, 0) + 1

        logger.warning(
            f"FailureMemory: Registrada falha em {task_id} (Tentativa {attempt}). Causa: {cause[:80]}"
        )
        return record

    def get_hypothesis_failure_count(self, task_id: str, hypothesis: str) -> int:
        """Retorna o número de falhas registradas para uma hipótese específica nesta tarefa."""
        if not hypothesis:
            return 0
        hyp_key = hypothesis.strip().lower()
        return self._hypothesis_counts.get(task_id, {}).get(hyp_key, 0)

    def is_loop_detected(
        self,
        task_id: str,
        current_strategy: str,
        hypothesis: Optional[str] = None,
    ) -> bool:
        """
        Detecta se o agente está tentando repetidamente a mesma estratégia que já falhou.
        Bloqueia variações cosméticas e repetições de hipóteses que já falharam >= 2 vezes.
        """
        # 1. Checa contagem de falhas por hipótese (limite de 2 tentativas)
        if hypothesis and self.get_hypothesis_failure_count(task_id, hypothesis) >= 2:
            logger.error(
                f"FailureMemory: LOOP DETECTADO na tarefa {task_id}! Hipótese '{hypothesis}' falhou >= 2 vezes."
            )
            return True

        task_failures = [r for r in self.records if r.task_id == task_id]
        if len(task_failures) < 2:
            return False

        # 2. Normalização semântica das estratégias para pegar variações cosméticas
        clean_current = _normalize_strategy(current_strategy)
        normalized_recent = [_normalize_strategy(r.strategy) for r in task_failures[-2:]]

        # Se a estratégia normalizada coincide com as falhas recentes
        if clean_current in normalized_recent:
            logger.error(
                f"FailureMemory: LOOP DETECTADO na tarefa {task_id}! Estratégia semântica idêntica à que já falhou."
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
            hyp_info = f" [Hipótese: {f.hypothesis}]" if f.hypothesis else ""
            lines.append(f"- Tentativa {f.attempt} com ferramenta '{f.tool}'{hyp_info}: {f.error} (Causa: {f.cause})")

        return "\n".join(lines)
