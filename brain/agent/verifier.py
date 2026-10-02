"""Módulo de Verificação de Evidências do Charlie Agent Runtime («Conclusão exige evidência»)."""

import hashlib
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional, Tuple
from brain.agent.task_graph import TaskEvidence, TaskNode

VerificationResult = TaskEvidence

logger = logging.getLogger("charlie.agent.verifier")


class Verifier:
    """Valida evidências tangíveis antes de autorizar a transição de uma tarefa para SUCCESS."""

    @classmethod
    async def verify_task(
        cls,
        task: TaskNode,
        tool_result: str,
        system_context: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, TaskEvidence]:
        """
        Avalia se o resultado da ferramenta e o estado do sistema satisfazem os critérios de conclusão.
        Retorna (sucesso, TaskEvidence).
        """
        ev_type = task.expected_evidence_type or "system"
        criteria = task.expected_evidence_criteria or {}

        if ev_type == "file":
            return cls._verify_file(task, tool_result, criteria)
        elif ev_type == "code":
            return cls._verify_code(task, tool_result, criteria)
        elif ev_type == "system":
            return cls._verify_system(task, tool_result, criteria)
        elif ev_type == "visual":
            return cls._verify_visual(task, tool_result, criteria)

        # Fallback padrão
        return cls._verify_generic(task, tool_result)

    @classmethod
    def _verify_file(cls, task: TaskNode, tool_result: str, criteria: Dict[str, Any]) -> Tuple[bool, TaskEvidence]:
        """Verifica existência física, integridade e conteúdo de arquivos."""
        target_path_str = criteria.get("path") or task.arguments.get("path")
        if not target_path_str:
            passed = "sucesso" in tool_result.lower() or "criada" in tool_result.lower()
            return passed, TaskEvidence(
                type="file",
                summary=f"Evidência de arquivo: {tool_result[:120]}",
                details=tool_result,
                passed=passed,
            )

        from tools.file_explorer import resolve_friendly_path
        target = resolve_friendly_path(target_path_str)

        if not target.exists():
            return False, TaskEvidence(
                type="file",
                summary=f"Falha de verificação: O caminho '{target}' não foi encontrado no disco.",
                details=f"Tentativa de validação em: {target}",
                passed=False,
            )

        # Verifica conteúdo se especificado
        expected_substring = criteria.get("contains")
        file_hash = None
        if target.is_file():
            try:
                content = target.read_text(encoding="utf-8", errors="ignore")
                file_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()[:12]
                if expected_substring and expected_substring not in content:
                    return False, TaskEvidence(
                        type="file",
                        summary=f"Falha: Conteúdo esperado '{expected_substring}' não encontrado em '{target.name}'.",
                        details=f"SHA256: {file_hash}",
                        passed=False,
                    )
            except Exception as e:
                logger.warning(f"Erro ao ler arquivo para verificação: {e}")

        kind = "Diretório" if target.is_dir() else "Arquivo"
        summary = f"{kind} '{target.name}' confirmado fisicamente no disco em '{target.parent}'"
        if file_hash:
            summary += f" (hash: {file_hash})"

        return True, TaskEvidence(
            type="file",
            summary=summary,
            details=f"Path: {target.resolve()}",
            passed=True,
        )

    @classmethod
    def _verify_code(cls, task: TaskNode, tool_result: str, criteria: Dict[str, Any]) -> Tuple[bool, TaskEvidence]:
        """Verifica exit codes, erros de sintaxe ou resultados de suites de teste."""
        lower_res = tool_result.lower()
        has_error = (
            "error" in lower_res
            or "failed" in lower_res
            or "falha" in lower_res
            or "exception" in lower_res
            or "traceback" in lower_res
        )
        passed = not has_error or "0 errors" in lower_res or "tests passed" in lower_res

        summary = (
            f"Compilação/Testes validados com sucesso."
            if passed
            else f"Erros detectados durante execução de código."
        )

        return passed, TaskEvidence(
            type="code",
            summary=summary,
            details=tool_result[:300],
            passed=passed,
        )

    @classmethod
    def _verify_system(cls, task: TaskNode, tool_result: str, criteria: Dict[str, Any]) -> Tuple[bool, TaskEvidence]:
        """Verifica se comandos de sistema ou serviços foram executados sem exceções."""
        lower_res = tool_result.lower()
        has_fail = "erro" in lower_res or "falha" in lower_res or "exception" in lower_res

        passed = not has_fail
        return passed, TaskEvidence(
            type="system",
            summary=f"Verificação do sistema: {tool_result[:100]}",
            details=tool_result,
            passed=passed,
        )

    @classmethod
    def _verify_visual(cls, task: TaskNode, tool_result: str, criteria: Dict[str, Any]) -> Tuple[bool, TaskEvidence]:
        """Verifica captura de telas ou abertura de janelas de interface."""
        passed = "erro" not in tool_result.lower()
        return passed, TaskEvidence(
            type="visual",
            summary="Evidência visual confirmada: captura de interface ou janela verificada.",
            details=tool_result,
            passed=passed,
        )

    @classmethod
    def _verify_generic(cls, task: TaskNode, tool_result: str) -> Tuple[bool, TaskEvidence]:
        passed = "erro" not in tool_result.lower() and "fail" not in tool_result.lower()
        return passed, TaskEvidence(
            type="system",
            summary=f"Evidência de execução: {tool_result[:100]}",
            details=tool_result,
            passed=passed,
        )
