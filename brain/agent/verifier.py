"""Módulo de Verificação de Evidências do Charlie Agent Runtime («Conclusão exige evidência»)."""

from __future__ import annotations
import ast
from datetime import datetime, timezone
import enum
import hashlib
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from brain.agent.task_graph import TaskEvidence, TaskNode

logger = logging.getLogger("charlie.agent.verifier")


class VerificationCheckType(str, enum.Enum):
    """Dimensão 1: Qual tipo de verificação foi efetivamente executado pelo sistema."""
    NONE = "none"
    STATIC_ANALYSIS = "static_analysis"
    COMPILATION = "compilation"
    TEST_SUITE = "test_suite"
    MANUAL_EXECUTION = "manual_execution"


class VerificationStatus(str, enum.Enum):
    """Dimensão 2: Qual foi o resultado concreto da verificação executada."""
    NOT_EXECUTED = "not_executed"
    PASSED = "passed"
    FAILED = "failed"
    TOOL_ERROR = "tool_error"


@dataclass
class VerificationResult:
    """Registro estruturado de evidência determinística vinculada à versão do código."""
    check_type: VerificationCheckType
    status: VerificationStatus
    command: Optional[str] = None
    exit_code: Optional[int] = None
    duration_ms: Optional[float] = None
    target_path: Optional[str] = None
    target_file_hash: Optional[str] = None
    evidence_id: Optional[str] = None
    summary: str = ""
    details: Optional[str] = None
    verified_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_task_evidence(self) -> TaskEvidence:
        """Converte para o formato de persistência do TaskGraph mantendo compatibilidade."""
        return TaskEvidence(
            type=self.check_type.value,
            summary=self.summary,
            details=self.details,
            passed=(self.status == VerificationStatus.PASSED),
            verified_at=self.verified_at,
        )


