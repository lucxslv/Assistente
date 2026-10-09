"""Testes unitários para o classificador de contexto e calibração situacional de tom."""

import pytest
from brain.personality.situational_tone import (
    SituationalContext,
    analyze_situational_context,
)


def test_farewell_simple_suppresses_sarcasm():
    """Despedidas simples devem desativar sarcasmo e adotar tom acolhedor/breve."""
    for text in ["tchau", "Tchau Charlie, até amanhã", "até mais!", "boa noite!", "falou mano", "flw"]:
        ctx = analyze_situational_context(text)
        assert ctx.is_farewell is True, f"Falha ao reconhecer despedida em: '{text}'"
        assert ctx.sarcasm_allowed is False, f"Sarcasmo deve ser proibido em despedida: '{text}'"
        assert ctx.teasing_allowed is False
        assert "DESPEDIDA" in ctx.to_prompt_guidelines()


def test_frustration_suppresses_sarcasm_and_sets_focused_tone():
    """Sinais claros de frustração ou estresse devem suprimir ironias imediatamente."""
    frustrated_phrases = [
        "de novo esse erro? não aguento mais",
        "não funciona, que merda",
        "você não entendeu nada do que eu pedi",
        "já é a terceira vez que quebra aqui",
        "para com isso e resolve logo",
    ]
    for text in frustrated_phrases:
        ctx = analyze_situational_context(text)
        assert ctx.is_frustrated is True, f"Frustração não detectada em: '{text}'"
        assert ctx.sarcasm_allowed is False
        assert ctx.teasing_allowed is False
        assert ctx.tone_mode in ("serious", "supportive")
        assert "FRUSTRAÇÃO" in ctx.to_prompt_guidelines() or "RESOLUTIVO" in ctx.to_prompt_guidelines()


def test_false_positive_frustration_preserved_as_neutral_technical():
    """Frases técnicas contendo termos como 'não funciona' sem irritação não devem disparar frustração falsa."""
    neutral_phrases = [
        "esse teste não funciona ainda; vamos investigar juntos",
        "o endpoint não funciona sem o token JWT",
        "o motor de áudio parou porque o cabo desconectou",
        "vamos ver se funciona agora",
    ]
    for text in neutral_phrases:
        ctx = analyze_situational_context(text)
        assert ctx.is_frustrated is False, f"Falso positivo de frustração detectado em: '{text}'"
        assert ctx.tone_mode == "balanced"


def test_explicit_tone_request_overrides_defaults():
    """Pedidos explícitos de seriedade ou descontração devem se sobrepor ao tom padrão."""
    # Pedido de seriedade
    ctx_serio = analyze_situational_context("Charlie, seja mais sério agora. Foco total sem piadinhas.")
    assert ctx_serio.explicit_tone_request == "serious"
    assert ctx_serio.sarcasm_allowed is False
    assert ctx_serio.tone_mode == "serious"

    # Pedido de descontração
    ctx_zoeira = analyze_situational_context("Pode zoar à vontade agora, relaxa e manda ver!")
    assert ctx_zoeira.explicit_tone_request == "playful"
    assert ctx_zoeira.tone_mode == "playful"
    assert ctx_zoeira.sarcasm_allowed is True
    assert ctx_zoeira.teasing_allowed is True


def test_factual_and_political_queries_detected():
    """Consultas factuais sobre mundo real, política ou notícias devem ser catalogadas."""
    queries = [
        "quem ganhou as eleições presidenciais em 2024?",
        "qual a taxa de inflação atual no Brasil?",
        "como funciona a votação no congresso nacional?",
        "quais as últimas notícias de tecnologia hoje?",
    ]
    for text in queries:
        ctx = analyze_situational_context(text)
        assert ctx.is_factual_query is True, f"Consulta factual não detectada em: '{text}'"
        assert "FACTUAL" in ctx.to_prompt_guidelines() or "IMPARCIAL" in ctx.to_prompt_guidelines()


def test_user_correction_detected():
    """Identifica quando o usuário está corrigindo uma afirmação técnica do Charlie."""
    corrections = [
        "você errou a porta do servidor, a padrão é 8000 e não 3000",
        "esse método não existe no FastAPI, confere a doc",
        "você se enganou, o Python 3.12 removeu esse módulo",
        "tá errado isso aí, a sintaxe correta é outra",
    ]
    for text in corrections:
        ctx = analyze_situational_context(text)
        assert ctx.is_user_correction is True, f"Correção do usuário não detectada em: '{text}'"
        assert "CORREÇÃO" in ctx.to_prompt_guidelines() or "EVIDÊNCIA" in ctx.to_prompt_guidelines()


