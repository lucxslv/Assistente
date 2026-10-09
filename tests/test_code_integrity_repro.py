"""Testes de reprodução dos defeitos reais relatados nos testes externos do Charlie.

Fase 1 (RED): Congela os casos de falha demonstrando a causa raiz dos defeitos antes de aplicar a correção.
"""

import re
import pytest
from brain.agent.task_graph import TaskNode
from brain.agent.verifier import Verifier


def apply_legacy_pipeline_cleanup(final_reply: str) -> str:
    """Reproduz exatamente a lógica da linha 432-436 de core/pipeline.py antes da correção."""
    final_reply = re.sub(r'<[^>]+>', '', final_reply).strip()
    final_reply = re.sub(r'Chamando ferramenta:[^\n]*', '', final_reply).strip()
    final_reply = re.sub(r'ToolCall\([^\)]*\)', '', final_reply).strip()
    final_reply = re.sub(r'\{.*?"name".*?\}', '', final_reply, flags=re.DOTALL).strip()
    final_reply = re.sub(r'\{.*?"action".*?\}', '', final_reply, flags=re.DOTALL).strip()
    return final_reply


def test_reproduce_defect_1_typescript_generics_mutilation():
    """Reproduz defeito: Record vira Record sem parâmetros, Result vira Result sem T e E, Promise vira Promise>."""
    original_code = (
        "export type Result<T, E> =\n"
        "  | { ok: true; value: T }\n"
        "  | { ok: false; error: E };\n\n"
        "export type UserCache = Record<string, unknown>;\n\n"
        "async function getUser(id: string): Promise<Result<Record<string, unknown>, Error>> {\n"
        "  return { ok: true, value: {} };\n"
        "}"
    )

    # Executa a limpeza legada
    mutilated = apply_legacy_pipeline_cleanup(original_code)

    # Evidência concreta do defeito 1: Record sem especificação de chave e valor
    assert "Record<string, unknown>" not in mutilated, "Causa raiz confirmada: regex apagou parâmetros de Record"
    assert "Record" in mutilated

    # Evidência concreta do defeito 2: Result sem declarar parâmetros T e E
    assert "Result<T, E>" not in mutilated, "Causa raiz confirmada: regex apagou <T, E>"
    assert "export type Result =" in mutilated, "Causa raiz confirmada: export type Result = |"

    # Evidência concreta do defeito 3: Assinatura incompleta Promise>
    assert "Promise>" in mutilated or "Promise" in mutilated, "Causa raiz confirmada: Promise corrompida"


def test_reproduce_defect_2_json_properties_deletion():
    """Reproduz defeito: Objetos com propriedades name e action são totalmente deletados com flags=re.DOTALL."""
    json_example = (
        "```json\n"
        "{\n"
        '  "name": "create_user",\n'
        '  "action": "execute",\n'
        '  "status": "pending"\n'
        "}\n"
        "```"
    )

    mutilated = apply_legacy_pipeline_cleanup(json_example)

    # A regex removeu o bloco inteiro
    assert '"name": "create_user"' not in mutilated, "Causa raiz confirmada: bloco JSON com 'name' foi apagado"
    assert '"action": "execute"' not in mutilated, "Causa raiz confirmada: bloco JSON com 'action' foi apagado"


def test_reproduce_defect_3_verifier_gives_false_positive_stamp_without_tests():
    """Reproduz defeito: Verifier emite 'Compilação/Testes validados com sucesso' mesmo sem ter executado testes."""
    task = TaskNode(
        id="task_1",
        title="Compilar projeto",
        agent_role="coder",
        tool="execute_command",
        arguments={"command": "npm run build"},
        expected_evidence_type="code",
    )

    # O tool_result foi apenas uma build sem execução de suíte de testes
    tool_result = "Build completed successfully in 1.2s"

    passed, evidence = Verifier._verify_code(task, tool_result, {})

    # Na implementação legada, mesmo sem testes executados, ele emite o selo de testes:
    assert evidence.summary == "Compilação/Testes validados com sucesso.", (
        "Causa raiz confirmada: Verifier atribui selo 'Testes validados' sem evidência de testes executados!"
    )


def test_pipeline_must_preserve_raw_typescript_and_json():
    """Teste alvo (RED antes da Task 2): O parser oficial deve preservar o código sem alterações."""
    from core.message_parser import parse_assistant_message_content

    typescript_input = (
        "Aqui está a implementação defensiva:\n\n"
        "```typescript\n"
        "export type Result<T, E> =\n"
        "  | { ok: true; value: T }\n"
        "  | { ok: false; error: E };\n\n"
        "export type UserCache = Record<string, unknown>;\n\n"
        "export async function getUser(id: string): Promise<Result<Record<string, unknown>, Error>> {\n"
        "  return { ok: true, value: {} };\n"
        "}\n"
        "```\n\n"
        "```json\n"
        "{\n"
        '  "name": "create_user",\n'
        '  "action": "execute"\n'
        "}\n"
        "```"
    )

    clean_content, metadata = parse_assistant_message_content(typescript_input)

    assert "Result<T, E>" in clean_content
    assert "Record<string, unknown>" in clean_content
    assert "Promise<Result<Record<string, unknown>, Error>>" in clean_content
    assert '"name": "create_user"' in clean_content
    assert '"action": "execute"' in clean_content
    assert clean_content.strip() == typescript_input.strip()