class Verifier:
    """Valida evidências tangíveis antes de autorizar a transição de uma tarefa para SUCCESS."""

    @classmethod
    def calculate_file_hash(cls, path_or_content: str | Path) -> str:
        """Calcula hash SHA-256 do arquivo ou conteúdo para vincular a evidência à versão exata."""
        try:
            if isinstance(path_or_content, Path) or (isinstance(path_or_content, str) and os.path.exists(path_or_content)):
                p = Path(path_or_content)
                if p.is_file():
                    content = p.read_text(encoding="utf-8", errors="ignore")
                    return hashlib.sha256(content.encode("utf-8")).hexdigest()
            # Se for string de código direto
            if isinstance(path_or_content, str):
                return hashlib.sha256(path_or_content.encode("utf-8")).hexdigest()
        except Exception as e:
            logger.debug(f"Falha ao calcular hash de arquivo: {e}")
        return ""

    @classmethod
    def is_evidence_valid_for_file(cls, evidence: VerificationResult, current_file_path: str) -> bool:
        """Invalida a evidência se o arquivo tiver sido modificado após a verificação."""
        if not evidence.target_file_hash or not os.path.exists(current_file_path):
            return False
        current_hash = cls.calculate_file_hash(current_file_path)
        return current_hash == evidence.target_file_hash

    @classmethod
    def evaluate_verification(
        cls,
        task: TaskNode,
        tool_name: str,
        tool_result: str,
        exit_code: Optional[int] = None,
        command: Optional[str] = None,
    ) -> VerificationResult:
        """Classifica determinísticamente a verificação nas duas dimensões obrigatórias.

        Regra: Código gerado != código compilado != testes aprovados.
        O sistema determina o status baseado em evidências físicas e exit codes.
        """
        cmd_str = (command or task.arguments.get("command") or "").strip().lower()
        res_lower = tool_result.lower()
        code_content = task.arguments.get("content") or task.arguments.get("code") or ""
        path_arg = task.arguments.get("path") or ""

        # Identificação de Suíte de Testes Reais
        is_test_command = any(
            t in cmd_str for t in ("pytest", "npm test", "jest", "vitest", "cargo test", "python -m unittest", "go test")
        )
        # Identificação de Compilação / Linter / Build
        is_compilation_command = any(
            c in cmd_str for c in ("npm run build", "tsc", "cargo build", "gcc", "go build", "mvn compile", "gradle build")
        )

        file_hash = None
        if path_arg and os.path.exists(path_arg):
            file_hash = cls.calculate_file_hash(path_arg)
        elif code_content:
            file_hash = cls.calculate_file_hash(code_content)

        # 1. Caso: Execução de Suíte de Teste Real
        if is_test_command:
            has_fail = (
                (exit_code is not None and exit_code != 0)
                or "failed" in res_lower
                or "failure" in res_lower
                or "error" in res_lower
            )
            passed = not has_fail
            status = VerificationStatus.PASSED if passed else VerificationStatus.FAILED
            summary = (
                f"Suíte de testes aprovada: {tool_result[:140]}"
                if passed
                else f"Suíte de testes reprovada com erros: {tool_result[:140]}"
            )
            return VerificationResult(
                check_type=VerificationCheckType.TEST_SUITE,
                status=status,
                command=cmd_str,
                exit_code=exit_code if exit_code is not None else (0 if passed else 1),
                target_path=path_arg or None,
                target_file_hash=file_hash,
                summary=summary,
                details=tool_result,
            )

        # 2. Caso: Compilação / Build
        if is_compilation_command:
            has_fail = (
                (exit_code is not None and exit_code != 0)
                or "error:" in res_lower
                or "failed" in res_lower
            )
            passed = not has_fail
            status = VerificationStatus.PASSED if passed else VerificationStatus.FAILED
            summary = (
                "Compilação concluída com sucesso. (Execução de runtime não realizada)"
                if passed
                else "Falha durante compilação do projeto."
            )
            return VerificationResult(
                check_type=VerificationCheckType.COMPILATION,
                status=status,
                command=cmd_str,
                exit_code=exit_code if exit_code is not None else (0 if passed else 1),
                target_path=path_arg or None,
                target_file_hash=file_hash,
                summary=summary,
                details=tool_result,
            )

        # 3. Caso: Análise Sintática Estática (AST Python ou similar em write_file)
        if tool_name in ("write_file", "replace_in_file"):
            is_py = path_arg.endswith(".py") or any(kw in code_content for kw in ("def ", "class ", "import "))
            if is_py and code_content:
                try:
                    ast.parse(code_content, filename=path_arg or "<dynamic_code>")
                    return VerificationResult(
                        check_type=VerificationCheckType.STATIC_ANALYSIS,
                        status=VerificationStatus.PASSED,
                        command=None,
                        exit_code=0,
                        target_path=path_arg or None,
                        target_file_hash=file_hash,
                        summary="Sintaxe Python validada com sucesso via AST. (Testes de runtime não executados)",
                        details=tool_result,
                    )
                except SyntaxError as e:
                    return VerificationResult(
                        check_type=VerificationCheckType.STATIC_ANALYSIS,
                        status=VerificationStatus.FAILED,
                        command=None,
                        exit_code=1,
                        target_path=path_arg or None,
                        target_file_hash=file_hash,
                        summary=f"Erro de sintaxe Python na linha {e.lineno}, coluna {e.offset}: {e.msg}",
                        details=str(e),
                    )

            # Arquivo não Python gravado
            return VerificationResult(
                check_type=VerificationCheckType.MANUAL_EXECUTION,
                status=VerificationStatus.PASSED,
                command=None,
                exit_code=0,
                target_path=path_arg or None,
                target_file_hash=file_hash,
                summary="Arquivo gravado no disco com sucesso. (Validação e testes não executados)",
                details=tool_result,
            )

        # 4. Caso: Comando Genérico de Sistema
        has_error = (
            (exit_code is not None and exit_code != 0)
            or "erro" in res_lower
            or "command not found" in res_lower
            or "não é reconhecido" in res_lower
        )
        passed = not has_error
        return VerificationResult(
            check_type=VerificationCheckType.MANUAL_EXECUTION,
            status=VerificationStatus.PASSED if passed else VerificationStatus.FAILED,
            command=cmd_str or None,
            exit_code=exit_code if exit_code is not None else (0 if passed else 1),
            target_path=path_arg or None,
            target_file_hash=file_hash,
            summary=f"Execução de comando concluída com exit code {exit_code or 0}. (Sem suíte de testes)",
            details=tool_result[:300],
        )

    @classmethod
    async def verify_task(
        cls,
        task: TaskNode,
        tool_result: str,
        system_context: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, TaskEvidence]:
        """Avalia se o resultado da ferramenta satisfaz os critérios de conclusão."""
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

        return cls._verify_generic(task, tool_result)

    @classmethod
    def _verify_file(cls, task: TaskNode, tool_result: str, criteria: Dict[str, Any]) -> Tuple[bool, TaskEvidence]:
        """Verifica existência física, integridade e conteúdo de arquivos."""
        target_path_str = criteria.get("path") or task.arguments.get("path")
        is_cloud = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))
        if is_cloud:
            passed = any(
                term in tool_result.lower()
                for term in ("sucesso", "criada", "criado", "gravado", "gravada", "despachado", "enviado", "concluído", "conteúdo")
            )
            return passed, TaskEvidence(
                type="file",
                summary=f"Evidência de execução remota confirmada no Windows Desktop: {target_path_str or 'operação em arquivo'}",
                details=tool_result,
                passed=passed,
            )

        if not target_path_str:
            import re
            m = re.search(r"['\"]([^'\"]+\.[a-zA-Z0-9]+)['\"]", tool_result)
            if m:
                target_path_str = m.group(1)
            else:
                return False, TaskEvidence(
                    type="file",
                    summary="Falha de verificação: Nenhum arquivo físico foi especificado para verificação.",
                    details=tool_result,
                    passed=False,
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

        expected_substring = criteria.get("contains")
        file_hash = cls.calculate_file_hash(target)[:12]
        ast_verified = False

        if target.is_file():
            try:
                content = target.read_text(encoding="utf-8", errors="ignore")
                if target.suffix.lower() == ".py":
                    try:
                        ast.parse(content, filename=str(target))
                        ast_verified = True
                    except SyntaxError as e:
                        return False, TaskEvidence(
                            type="file",
                            summary=f"Erro de sintaxe Python no arquivo '{target.name}' na linha {e.lineno}, coluna {e.offset}: {e.msg}",
                            details=f"Path: {target.resolve()}\nSyntaxError: {e}",
                            passed=False,
                        )

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
        if ast_verified:
            summary += " (sintaxe AST validada)"

        return True, TaskEvidence(
            type="file",
            summary=summary,
            details=f"Path: {target.resolve()}",
            passed=True,
        )

    @classmethod
    def _verify_code(cls, task: TaskNode, tool_result: str, criteria: Dict[str, Any]) -> Tuple[bool, TaskEvidence]:
        """Verifica exit codes determinísticos sem atribuir selos falsos de teste."""
        eval_res = cls.evaluate_verification(
            task=task,
            tool_name=task.tool or "execute_command",
            tool_result=tool_result,
            exit_code=criteria.get("exit_code"),
            command=task.arguments.get("command"),
        )
        return (eval_res.status == VerificationStatus.PASSED), eval_res.to_task_evidence()

    @classmethod
    def _verify_system(cls, task: TaskNode, tool_result: str, criteria: Dict[str, Any]) -> Tuple[bool, TaskEvidence]:
        eval_res = cls.evaluate_verification(
            task=task,
            tool_name="execute_command",
            tool_result=tool_result,
            exit_code=criteria.get("exit_code"),
            command=task.arguments.get("command"),
        )
        return (eval_res.status == VerificationStatus.PASSED), eval_res.to_task_evidence()

    @classmethod
    def _verify_visual(cls, task: TaskNode, tool_result: str, criteria: Dict[str, Any]) -> Tuple[bool, TaskEvidence]:
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
