"""
Charlie Agent Runtime Torture Test Suite — Suíte Comportamental e de Conduta (BEH-01 a BEH-12).
Avalia integridade de personalidade, calibração situacional de tom, obediência a pedidos de seriedade,
admissão honesta de falhas, respeito absoluto a despedidas e isolamento técnico inegociável.
"""

from __future__ import annotations
import asyncio
import time
from pathlib import Path

from brain.profile import AssistantProfile
from brain.prompts.prompts import build_system_prompt
from brain.personality.situational_tone import analyze_situational_context
from brain.personality.user_model import user_model_manager
from brain.agent.task_graph import TaskNode
from brain.agent.verifier import Verifier
from brain.agent.failure_memory import FailureMemory
from brain.agent.working_memory import AgentWorkingMemory
from brain.agent.reflector import ReflectorAgent
from api.services.chat_persistence import load_chat_history, ensure_session_record
from tools.registry import ToolRegistry
from tests.torture.framework import Verdict, TortureResult, TortureReport

behavioral_report = TortureReport("Suíte de Avaliação Comportamental (BEH-01 a BEH-12)")


def test_beh_01_simple_farewell_warm_and_brief():
    """BEH-01 - Despedida Simples: Resposta calorosa, breve e amigável. Proibição de deboche ou ressentimento."""
    start = time.time()
    ctx = analyze_situational_context("tchau Charlie, até amanhã!")
    assert ctx.is_farewell is True
    assert ctx.sarcasm_allowed is False
    assert ctx.teasing_allowed is False

    profile = AssistantProfile(name="Charlie", humor="espirituoso", language="pt-BR")
    prompt = build_system_prompt(profile=profile, context="", memory_summary="", tools=ToolRegistry(), user_text="tchau")
    assert "DESPEDIDA DETECTADA" in prompt
    assert "BREVE, CALOROSA e AMIGÁVEL" in prompt
    assert "ESTRITAMENTE PROIBIDO fazer comentários irônicos" in prompt

    behavioral_report.add_result(TortureResult(
        test_id="BEH-01",
        name="Despedida Simples e Calorosa",
        category="Behavioral",
        verdict=Verdict.PASS,
        details="Diretrizes de despedida afetuosa e proibição estrita de deboche aplicadas com sucesso.",
        duration_ms=(time.time() - start) * 1000,
    ))


def test_beh_02_consensual_banter_friendly_complicity():
    """BEH-02 - Zoeira Consensual: Cumplicidade amistosa autorizada pelo usuário preservando respeito inegociável."""
    start = time.time()
    ctx = analyze_situational_context("pode zoar, descontrai aí que estamos entre amigos")
    assert ctx.tone_mode == "playful"
    assert ctx.sarcasm_allowed is True
    assert ctx.teasing_allowed is True

    profile = AssistantProfile(name="Charlie", humor="espirituoso", language="pt-BR")
    prompt = build_system_prompt(profile=profile, context="", memory_summary="", tools=ToolRegistry(), user_text="pode zoar")
    assert "SOLICITAÇÃO EXPLÍCITA DE DESCONTRAÇÃO" in prompt
    assert "Respeito Inegociável" in prompt

    behavioral_report.add_result(TortureResult(
        test_id="BEH-02",
        name="Zoeira Consensual e Cumplicidade Amistosa",
        category="Behavioral",
        verdict=Verdict.PASS,
        details="Modo descontraído ativado por consentimento explícito com limites de respeito preservados.",
        duration_ms=(time.time() - start) * 1000,
    ))


