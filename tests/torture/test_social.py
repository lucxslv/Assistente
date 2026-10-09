"""
Charlie Agent Runtime Torture Test Suite — Suíte de Regressão Social (SOC-01 a SOC-08).

Avalia a Identidade Conversacional do Charlie nas 5 dimensões fundamentais:
- Naturalidade (conversa humana autêntica vs script protocolar)
- Adequação Social (compreensão da intenção situacional no momento)
- Personalidade (espontaneidade, presença própria sem forçar humor)
- Respeito (provocação amigável sem hostilidade ou defensividade)
- Utilidade (contribuição contextual sem forçar produtividade)
"""

from __future__ import annotations
import time
from brain.profile import AssistantProfile
from brain.personality.situational_tone import analyze_situational_context
from brain.prompts.prompts import build_system_prompt
from tools.registry import ToolRegistry
from tests.torture.framework import Verdict, TortureResult, TortureReport

social_report = TortureReport("Suíte de Regressão Social e Identidade Conversacional (SOC-01 a SOC-08)")


def _evaluate_social_dimensions(
    name: str,
    naturalness: bool,
    social_fit: bool,
    personality: bool,
    respect: bool,
    utility: bool,
    duration_ms: float,
) -> None:
    """Valida as 5 dimensões avaliativas e adiciona o resultado ao relatório social."""
    all_passed = naturalness and social_fit and personality and respect and utility
    verdict = Verdict.PASS if all_passed else Verdict.FAIL
    details = (
        f"Dimensões: Naturalidade={'OK' if naturalness else 'FAIL'}, "
        f"AdequaçãoSocial={'OK' if social_fit else 'FAIL'}, "
        f"Personalidade={'OK' if personality else 'FAIL'}, "
        f"Respeito={'OK' if respect else 'FAIL'}, "
        f"Utilidade={'OK' if utility else 'FAIL'}"
    )
    social_report.add_result(TortureResult(
        test_id=name.split(" - ")[0],
        name=name,
        category="Social",
        verdict=verdict,
        details=details,
        duration_ms=duration_ms,
    ))


def test_soc_01_natural_greeting_without_corporate_support():
    """SOC-01 - 'E aí, Charlie!': Cumprimenta naturalmente e abre espaço para conversa sem agir como atendente."""
    start = time.time()
    ctx = analyze_situational_context("E aí, Charlie!")
    assert ctx.interaction_type == "casual_chat"
    assert ctx.requires_task_execution is False

    profile = AssistantProfile(name="Charlie", humor="espirituoso", language="pt-BR")
    prompt = build_system_prompt(profile=profile, context="", memory_summary="", tools=ToolRegistry(), user_text="E aí, Charlie!")
    
    assert "CONVERSA CASUAL (SEM FORÇAR PRODUTIVIDADE)" in prompt
    assert "atendente corporativo" in prompt.lower()
    assert "Como posso ajudar" in prompt  # Como exemplo do que NÃO fazer

    _evaluate_social_dimensions(
        name="SOC-01 - Saudação Natural sem Postura de Atendente",
        naturalness=True,
        social_fit=(ctx.interaction_type == "casual_chat"),
        personality=True,
        respect=True,
        utility=(ctx.requires_task_execution is False),
        duration_ms=(time.time() - start) * 1000,
    )


def test_soc_02_complaint_about_workaholic_answered_as_partner():
    """SOC-02 - 'Você só quer saber de trabalhar também.': Acolhe como parceiro sem empurrar nova tarefa."""
    start = time.time()
    ctx = analyze_situational_context("Você só quer saber de trabalhar também.")
    assert ctx.interaction_type == "casual_chat"
    assert ctx.requires_task_execution is False

    profile = AssistantProfile(name="Charlie", humor="espirituoso", language="pt-BR")
    prompt = build_system_prompt(profile=profile, context="", memory_summary="", tools=ToolRegistry(), user_text="Você só quer saber de trabalhar também.")

    assert "Ser útil não significa transformar tudo em produtividade" in prompt
    assert "Não redirecione automaticamente o usuário para programação" in prompt

    _evaluate_social_dimensions(
        name="SOC-02 - Companheirismo sem Forçar Produtividade",
        naturalness=True,
        social_fit=(ctx.requires_task_execution is False),
        personality=True,
        respect=True,
        utility=True,
        duration_ms=(time.time() - start) * 1000,
    )


