"""Router Inteligente e Híbrido: Seleciona dinamicamente entre Fast LLM e Reasoning LLM."""

import enum
import logging
from dataclasses import dataclass
from typing import Optional

from brain.planner.planner import IntentCategory
from config import config

logger = logging.getLogger("charlie.brain.router")


class RouteMode(enum.Enum):
    FAST = "fast"
    REASONING = "reasoning"


@dataclass
class RouteDecision:
    mode: RouteMode
    intent: IntentCategory
    model_name: str
    provider_name: str
    reason: str


class LLMRouter:
    """Classifica a complexidade e direciona requisições para a rota ideal (Fast vs. Reasoning)."""

    FAST_GEMINI_MODEL = "gemini-3.1-flash-lite"
    REASONING_GEMINI_MODEL = "gemini-3.8-flash"

    FAST_OPENAI_MODEL = "gpt-4o-mini"
    REASONING_OPENAI_MODEL = "gpt-4o"

    FAST_GROQ_MODEL = "llama-3.3-70b-versatile"
    REASONING_GROQ_MODEL = "qwen/qwen3.8-27b"

    REASONING_KEYWORDS = [
        "analise", "analisar", "análise profunda", "explique detalhadamente",
        "passo a passo", "comparativo", "compare", "vantagens e desvantagens",
        "arquitetura", "refatore", "refatorar", "escreva um código", "código em",
        "algoritmo", "demonstre", "resolva a equação", "prove que", "por que razão",
        "redija um ensaio", "artigo científico", "plano estratégico", "faça um estudo"
    ]

    COMMAND_KEYWORDS = [
        "desligue", "desligar", "ligue", "abra", "abrir", "feche", "fechar",
        "luz", "horas", "tempo", "clima", "toca", "tocar", "toque", "música",
        "som", "pausar", "pausa", "parar", "volume", "continua", "despausa",
        "aumenta", "abaixa", "mutar", "muta", "bloqueie", "bloquear", "tela",
        "suspender", "reiniciar"
    ]

    def classify_intent(self, text: str) -> IntentCategory:
        """Classifica a categoria de intenção da mensagem."""
        normalized = text.lower()

        if any(w in normalized for w in ["código", "python", "javascript", "rust", "typescript", "bug", "erro", "função", "script", "classe"]):
            return IntentCategory.PROGRAMMING

        if any(w in normalized for w in ["calcule", "quanto é", "matemática", "raiz", "equação", "derivada", "integral"]):
            return IntentCategory.MATH

        if any(w in normalized for w in ["escreva", "crie um texto", "poema", "redação", "ensaio", "história"]):
            return IntentCategory.WRITE

        if any(w in normalized for w in self.COMMAND_KEYWORDS):
            return IntentCategory.COMMAND

        if any(w in normalized for w in ["pesquise", "pesquisar", "quem é", "quem foi", "o que é", "onde fica", "notícia", "notícias"]):
            return IntentCategory.SEARCH

        return IntentCategory.CASUAL

    def route(self, text: str, preferred_provider: Optional[str] = None) -> RouteDecision:
        """Determina a melhor rota e modelo baseado na complexidade da consulta."""
        intent = self.classify_intent(text)
        normalized = text.lower()
        provider = (preferred_provider or config.llm_provider).lower()

        is_complex = False
        reason = "Consulta casual ou comando direto (Fast Route selecionada)"

        # 1. Indicadores de alta complexidade
        if intent in (IntentCategory.PROGRAMMING, IntentCategory.MATH):
            is_complex = True
            reason = f"Intenção analítica ({intent.value}) requer raciocínio avançado"
        elif any(k in normalized for k in self.REASONING_KEYWORDS):
            is_complex = True
            reason = "Palavras-chave de raciocínio crítico detectadas"
        elif "```" in text or len(text) > 300:
            is_complex = True
            reason = "Prompt extenso ou bloco de código complexo"

        mode = RouteMode.REASONING if is_complex else RouteMode.FAST

        # Seleção do modelo baseado no provedor
        if provider == "gemini":
            model = self.REASONING_GEMINI_MODEL if mode == RouteMode.REASONING else self.FAST_GEMINI_MODEL
        elif provider == "openai":
            model = self.REASONING_OPENAI_MODEL if mode == RouteMode.REASONING else self.FAST_OPENAI_MODEL
        elif provider == "groq":
            model = self.REASONING_GROQ_MODEL if mode == RouteMode.REASONING else self.FAST_GROQ_MODEL
        else:
            model = config.gemini_model

        decision = RouteDecision(
            mode=mode,
            intent=intent,
            model_name=model,
            provider_name=provider,
            reason=reason,
        )
        logger.info(
            f"Roteamento Híbrido: [{decision.mode.value.upper()}] Modelo: {decision.model_name} "
            f"({decision.provider_name}) | Motivo: {decision.reason}"
        )
        return decision
