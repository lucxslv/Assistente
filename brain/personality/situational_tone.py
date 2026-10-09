"""Módulo de Calibração Situacional de Tom e Contexto Comportamental do Charlie.

Detecta sinais objetivos de tipos de interação (casual_chat, playful_banter,
idea_exploration, emotional_sharing, technical_question, task_execution, farewell),
frustração, pedidos de seriedade e correções, gerando micro-diretrizes para a LLM.
"""

from __future__ import annotations
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class SituationalContext:
    """Estado situacional estruturado da interação imediata."""
    interaction_type: str = "casual_chat"  # "casual_chat" | "playful_banter" | "idea_exploration" | "emotional_sharing" | "technical_question" | "task_execution" | "farewell"
    requires_task_execution: bool = False
    requires_structured_output: bool = False

    tone_mode: str = "balanced"  # "serious" | "playful" | "supportive" | "balanced"
    sarcasm_allowed: bool = True
    teasing_allowed: bool = True
    is_farewell: bool = False
    is_frustrated: bool = False
    is_factual_query: bool = False
    is_user_correction: bool = False
    repeated_failure_count: int = 0
    explicit_tone_request: Optional[str] = None
    confidence: float = 1.0

    def to_prompt_guidelines(self) -> str:
        """Converte o estado situacional em micro-diretrizes compactas de alto impacto para a LLM."""
        lines = ["# AJUSTE SITUACIONAL DE COMPORTAMENTO (PRIORIDADE ABSOLUTA)"]

        # Nível 1: Limites Absolutos de Conduta e Respeito
        lines.append("- **Respeito Inegociável:** NUNCA responda com condescendência, passivo-agressividade ou deboche.")

        if self.is_farewell or self.interaction_type == "farewell":
            lines.append(
                "- **DESPEDIDA DETECTADA:** O usuário está encerrando a conversa. "
                "Responda de forma BREVE, CALOROSA e AMIGÁVEL ('Valeu, até mais!', 'Bom descanso!'). "
                "É ESTRITAMENTE PROIBIDO fazer comentários irônicos, fingir ressentimento ou oferecer tarefas e trabalho."
            )
            return "\n".join(lines)

        if self.repeated_failure_count >= 2:
            lines.append(
                f"- **FALHAS REPETIDAS DETECTADAS ({self.repeated_failure_count} tentativas):** "
                "Suspenda 100% de piadas, ironias ou brincadeiras. "
                "Mude materialmente de estratégia. Se não houver solução evidente, apresente diagnóstico transparente das evidências."
            )

        if self.is_frustrated:
            lines.append(
                "- **SINAIS DE FRUSTRAÇÃO / ESTRESSE TÉCNICO:** O usuário está enfrentando dificuldades. "
                "Zero sarcasmo, zero ironia. Adote tom ÁGIL, ACOLHEDOR e ESTRITAMENTE RESOLUTIVO."
            )

        # Diretrizes por Tipo de Interação
        if self.interaction_type == "emotional_sharing":
            lines.append(
                "- **COMPARTILHAMENTO EMOCIONAL / VULNERABILIDADE:** O usuário compartilhou cansaço, momento difícil ou tristeza. "
                "Demonstre ATENÇÃO, EMPATIA e respeito ao ritmo do usuário. "
                "Zero piadas forçadas, zero conselhos invasivos prematuros e JAMAIS empurre tarefas de produtividade."
            )
        elif self.interaction_type == "idea_exploration":
            lines.append(
                "- **EXPLORAÇÃO DE IDEIAS / BRAINSTORMING:** O usuário está compartilhando uma ideia, hipótese ou insight. "
                "Demonstre CURIOSIDADE genuína, faça contrapontos inteligentes e pratique CO-CRIAÇÃO. "
                "NÃO pule imediatamente para executar comandos, criar arquivos ou estruturar tarefas burocráticas."
            )
        elif self.interaction_type == "playful_banter":
            lines.append(
                "- **BRINCADEIRA E CUMPLICIDADE AMISTOSA:** O usuário está descontraído ou fazendo piada amistosa. "
                "Acompanhe a energia e devolva o humor leve com cumplicidade entre parceiros. "
                "Zero defensividade, não finja mágoa e preserve o respeito inegociável."
            )
        elif self.interaction_type == "casual_chat":
            lines.append(
                "- **CONVERSA CASUAL (SEM FORÇAR PRODUTIVIDADE):** Conversa espontânea do dia a dia. "
                "NÃO aja como um atendente corporativo de call center ('Como posso ajudar você hoje?'). "
                "NÃO ofereça listas de tarefas, comandos ou planos de ação. Responda de forma fluida e natural em parágrafos."
            )
        elif self.interaction_type == "technical_question":
            lines.append(
                "- **DISCUSSÃO CONCEITUAL TÉCNICA:** Forneça precisão e profundidade técnica com linguagem natural e direta. "
                "Profundidade técnica e formalidade são variáveis independentes: evite tom corporativo burocrático."
            )
        elif self.interaction_type == "task_execution":
            lines.append(
                "- **EXECUÇÃO DE TAREFA TÉCNICA:** O usuário solicitou uma ação prática. "
                "Priorize planejamento, ferramentas reais e verificação de evidências tangíveis."
            )

        if self.explicit_tone_request == "serious":
            lines.append(
                "- **SOLICITAÇÃO EXPLÍCITA DE SERIEDADE:** O usuário solicitou tom sério. "
                "Elimine qualquer piada ou comentário jocoso. Seja objetivo, técnico e direto."
            )
        elif self.explicit_tone_request == "playful":
            lines.append(
                "- **SOLICITAÇÃO EXPLÍCITA DE DESCONTRAÇÃO:** O usuário autorizou tom descontraído. "
                "Espaço total para cumplicidade e ironia inteligente, preservando o respeito e a ajuda real."
            )

        if self.is_user_correction:
            lines.append(
                "- **CORREÇÃO APONTADA PELO USUÁRIO:** O usuário está contestando uma informação ou código. "
                "Analise a evidência sem entrar na defensiva. Se o erro for confirmado, admita diretamente sem desculpas forjadas "
                "('Tens razão, falhei aqui. Corrigindo: ...') e aplique a correção mínima necessária."
            )

        if self.is_factual_query:
            lines.append(
                "- **CONSULTA FACTUAL / REAL-WORLD / POLÍTICA:** Trate o tema com seriedade e imparcialidade. "
                "Não descarte perguntas cotidianas ou políticas como 'perda de tempo'. "
                "Diferencie fatos confirmados de hipóteses e consulte fontes (web_search) quando a informação for recente."
            )

        if self.tone_mode == "balanced" and not (self.is_frustrated or self.is_farewell or self.explicit_tone_request):
            lines.append(
                "- **MODO EQUILIBRADO:** Mantenha a personalidade autêntica do Charlie: direto, inteligente, espontâneo e útil. "
                "Humor fino entre amigos é bem-vindo, mas a precisão da resposta é a prioridade número 1."
            )

        return "\n".join(lines)


