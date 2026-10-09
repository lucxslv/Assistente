"""Testes para o módulo Verifier com validação determinística de sintaxe AST e taxonomia de evidências."""

import asyncio
import pytest
from pathlib import Path
from brain.agent.task_graph import TaskNode
from brain.agent.verifier import Verifier


@pytest.fixture
def temp_py_file(tmp_path):
    """Cria um arquivo python válido temporário."""
    file_path = tmp_path / "valid_script.py"
    file_path.write_text("def hello():\n    return 'world'\n", encoding="utf-8")
    return file_path


@pytest.fixture
def temp_invalid_py_file(tmp_path):
    """Cria um arquivo python com erro de sintaxe."""
    file_path = tmp_path / "broken_script.py"
    file_path.write_text("def broken_syntax(\n    return 42\n", encoding="utf-8")
    return file_path


def test_verify_code_valid_syntax():
    """Código Python válido em arguments['content'] deve passar na validação AST."""
    task = TaskNode(
        id="task_1",
        title="Escrever script de teste",
        tool="write_file",
        arguments={"path": "script.py", "content": "x = 10\ny = 20\nprint(x + y)"},
        expected_evidence_type="code",
    )
    passed, evidence = asyncio.run(Verifier.verify_task(task, "Arquivo escrito com sucesso."))
    assert passed is True
    assert evidence.passed is True
    assert "Sintaxe Python validada com sucesso via AST" in evidence.summary or "validados com sucesso" in evidence.summary


def test_verify_code_syntax_error_fails():
    """Código Python com erro de sintaxe deve falhar com detalhes exatos de linha/coluna."""
    task = TaskNode(
        id="task_2",
        title="Escrever script com erro de sintaxe",
        tool="write_file",
        arguments={"path": "script.py", "content": "def func(\n   print('incompleto')"},
        expected_evidence_type="code",
    )
    passed, evidence = asyncio.run(Verifier.verify_task(task, "Arquivo escrito com sucesso."))
    assert passed is False
    assert evidence.passed is False
    assert "Erro de sintaxe Python" in evidence.summary
    assert "linha" in evidence.summary.lower()


def test_verify_file_valid_python_includes_ast_check(temp_py_file):
    """Verificação de arquivo .py no disco deve validar AST com sucesso."""
    task = TaskNode(
        id="task_3",
        title="Salvar script válido",
        tool="write_file",
        arguments={"path": str(temp_py_file)},
        expected_evidence_type="file",
    )
    passed, evidence = asyncio.run(Verifier.verify_task(task, f"Arquivo salvo em {temp_py_file}"))
    assert passed is True
    assert evidence.passed is True
    assert "AST" in evidence.summary or "sintaxe" in evidence.summary.lower()


def test_verify_file_invalid_python_fails_on_ast(temp_invalid_py_file):
    """Verificação de arquivo .py com erro de sintaxe no disco deve falhar com detalhes da AST."""
    task = TaskNode(
        id="task_4",
        title="Salvar script quebrado",
        tool="write_file",
        arguments={"path": str(temp_invalid_py_file)},
        expected_evidence_type="file",
    )
    passed, evidence = asyncio.run(Verifier.verify_task(task, f"Arquivo salvo em {temp_invalid_py_file}"))
    assert passed is False
    assert evidence.passed is False
    assert "Erro de sintaxe Python" in evidence.summary
    assert "linha" in evidence.summary.lower()


def test_taxonomy_distinguishes_file_from_test_execution(temp_py_file):
    """Criação de arquivo não deve alegar que testes passaram sem execução real."""
    task = TaskNode(
        id="task_5",
        title="Criar arquivo de testes",
        tool="write_file",
        arguments={"path": str(temp_py_file), "content": "def test_ok(): assert True"},
        expected_evidence_type="file",
    )
    passed, evidence = asyncio.run(Verifier.verify_task(task, "Arquivo gravado com sucesso."))
    assert passed is True
    assert evidence.type == "file"
    assert "tests passed" not in evidence.summary.lower()
