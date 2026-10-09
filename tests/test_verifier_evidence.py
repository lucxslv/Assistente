"""Testes de verificação baseada em evidências, invalidação por hash e honestidade técnica."""

import hashlib
import pytest
from brain.agent.task_graph import TaskNode
from brain.agent.verifier import (
    Verifier,
    VerificationCheckType,
    VerificationStatus,
    VerificationResult,
)


def test_verification_result_has_two_dimensions():
    """Valida a separação estrita entre check_type e status."""
    result = VerificationResult(
        check_type=VerificationCheckType.STATIC_ANALYSIS,
        status=VerificationStatus.PASSED,
        command=None,
        exit_code=0,
        evidence_id="ev_123",
        target_file_hash="abc12345",
        summary="AST sintático aprovado",
    )
    assert result.check_type == VerificationCheckType.STATIC_ANALYSIS
    assert result.status == VerificationStatus.PASSED
    assert result.target_file_hash == "abc12345"


def test_static_analysis_does_not_claim_test_suite_passed():
    """Valida que análise estática AST não recebe o rótulo de teste executado."""
    task = TaskNode(
        id="t1",
        title="Escrever módulo",
        tool="write_file",
        arguments={"path": "module.py", "content": "def calculate(x): return x * 2"},
        expected_evidence_type="code",
    )
    res = Verifier.evaluate_verification(
        task=task,
        tool_name="write_file",
        tool_result="Arquivo module.py gravado com sucesso.",
        exit_code=0,
    )
    assert res.check_type == VerificationCheckType.STATIC_ANALYSIS
    assert res.status == VerificationStatus.PASSED
    # Não pode afirmar 'testes aprovados'
    assert "testes" not in res.summary.lower() or "não executados" in res.summary.lower()


def test_command_without_tests_cannot_claim_tests_passed():
    """Comando de build ou listagem sem suíte de teste é marcado como COMPILATION ou MANUAL_EXECUTION, não TEST_SUITE."""
    task = TaskNode(
        id="t2",
        title="Build do projeto",
        tool="execute_command",
        arguments={"command": "npm run build"},
        expected_evidence_type="code",
    )
    res = Verifier.evaluate_verification(
        task=task,
        tool_name="execute_command",
        tool_result="Compiled successfully in 1.4s",
        exit_code=0,
    )
    assert res.check_type == VerificationCheckType.COMPILATION
    assert res.status == VerificationStatus.PASSED
    assert "testes" not in res.summary.lower()


def test_real_test_suite_execution_detects_pass_or_fail():
    """Comando de teste real (pytest, npm test) é classificado como TEST_SUITE e avalia exit code real."""
    task = TaskNode(
        id="t3",
        title="Executar testes unitários",
        tool="execute_command",
        arguments={"command": "pytest tests/ -v"},
        expected_evidence_type="code",
    )
    res_pass = Verifier.evaluate_verification(
        task=task,
        tool_name="execute_command",
        tool_result="15 passed in 0.4s",
        exit_code=0,
    )
    assert res_pass.check_type == VerificationCheckType.TEST_SUITE
    assert res_pass.status == VerificationStatus.PASSED

    res_fail = Verifier.evaluate_verification(
        task=task,
        tool_name="execute_command",
        tool_result="2 failed, 13 passed in 0.5s",
        exit_code=1,
    )
    assert res_fail.check_type == VerificationCheckType.TEST_SUITE
    assert res_fail.status == VerificationStatus.FAILED


def test_evidence_invalidation_when_file_hash_changes(tmp_path):
    """Garante que a evidência é invalidada quando o arquivo é modificado após a verificação."""
    test_file = tmp_path / "app.py"
    content_v1 = "def run(): return 1\n"
    test_file.write_text(content_v1, encoding="utf-8")
    hash_v1 = hashlib.sha256(content_v1.encode("utf-8")).hexdigest()

    evidence = VerificationResult(
        check_type=VerificationCheckType.STATIC_ANALYSIS,
        status=VerificationStatus.PASSED,
        target_file_hash=hash_v1,
        target_path=str(test_file),
    )

    # V1 é válida
    assert Verifier.is_evidence_valid_for_file(evidence, str(test_file)) is True

    # Charlie edita o arquivo para V2
    content_v2 = "def run(): return 2 # modificado\n"
    test_file.write_text(content_v2, encoding="utf-8")

    # A evidência anterior para V1 agora é INVÁLIDA para o arquivo modificado!
    assert Verifier.is_evidence_valid_for_file(evidence, str(test_file)) is False