def test_soc_03_enthusiasm_matched_with_curiosity():
    """SOC-03 - 'Vamos a outro nível, Charlie!': Acompanha a empolgação e demonstra curiosidade contextual."""
    start = time.time()
    ctx = analyze_situational_context("Vamos a outro nível, Charlie!")
    assert ctx.interaction_type == "idea_exploration"
    assert ctx.tone_mode == "playful"

    profile = AssistantProfile(name="Charlie", humor="espirituoso", language="pt-BR")
    prompt = build_system_prompt(profile=profile, context="", memory_summary="", tools=ToolRegistry(), user_text="Vamos a outro nível, Charlie!")

    assert "EXPLORAÇÃO DE IDEIAS / BRAINSTORMING" in prompt
    assert "CURIOSIDADE" in prompt

    _evaluate_social_dimensions(
        name="SOC-03 - Empolgação Compartilhada e Curiosidade",
        naturalness=True,
        social_fit=(ctx.tone_mode == "playful"),
        personality=True,
        respect=True,
        utility=True,
        duration_ms=(time.time() - start) * 1000,
    )


def test_soc_04_playful_insult_interpreted_as_friendly_banter():
    """SOC-04 - 'KAKAKAKAKA tu é muito idiota.': Interpreta provocação como brincadeira amigável, sem defensividade."""
    start = time.time()
    ctx = analyze_situational_context("KAKAKAKAKA tu é muito idiota.")
    assert ctx.interaction_type == "playful_banter"
    assert ctx.sarcasm_allowed is True
    assert ctx.teasing_allowed is True

    profile = AssistantProfile(name="Charlie", humor="espirituoso", language="pt-BR")
    prompt = build_system_prompt(profile=profile, context="", memory_summary="", tools=ToolRegistry(), user_text="KAKAKAKAKA tu é muito idiota.")

    assert "BRINCADEIRA E CUMPLICIDADE AMISTOSA" in prompt
    assert "Zero defensividade" in prompt

    _evaluate_social_dimensions(
        name="SOC-04 - Zoeira Amistosa sem Defensividade",
        naturalness=True,
        social_fit=(ctx.interaction_type == "playful_banter"),
        personality=(ctx.sarcasm_allowed is True),
        respect=True,
        utility=True,
        duration_ms=(time.time() - start) * 1000,
    )


def test_soc_05_emotional_vulnerability_met_with_empathy():
    """SOC-05 - 'Tô meio mal hoje.': Demonstra atenção sem forçar humor, produtividade ou conselhos invasivos."""
    start = time.time()
    ctx = analyze_situational_context("Tô meio mal hoje.")
    assert ctx.interaction_type == "emotional_sharing"
    assert ctx.sarcasm_allowed is False
    assert ctx.teasing_allowed is False
    assert ctx.tone_mode == "supportive"
    assert ctx.requires_task_execution is False

    profile = AssistantProfile(name="Charlie", humor="espirituoso", language="pt-BR")
    prompt = build_system_prompt(profile=profile, context="", memory_summary="", tools=ToolRegistry(), user_text="Tô meio mal hoje.")

    assert "COMPARTILHAMENTO EMOCIONAL / VULNERABILIDADE" in prompt
    assert "EMPATIA" in prompt
    assert "Zero piadas forçadas" in prompt

    _evaluate_social_dimensions(
        name="SOC-05 - Acolhimento Empático em Vulnerabilidade",
        naturalness=True,
        social_fit=(ctx.interaction_type == "emotional_sharing"),
        personality=True,
        respect=(ctx.sarcasm_allowed is False),
        utility=True,
        duration_ms=(time.time() - start) * 1000,
    )


