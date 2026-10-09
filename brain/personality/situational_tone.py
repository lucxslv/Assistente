"""Módulo de Calibração Situacional de Tom e Contexto Comportamental do Charlie.

Detecta sinais objetivos de despedida, frustração, pedidos de seriedade,
consultas factuais e correções, estabelecendo diretrizes estritas para a LLM.
"""

from __future__ import annotations
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class SituationalContext:
    """Estado situacional estruturado da interação imediata."""
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

        if self.is_farewell:
            lines.append(
                "- **DESPEDIDA DETECTADA:** O usuário está encerrando a conversa. "
                "Responda de forma BREVE, CALOROSA e AMIGÁVEL ('Valeu, até mais!', 'Bom descanso!'). "
                "É ESTRITAMENTE PROIBIDO fazer comentários irônicos, fingir ressentimento ou julgar a utilidade da conversa."
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

    # 1. Detecção de Despedida Neutra/Simples
    farewell_exact = {"tchau", "tchau!", "adeus", "flw", "falou", "valeu", "fui"}
    farewell_phrases = [
        "tchau charlie", "até mais", "ate mais", "boa noite", "falou mano",
        "até amanhã", "ate amanha", "vou dormir", "encerrar", "até logo", "ate logo"
    ]
    if (
        text_lower in farewell_exact
        or any(text_lower.startswith(fp) or text_lower.endswith(fp) for fp in farewell_phrases)
        or any(w in farewell_exact for w in words[:3])
    ):
        ctx.is_farewell = True
        ctx.sarcasm_allowed = False
        ctx.teasing_allowed = False
        ctx.tone_mode = "supportive"

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
        ctx.sarcasm_allowed = False
        ctx.teasing_allowed = False
        ctx.tone_mode = "serious"
    elif any(pt in text_lower for pt in playful_triggers) or explicit_tone_pref == "playful":
        ctx.explicit_tone_request = "playful"
        ctx.sarcasm_allowed = True
        ctx.teasing_allowed = True
        ctx.tone_mode = "playful"

    # 3. Detecção de Frustração vs Falsos Positivos Técnicos
    frustration_strong = [
        "de novo esse erro", "não aguento mais", "nao aguento mais",
        "não funciona, que merda", "nao funciona, que merda", "que bosta", "que droga",
        "já é a terceira vez", "ja e a terceira vez", "para com isso e resolve",
        "você não entendeu nada", "voce nao entendeu nada", "tá de sacanagem", "ta de sacanagem",
        "falhou tudo de novo", "quebrou tudo de novo"
    ]

    # Expressões técnicas neutras que não caracterizam irritação
    neutral_technical = [
        "não funciona ainda", "nao funciona ainda", "não funciona sem", "nao funciona sem",
        "vamos ver se funciona", "vamos investigar", "vamos testar", "teste não funciona", "teste nao funciona"
    ]

    is_neutral = any(nt in text_lower for nt in neutral_technical)

    if any(fs in text_lower for fs in frustration_strong):
        ctx.is_frustrated = True
        ctx.sarcasm_allowed = False
        ctx.teasing_allowed = False
        ctx.tone_mode = "serious"
    elif "não funciona" in text_lower or "nao funciona" in text_lower:
        if not is_neutral and any(w in text_lower for w in ["merda", "droga", "saco", "porcaria", "inferno"]):
            ctx.is_frustrated = True
            ctx.sarcasm_allowed = False
            ctx.teasing_allowed = False
            ctx.tone_mode = "serious"

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
        "ultimas noticias", "notícias de tecnologia", "quem é o atual", "quem e o atual"
    ]
    if any(ft in text_lower for ft in factual_triggers):
        ctx.is_factual_query = True

    # 6. Aplicação da Hierarquia de Prioridades
    if ctx.repeated_failure_count >= 2:
        ctx.sarcasm_allowed = False
        ctx.teasing_allowed = False
        ctx.tone_mode = "serious"
    elif ctx.is_farewell:
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
    elif ctx.explicit_tone_request == "playful":
        ctx.sarcasm_allowed = True
        ctx.teasing_allowed = True
        ctx.tone_mode = "playful"

    return ctx
