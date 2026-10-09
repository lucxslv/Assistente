"""Testes para o construtor dinâmico de prompts do sistema."""

import pytest
from brain.profile import AssistantProfile
from brain.prompts.prompts import build_system_prompt
from tools.registry import ToolRegistry


@pytest.fixture
def base_profile():
    return AssistantProfile(name="Charlie", humor="espirituoso", language="pt-BR")


@pytest.fixture
def empty_tools():
    return ToolRegistry()


def test_prompt_farewell_injects_warm_and_brief_rules(base_profile, empty_tools):
    """Mensagens de despedida devem injetar regras estritas contra deboche."""
    prompt = build_system_prompt(
        profile=base_profile,
        context="",
        memory_summary="",
        tools=empty_tools,
        user_text="tchau Charlie, até amanhã!",
    )
    assert "DESPEDIDA DETECTADA" in prompt
    assert "BREVE, CALOROSA e AMIGÁVEL" in prompt
    assert "ESTRITAMENTE PROIBIDO fazer comentários irônicos" in prompt


def test_prompt_frustration_suppresses_sarcasm(base_profile, empty_tools):
    """Mensagens de frustração devem desativar sarcasmo e ordenar postura ágil e acolhedora."""
    prompt = build_system_prompt(
        profile=base_profile,
        context="",
        memory_summary="",
        tools=empty_tools,
        user_text="de novo esse erro? não aguento mais, resolve isso",
    )
    assert "SINAIS DE FRUSTRAÇÃO / ESTRESSE TÉCNICO" in prompt
    assert "Zero sarcasmo, zero ironia" in prompt
    assert "RESOLUTIVO" in prompt


def test_prompt_explicit_seriousness_eliminates_jokes(base_profile, empty_tools):
    """Pedido explícito de seriedade deve banir piadas e exigir objetividade."""
    prompt = build_system_prompt(
        profile=base_profile,
        context="",
        memory_summary="",
        tools=empty_tools,
        user_text="Por favor, seja sério e objetivo agora. Sem piadinhas.",
    )
    assert "SOLICITAÇÃO EXPLÍCITA DE SERIEDADE" in prompt
    assert "Elimine qualquer piada" in prompt


def test_prompt_repeated_failures_instructs_material_pivot(base_profile, empty_tools):
    """Falhas repetidas no ciclo operacional devem injetar instrução de pivot de estratégia."""
    prompt = build_system_prompt(
        profile=base_profile,
        context="",
        memory_summary="",
        tools=empty_tools,
        user_text="tentando compilar de novo",
        repeated_failures=2,
    )
    assert "FALHAS REPETIDAS DETECTADAS" in prompt
    assert "Mude materialmente de estratégia" in prompt


def test_prompt_contains_canonical_creator_and_identity_hierarchy(base_profile, empty_tools):
    """Garante que a diretriz de identidade canônica está presente no prompt."""
    prompt = build_system_prompt(
        profile=base_profile,
        context="",
        memory_summary="",
        tools=empty_tools,
        user_text="Olá Charlie",
    )
    assert "IDENTIDADE CANÔNICA E AUTORIDADE" in prompt
    assert "Lucas" in prompt
    assert "Identidade Declarada vs. Canônica" in prompt


def test_prompt_contains_7_innegotiable_principles(base_profile, empty_tools):
    """Garante que os princípios inegociáveis de identidade conversacional estão presentes."""
    prompt = build_system_prompt(
        profile=base_profile,
        context="",
        memory_summary="",
        tools=empty_tools,
        user_text="Olá",
    )
    assert "Personalidade não substitui competência técnica" in prompt
    assert "Competência técnica não exige formalidade constante" in prompt
    assert "Ser direto não significa ser hostil" in prompt
    assert "Ser útil não significa transformar tudo em produtividade" in prompt


def test_prompt_casual_chat_forbids_corporate_support_and_forced_structure(base_profile, empty_tools):
    """Garante que conversas casuais proíbem atitude de atendente e listas forçadas."""
    prompt = build_system_prompt(
        profile=base_profile,
        context="",
        memory_summary="",
        tools=empty_tools,
        user_text="e aí Charlie, tudo bem contigo?",
    )
    assert "CONVERSA CASUAL (SEM FORÇAR PRODUTIVIDADE)" in prompt
    assert "atendente corporativo" in prompt.lower()
    assert "listas de tarefas" in prompt.lower()


def test_prompt_idea_exploration_instructs_cocreation(base_profile, empty_tools):
    """Garante que compartilhamento de ideias recebe estímulo de curiosidade e co-criação."""
    prompt = build_system_prompt(
        profile=base_profile,
        context="",
        memory_summary="",
        tools=empty_tools,
        user_text="Tive uma ideia absurda pro MegaBrain",
    )
    assert "EXPLORAÇÃO DE IDEIAS / BRAINSTORMING" in prompt
    assert "CURIOSIDADE" in prompt
    assert "CO-CRIAÇÃO" in prompt


def test_prompt_injects_technical_honesty_and_completeness(base_profile, empty_tools):
    """Garante que o prompt injeta diretrizes de honestidade técnica e precisão de código."""
    prompt = build_system_prompt(
        profile=base_profile,
        context="",
        memory_summary="",
        tools=empty_tools,
        user_text="Como implementar Result em TypeScript?",
    )
    assert "VERIFICAÇÃO TÉCNICA HONESTA E SEM AFIRMAÇÕES FALSAS" in prompt
    assert "CÓDIGO GERADO NO CHAT É UMA PROPOSTA CONCEITUAL" in prompt
    assert "CORRESPONDÊNCIA 1:1 ENTRE EXPLICAÇÃO E CÓDIGO" in prompt
    assert "AUTOCONTENÇÃO E PRECISÃO DE TIPOS" in prompt