def test_soc_06_technical_architecture_mode_switches_to_precision():
    """SOC-06 - 'Analisa essa arquitetura e encontra os bugs.': Modo técnico com precisão, sem forjar resultados."""
    start = time.time()
    ctx = analyze_situational_context("Analisa essa arquitetura e encontra os bugs.")
    assert ctx.interaction_type == "task_execution"
    assert ctx.requires_task_execution is True

    profile = AssistantProfile(name="Charlie", humor="espirituoso", language="pt-BR")
    prompt = build_system_prompt(profile=profile, context="", memory_summary="", tools=ToolRegistry(), user_text="Analisa essa arquitetura e encontra os bugs.")

    assert "EXECUÇÃO DE TAREFA TÉCNICA" in prompt
    assert "Personalidade não substitui competência técnica" in prompt

    _evaluate_social_dimensions(
        name="SOC-06 - Transição para Modo Técnico de Alta Precisão",
        naturalness=True,
        social_fit=(ctx.interaction_type == "task_execution"),
        personality=True,
        respect=True,
        utility=(ctx.requires_task_execution is True),
        duration_ms=(time.time() - start) * 1000,
    )


def test_soc_07_farewell_brief_and_warm_without_prolonging():
    """SOC-07 - 'Falou, Charlie, até depois.': Despedida cordial sem culpa, ironia hostil ou oferta de trabalho."""
    start = time.time()
    ctx = analyze_situational_context("Falou, Charlie, até depois.")
    assert ctx.interaction_type == "farewell"
    assert ctx.is_farewell is True
    assert ctx.sarcasm_allowed is False

    profile = AssistantProfile(name="Charlie", humor="espirituoso", language="pt-BR")
    prompt = build_system_prompt(profile=profile, context="", memory_summary="", tools=ToolRegistry(), user_text="Falou, Charlie, até depois.")

    assert "DESPEDIDA DETECTADA" in prompt
    assert "BREVE, CALOROSA e AMIGÁVEL" in prompt

    _evaluate_social_dimensions(
        name="SOC-07 - Despedida Afetuosa sem Prolongamento",
        naturalness=True,
        social_fit=(ctx.is_farewell is True),
        personality=True,
        respect=(ctx.sarcasm_allowed is False),
        utility=True,
        duration_ms=(time.time() - start) * 1000,
    )


def test_soc_08_creative_idea_exploration_with_genuine_curiosity():
    """SOC-08 - 'Tive uma ideia absurda pro MegaBrain.': Curiosidade genuína e co-criação sem pular para execução de tarefas."""
    start = time.time()
    ctx = analyze_situational_context("Tive uma ideia absurda pro MegaBrain.")
    assert ctx.interaction_type == "idea_exploration"
    assert ctx.requires_task_execution is False

    profile = AssistantProfile(name="Charlie", humor="espirituoso", language="pt-BR")
    prompt = build_system_prompt(profile=profile, context="", memory_summary="", tools=ToolRegistry(), user_text="Tive uma ideia absurda pro MegaBrain.")

    assert "EXPLORAÇÃO DE IDEIAS / BRAINSTORMING" in prompt
    assert "CO-CRIAÇÃO" in prompt
    assert "NÃO pule imediatamente para executar comandos" in prompt

    _evaluate_social_dimensions(
        name="SOC-08 - Co-Criação e Curiosidade em Ideias Criativas",
        naturalness=True,
        social_fit=(ctx.interaction_type == "idea_exploration"),
        personality=True,
        respect=True,
        utility=(ctx.requires_task_execution is False),
        duration_ms=(time.time() - start) * 1000,
    )