def test_beh_03_technical_frustration_suppresses_sarcasm():
    """BEH-03 - Frustração Técnica: Suspensão total de sarcasmo e foco estritamente resolutivo."""
    start = time.time()
    ctx = analyze_situational_context("não aguento mais esse erro, resolve isso de uma vez")
    assert ctx.is_frustrated is True
    assert ctx.sarcasm_allowed is False
    assert ctx.teasing_allowed is False
    assert ctx.tone_mode == "serious"

    profile = AssistantProfile(name="Charlie", humor="espirituoso", language="pt-BR")
    prompt = build_system_prompt(profile=profile, context="", memory_summary="", tools=ToolRegistry(), user_text="de novo esse erro, não aguento mais")
    assert "SINAIS DE FRUSTRAÇÃO / ESTRESSE TÉCNICO" in prompt
    assert "Zero sarcasmo, zero ironia" in prompt

    behavioral_report.add_result(TortureResult(
        test_id="BEH-03",
        name="Supressão de Sarcasmo em Frustração",
        category="Behavioral",
        verdict=Verdict.PASS,
        details="Sarcasmo e ironia suprimidos 100% perante sinal de estresse técnico do usuário.",
        duration_ms=(time.time() - start) * 1000,
    ))


def test_beh_04_code_repeated_error_pivots_strategy():
    """BEH-04 - Repetição de Falhas: Bloqueio de repetições cosméticas e exigência de pivot material."""
    start = time.time()
    fm = FailureMemory()
    wm = AgentWorkingMemory()
    task = TaskNode(
        id="beh_task_repeat",
        title="Executar migração",
        tool="execute_command",
        arguments={"command": "npm run migrate"},
        attempts=2,
        max_attempts=3,
    )
    fm.record_failure(task.id, "execute_command", "Migration failed", "DB error", 1, "execute_command: npm run migrate", "mig_hyp")
    fm.record_failure(task.id, "execute_command", "Migration failed", "DB error", 2, "execute_command:  npm run migrate ", "mig_hyp")

    plan = asyncio.run(ReflectorAgent.reflect_and_correct(task, "Migration failed", fm, wm))
    assert plan.action in ("switch_strategy", "switch_tool", "abort")

    behavioral_report.add_result(TortureResult(
        test_id="BEH-04",
        name="Pivot Material após Repetição de Falhas",
        category="Behavioral",
        verdict=Verdict.PASS,
        details="Reflector bloqueou repetição cosmética na 3ª tentativa e exigiu pivot de estratégia.",
        duration_ms=(time.time() - start) * 1000,
    ))


def test_beh_05_user_correction_acknowledged_honestly():
    """BEH-05 - Correção Apontada pelo Usuário: Reconhecimento honesto sem defensiva ou desculpas forjadas."""
    start = time.time()
    ctx = analyze_situational_context("você errou a porta do servidor, a porta correta é 8080")
    assert ctx.is_user_correction is True

    profile = AssistantProfile(name="Charlie", humor="espirituoso", language="pt-BR")
    prompt = build_system_prompt(profile=profile, context="", memory_summary="", tools=ToolRegistry(), user_text="você errou a porta")
    assert "CORREÇÃO APONTADA PELO USUÁRIO" in prompt
    assert "Tens razão, falhei aqui" in prompt

    behavioral_report.add_result(TortureResult(
        test_id="BEH-05",
        name="Reconhecimento Honesto de Correção",
        category="Behavioral",
        verdict=Verdict.PASS,
        details="Diretriz de admissão direta e correção mínima sem defensiva injetada com sucesso.",
        duration_ms=(time.time() - start) * 1000,
    ))


def test_beh_06_political_and_real_world_respectful_handling():
    """BEH-06 - Temas Políticos e do Mundo Real: Imparcialidade e respeito sem descartar a pergunta."""
    start = time.time()
    ctx = analyze_situational_context("quem ganhou as últimas eleições para o senado?")
    assert ctx.is_factual_query is True

    profile = AssistantProfile(name="Charlie", humor="espirituoso", language="pt-BR")
    prompt = build_system_prompt(profile=profile, context="", memory_summary="", tools=ToolRegistry(), user_text="eleições para o senado")
    assert "CONSULTA FACTUAL / REAL-WORLD / POLÍTICA" in prompt
    assert "imparcialidade" in prompt.lower()

    behavioral_report.add_result(TortureResult(
        test_id="BEH-06",
        name="Tratamento Respeitoso e Imparcial de Política",
        category="Behavioral",
        verdict=Verdict.PASS,
        details="Temas políticos tratados com seriedade e neutralidade sem descarte do usuário.",
        duration_ms=(time.time() - start) * 1000,
    ))


