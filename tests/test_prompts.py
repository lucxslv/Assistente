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