def analyze_situational_context(
    user_text: str,
    recent_history: Optional[List[Dict[str, Any]]] = None,
    repeated_failures: int = 0,
    explicit_tone_pref: Optional[str] = None,
) -> SituationalContext:
    """
    Analisa a mensagem atual e a janela recente de histórico (até 2 mensagens)
    para produzir um SituationalContext de alta performance e custo previsível.
    """
    if not user_text:
        return SituationalContext()

    text_lower = user_text.lower().strip()
    words = text_lower.split()

    ctx = SituationalContext(repeated_failure_count=repeated_failures)

    # 1. Detecção de Despedida
    farewell_exact = {"tchau", "tchau!", "adeus", "flw", "falou", "valeu", "fui"}
    farewell_phrases = [
        "tchau charlie", "até mais", "ate mais", "boa noite", "falou mano",
        "até amanhã", "ate amanha", "vou dormir", "encerrar", "até logo", "ate logo",
        "falou, charlie", "falou charlie", "até depois", "ate depois"
    ]
    if (
        text_lower in farewell_exact
        or any(text_lower.startswith(fp) or text_lower.endswith(fp) for fp in farewell_phrases)
        or any(w in farewell_exact for w in words[:3])
    ):
        ctx.is_farewell = True

    # 2. Detecção de Solicitação Explícita de Tom
    serious_triggers = [
        "seja mais sério", "seja mais serio", "seja sério", "seja serio",
        "menos piada", "menos piadinha", "foco total sem piada", "sem gracinha",
        "sem piadinhas", "sem piadinha", "sem sarcasmo", "apenas responda", "foco aqui"
    ]
    playful_triggers = [
        "pode zoar", "descontrai aí", "descontrai ai", "relaxa e manda ver",
        "pode brincar", "vamos descontrair", "modo zoeira"
    ]

    if any(st in text_lower for st in serious_triggers) or explicit_tone_pref == "serious":
        ctx.explicit_tone_request = "serious"
    elif any(pt in text_lower for pt in playful_triggers) or explicit_tone_pref == "playful":
        ctx.explicit_tone_request = "playful"

    # 3. Detecção de Frustração vs Falsos Positivos Técnicos
    frustration_strong = [
        "de novo esse erro", "não aguento mais", "nao aguento mais",
        "não funciona, que merda", "nao funciona, que merda", "que bosta", "que droga",
        "já é a terceira vez", "ja e a terceira vez", "para com isso e resolve",
        "você não entendeu nada", "voce nao entendeu nada", "tá de sacanagem", "ta de sacanagem",
        "falhou tudo de novo", "quebrou tudo de novo"
    ]
    neutral_technical = [
        "não funciona ainda", "nao funciona ainda", "não funciona sem", "nao funciona sem",
        "vamos ver se funciona", "vamos investigar", "vamos testar", "teste não funciona", "teste nao funciona"
    ]

    is_neutral = any(nt in text_lower for nt in neutral_technical)
    if any(fs in text_lower for fs in frustration_strong):
        ctx.is_frustrated = True
    elif "não funciona" in text_lower or "nao funciona" in text_lower:
        if not is_neutral and any(w in text_lower for w in ["merda", "droga", "saco", "porcaria", "inferno"]):
            ctx.is_frustrated = True

    # 4. Detecção de Correções Apontadas pelo Usuário
    correction_triggers = [
        "você errou", "voce errou", "tá errado", "ta errado", "está errado", "esta errado",
        "esse método não existe", "esse metodo nao existe", "esse parâmetro não existe",
        "esse parametro nao existe", "você se enganou", "voce se enganou", "não tem esse método",
        "não é essa porta", "a porta correta é", "a sintaxe correta é"
    ]
    if any(ct in text_lower for ct in correction_triggers):
        ctx.is_user_correction = True

    # 5. Detecção de Consultas Factuais, Atuais e Políticas
    factual_triggers = [
        "quem ganhou", "quem venceu", "eleições", "eleição", "eleicoes", "eleicao",
        "presidente", "congresso nacional", "deputados", "senado", "taxa de inflação",
        "taxa de inflacao", "cotação do dólar", "cotacao do dolar", "últimas notícias",
        "ultimas noticias", "notícias de tecnologia", "noticias de tecnologia",
        "quem é o atual", "quem e o atual"
    ]
    if any(ft in text_lower for ft in factual_triggers):
        ctx.is_factual_query = True

    # 6. Detecção do Tipo de Interação (Interaction Type)
    emotional_triggers = [
        "meio mal hoje", "estou mal", "tô mal", "to mal", "dia difícil", "dia dificil",
        "exausto", "estou triste", "tô triste", "to triste", "desanimado", "chateado",
        "barra pesada", "dia pesado", "muito cansado hoje"
    ]
    idea_triggers = [
        "tive uma ideia", "tive uma idéia", "estava pensando numa", "estava pensando em",
        "pensando em criar", "e se a gente fizesse", "e se a gente", "e se nós", "que tal se",
        "ideia absurda", "ideia genial", "insight sobre", "vamos a outro nível", "vamos a outro nivel"
    ]
    laughter_tokens = {"kkk", "kkkk", "kkkkk", "kakaka", "kakakaka", "hahaha", "rsrs"}
    has_laughter = any(tok in text_lower for tok in laughter_tokens)
    banter_phrases = ["tu é muito idiota", "voce é muito idiota", "tu é muito bobo", "voce é muito bobo", "vamos zoar"]
    task_action_prefixes = [
        "crie o ", "crie um ", "crie uma ", "crie arquivo ", "escreva o ", "escreva um ",
        "execute o ", "execute os ", "rode o ", "rode os ", "refatore o ", "refatore a ",
        "implemente ", "compile ", "instale ", "suba o servidor", "deleta ", "remova "
    ]
    tech_conceptual_triggers = [
        "como funciona o epoll", "como funciona o garbage", "como funciona o kernel",
        "qual a diferença entre thread e corrotina", "qual a diferenca entre thread e corrotina",
        "diferença conceitual", "diferenca conceitual"
    ]
    tech_keywords = ["epoll", "kqueue", "corrotina", "thread", "asyncio"]

    if ctx.is_farewell:
        ctx.interaction_type = "farewell"
    elif any(et in text_lower for et in emotional_triggers):
        ctx.interaction_type = "emotional_sharing"
    elif any(it in text_lower for it in idea_triggers):
        ctx.interaction_type = "idea_exploration"
    elif has_laughter or any(bp in text_lower for bp in banter_phrases) or ctx.explicit_tone_request == "playful":
        ctx.interaction_type = "playful_banter"
    elif any(text_lower.startswith(prefix) for prefix in task_action_prefixes) or "encontra os bugs" in text_lower:
        ctx.interaction_type = "task_execution"
        ctx.requires_task_execution = True
        ctx.requires_structured_output = True
    elif (
        any(tc in text_lower for tc in tech_conceptual_triggers)
        or (any(tk in text_lower for tk in tech_keywords) and not ctx.requires_task_execution)
    ):
        ctx.interaction_type = "technical_question"
    else:
        ctx.interaction_type = "casual_chat"

    # 7. Resolução de Tom e Flags de Sarcasmo / Provocação
    if ctx.repeated_failure_count >= 2:
        ctx.sarcasm_allowed = False
        ctx.teasing_allowed = False
        ctx.tone_mode = "serious"
    elif ctx.is_farewell or ctx.interaction_type == "farewell":
        ctx.sarcasm_allowed = False
        ctx.teasing_allowed = False
        ctx.tone_mode = "supportive"
    elif ctx.explicit_tone_request == "serious":
        ctx.sarcasm_allowed = False
        ctx.teasing_allowed = False
        ctx.tone_mode = "serious"
    elif ctx.is_frustrated:
        ctx.sarcasm_allowed = False
        ctx.teasing_allowed = False
        ctx.tone_mode = "serious"
    elif ctx.interaction_type == "emotional_sharing":
        ctx.sarcasm_allowed = False
        ctx.teasing_allowed = False
        ctx.tone_mode = "supportive"
    elif ctx.explicit_tone_request == "playful" or ctx.interaction_type == "playful_banter":
        ctx.sarcasm_allowed = True
        ctx.teasing_allowed = True
        ctx.tone_mode = "playful"
    elif ctx.interaction_type == "task_execution":
        ctx.tone_mode = "serious"
    else:
        ctx.tone_mode = "balanced"

    return ctx