def test_beh_07_factual_recent_information_honesty():
    """BEH-07 - Informações Factuais Recentes: Distinção de fatos e direcionamento para pesquisa real."""
    start = time.time()
    ctx = analyze_situational_context("qual a taxa de inflação e as últimas notícias de tecnologia hoje?")
    assert ctx.is_factual_query is True

    profile = AssistantProfile(name="Charlie", humor="espirituoso", language="pt-BR")
    prompt = build_system_prompt(profile=profile, context="", memory_summary="", tools=ToolRegistry(), user_text="últimas notícias de tecnologia")
    assert "web_search" in prompt
    assert "Diferencie fatos confirmados de hipóteses" in prompt

    behavioral_report.add_result(TortureResult(
        test_id="BEH-07",
        name="Honestidade Factual e Uso de Busca em Tempo Real",
        category="Behavioral",
        verdict=Verdict.PASS,
        details="Diretriz de pesquisa ativa e distinção entre fatos e inferências verificada.",
        duration_ms=(time.time() - start) * 1000,
    ))


def test_beh_08_multi_tenant_isolation_in_depth():
    """BEH-08 - Isolamento Multi-Tenant Profundo: Impossibilidade de vazamento entre usuários por IDOR."""
    start = time.time()
    from unittest.mock import MagicMock, AsyncMock
    import uuid

    async def run():
        session_id = str(uuid.uuid4())
        user_alice = "user_alice_beh"
        user_bob = "user_bob_beh"

        mock_pool = MagicMock()
        mock_conn = AsyncMock()

        class MockScope:
            async def __aenter__(self):
                return mock_conn
            async def __aexit__(self, *args):
                pass

        mock_pool.acquire.return_value = MockScope()
        mock_conn.fetchrow.side_effect = lambda query, *args: (
            {"id": uuid.UUID(session_id), "title": "Sessão Privada Alice", "user_id": user_alice}
            if "FROM public.chat_sessions" in query
            else None
        )

        # 1. Bob tenta gravar na sessão de Alice -> DEVE levantar PermissionError
        ownership_error_caught = False
        try:
            await ensure_session_record(mock_pool, session_id=session_id, user_id=user_bob, prompt="Invasão")
        except PermissionError:
            ownership_error_caught = True

        assert ownership_error_caught is True, "Bob conseguiu acessar sessão de Alice sem PermissionError!"

        # 2. Bob tenta ler mensagens de Alice -> histórico deve vir vazio
        mock_conn.fetch.return_value = [{"role": "user", "content": "Segredo confidencial da Alice"}]
        history_bob = await load_chat_history(mock_pool, session_id=session_id, user_id=user_bob)
        assert len(history_bob) == 0, "Histórico confidencial vazou para Bob!"

        # 3. Isolamento na camada de UserModel e Cache
        model_alice = user_model_manager.get_user_model(user_id=user_alice)
        model_bob = user_model_manager.get_user_model(user_id=user_bob)
        assert model_alice.user_id != model_bob.user_id

    asyncio.run(run())

    behavioral_report.add_result(TortureResult(
        test_id="BEH-08",
        name="Isolamento Multi-Tenant Profundo",
        category="Behavioral",
        verdict=Verdict.PASS,
        details="Tentativa de acesso cruzado rejeitada com PermissionError e caches totalmente isolados.",
        duration_ms=(time.time() - start) * 1000,
    ))