def test_repeated_failure_count_forces_serious_recovery():
    """Se o runtime reportar 2 ou mais falhas sucessivas, sarcasmo é suspenso determinísticamente."""
    ctx = analyze_situational_context("tentar compilar o módulo novamente", repeated_failures=2)
    assert ctx.repeated_failure_count == 2
    assert ctx.sarcasm_allowed is False
    assert ctx.teasing_allowed is False
    assert ctx.tone_mode == "serious"
    assert "FALHAS REPETIDAS" in ctx.to_prompt_guidelines()


def test_interaction_type_casual_chat():
    """Conversa espontânea casual não deve forçar tarefas nem agir como atendente corporativo."""
    for text in ["e aí Charlie, tudo bem contigo?", "o que você acha da vida?", "olá Charlie!", "como você tá hoje?"]:
        ctx = analyze_situational_context(text)
        assert ctx.interaction_type == "casual_chat"
        assert ctx.requires_task_execution is False
        assert ctx.requires_structured_output is False
        guidelines = ctx.to_prompt_guidelines()
        assert "PRODUTIVIDADE" in guidelines or "ATENDENTE" in guidelines or "CASUAL" in guidelines


def test_interaction_type_playful_banter():
    """Zoeira consentida e risadas recebem tom de cumplicidade sem defensividade."""
    for text in ["KAKAKAKAKA tu é muito idiota", "tu é muito bobo charlie kkk", "vamos zoar um pouco"]:
        ctx = analyze_situational_context(text)
        assert ctx.interaction_type == "playful_banter"
        assert ctx.sarcasm_allowed is True
        assert ctx.teasing_allowed is True
        assert "BRINCADEIRA" in ctx.to_prompt_guidelines() or "CUMPLICIDADE" in ctx.to_prompt_guidelines()


def test_interaction_type_idea_exploration():
    """Compartilhamento de novas ideias desperta curiosidade e co-criação sem pular para execução de tarefas."""
    for text in [
        "Tive uma ideia absurda pro MegaBrain",
        "estava pensando numa arquitetura nova para o cache",
        "e se a gente fizesse um pipeline diferente para o áudio?",
    ]:
        ctx = analyze_situational_context(text)
        assert ctx.interaction_type == "idea_exploration"
        assert ctx.requires_task_execution is False
        guidelines = ctx.to_prompt_guidelines()
        assert "CURIOSIDADE" in guidelines or "EXPLORAÇÃO" in guidelines or "CO-CRIAÇÃO" in guidelines


def test_interaction_type_emotional_sharing():
    """Desabafos pessoais e vulnerabilidade recebem empatia sem piadas forçadas ou conselhos invasivos."""
    for text in ["Tô meio mal hoje", "dia difícil cara", "estou exausto e triste hoje"]:
        ctx = analyze_situational_context(text)
        assert ctx.interaction_type == "emotional_sharing"
        assert ctx.sarcasm_allowed is False
        assert ctx.teasing_allowed is False
        assert ctx.requires_task_execution is False
        guidelines = ctx.to_prompt_guidelines()
        assert "EMPATIA" in guidelines or "ATENÇÃO" in guidelines or "ACOLHEDOR" in guidelines or "VULNERABILIDADE" in guidelines


def test_interaction_type_technical_question():
    """Questões conceituais técnicas exigem profundidade sem rigidez corporativa."""
    for text in [
        "como funciona o epoll no Linux comparado ao kqueue?",
        "qual a diferença conceitual entre thread e corrotina?",
    ]:
        ctx = analyze_situational_context(text)
        assert ctx.interaction_type == "technical_question"
        assert ctx.requires_task_execution is False
        guidelines = ctx.to_prompt_guidelines()
        assert "FORMALIDADE" in guidelines or "TÉCNICA" in guidelines


def test_interaction_type_task_execution():
    """Comandos diretos de ação configuram execução de tarefas com ferramentas."""
    for text in [
        "crie o arquivo api.py com FastAPI",
        "execute os testes do projeto",
        "refatore o componente de áudio no disco",
    ]:
        ctx = analyze_situational_context(text)
        assert ctx.interaction_type == "task_execution"
        assert ctx.requires_task_execution is True