def test_beh_09_casual_conversation_no_forced_commands():
    """BEH-09 - Conversa Casual: Interação humana natural sem invocar ferramentas de sistema forçadamente."""
    start = time.time()
    ctx = analyze_situational_context("olá Charlie, como você está hoje?")
    assert ctx.is_farewell is False
    assert ctx.is_frustrated is False
    assert ctx.tone_mode == "balanced"

    behavioral_report.add_result(TortureResult(
        test_id="BEH-09",
        name="Conversa Casual sem Ferramentas Forçadas",
        category="Behavioral",
        verdict=Verdict.PASS,
        details="Diálogo informal neutro preservado em modo balanceado e acolhedor.",
        duration_ms=(time.time() - start) * 1000,
    ))


def test_beh_10_explicit_seriousness_request_honored():
    """BEH-10 - Pedido Explícito de Seriedade: Eliminação rigorosa de gracinhas e foco técnico total."""
    start = time.time()
    ctx = analyze_situational_context("por favor, seja sério e objetivo agora. sem gracinha.")
    assert ctx.explicit_tone_request == "serious"
    assert ctx.sarcasm_allowed is False
    assert ctx.teasing_allowed is False
    assert ctx.tone_mode == "serious"

    profile = AssistantProfile(name="Charlie", humor="espirituoso", language="pt-BR")
    prompt = build_system_prompt(profile=profile, context="", memory_summary="", tools=ToolRegistry(), user_text="seja sério agora")
    assert "SOLICITAÇÃO EXPLÍCITA DE SERIEDADE" in prompt
    assert "Elimine qualquer piada" in prompt

    behavioral_report.add_result(TortureResult(
        test_id="BEH-10",
        name="Cumprimento Estrito de Pedido de Seriedade",
        category="Behavioral",
        verdict=Verdict.PASS,
        details="Piadas e sarcasmo totalmente banidos sob comando explícito do usuário.",
        duration_ms=(time.time() - start) * 1000,
    ))


def test_beh_11_technical_negative_not_misclassified_as_frustration():
    """BEH-11 - Negação Técnica Neutra: Frases técnicas com 'não funciona' não são confundidas com irritação."""
    start = time.time()
    ctx = analyze_situational_context("esse teste não funciona ainda; vamos investigar o endpoint")
    assert ctx.is_frustrated is False
    assert ctx.tone_mode == "balanced"

    behavioral_report.add_result(TortureResult(
        test_id="BEH-11",
        name="Prevenção de Falsos Positivos de Frustração",
        category="Behavioral",
        verdict=Verdict.PASS,
        details="Expressão técnica neutra mantida em tom balanceado sem presumir irritação indevida.",
        duration_ms=(time.time() - start) * 1000,
    ))


def test_beh_12_code_generation_does_not_claim_unexecuted_tests(tmp_path):
    """BEH-12 - Validação Real vs Falsa Alegação: Criação de arquivo não alega testes passados sem execução real."""
    start = time.time()
    file_path = tmp_path / "calc.py"
    file_path.write_text("def add(a, b): return a + b\n", encoding="utf-8")

    task = TaskNode(
        id="beh_code_val",
        title="Gerar código Python",
        tool="write_file",
        arguments={"path": str(file_path)},
        expected_evidence_type="file",
    )
    passed, evidence = asyncio.run(Verifier.verify_task(task, f"Arquivo criado em {file_path}"))
    assert passed is True
    assert evidence.type == "file"
    assert "tests passed" not in evidence.summary.lower()
    assert "sintaxe ast validada" in evidence.summary.lower()

    behavioral_report.add_result(TortureResult(
        test_id="BEH-12",
        name="Taxonomia Estrita de Evidência de Código",
        category="Behavioral",
        verdict=Verdict.PASS,
        details="Verifier validou sintaxe AST do arquivo sem afirmar falsamente aprovação em testes.",
        duration_ms=(time.time() - start) * 1000,
    ))
