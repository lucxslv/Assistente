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

    FAST_GEMINI_MODEL = "gemini-3.5-flash-lite"
    REASONING_GEMINI_MODEL = "gemini-3.5-flash"
    AGENTIC_GEMINI_MODEL = "gemini-3.5-flash"

    FAST_OPENAI_MODEL = "gpt-4o-mini"
    REASONING_OPENAI_MODEL = "gpt-4o"
    # AGENTIC_OPENAI_MODEL = "gpt-4o"  # REMOVIDO - modo agêntico removido

    FAST_GROQ_MODEL = "llama-3.3-70b-versatile"
    REASONING_GROQ_MODEL = "llama-3.3-70b-versatile"
    # AGENTIC_GROQ_MODEL = "llama-3.3-70b-versatile"  # REMOVIDO - modo agêntico removido

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



    def is_ambiguous_request(self, text: str) -> bool:
        """Detecta solicitações ultra-ambíguas e sem contexto suficiente que exigem esclarecimento."""
        cleaned = text.strip().lower().rstrip("!?.")
        ambiguous_patterns = {
            "arruma isso", "arruma", "arrume isso", "arrume aí", "arruma aí",
            "conserta isso", "conserta", "conserta aí", "corrige isso", "corrige aí",
            "faz isso", "faz aí", "faça isso", "resolve isso", "resolve aí",
            "olha isso", "ajeita isso", "dá um jeito", "da um jeito"
        }
        return cleaned in ambiguous_patterns



    def classify_intent(self, text: str) -> IntentCategory:
        """Classifica a categoria de intenção da mensagem."""
        normalized = text.lower()

        programming_keywords = [
            "código", "codigo", "python", "javascript", "rust", "typescript", "html", "css",
            "landing page", "landing", "site", "web", "bug", "erro", "função", "script",
            "classe", "index.html", "style.css", "programe", "programar", "codar", "code",
            "desenvolva", "desenvolver", "frontend", "backend", "api", "componente", "scaffold",
            "aplicação", "aplicacao", "app", "repositório", "repositorio", "arquivo", "arquivos"
        ]
        if any(w in normalized for w in programming_keywords):
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

        # Seleção do modelo baseado no provedor e rota
        if provider == "gemini":
            if mode == RouteMode.REASONING:
                model = self.REASONING_GEMINI_MODEL
            else:
                model = self.FAST_GEMINI_MODEL
        elif provider == "openai":
            if mode == RouteMode.REASONING:
                model = self.REASONING_OPENAI_MODEL
            else:
                model = self.FAST_OPENAI_MODEL
        elif provider == "groq":
            if mode == RouteMode.REASONING:
                model = self.REASONING_GROQ_MODEL
            else:
                model = self.FAST_GROQ_MODEL
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

    def get_fallback_chain(self, decision: RouteDecision) -> list[tuple[str, str]]:
        """Retorna lista ordenada de candidatos (provider_name, model_name) para fallback real."""
        candidates: list[tuple[str, str]] = []
        primary = (decision.provider_name.lower(), decision.model_name)

        # 1. Modelos alternativos dentro do próprio provedor Gemini (modelos válidos atuais)
        if decision.provider_name.lower() == "gemini":
            alt_gemini = (
                self.FAST_GEMINI_MODEL
                if decision.model_name != self.FAST_GEMINI_MODEL
                else self.REASONING_GEMINI_MODEL
            )
            candidates.append(("gemini", alt_gemini))
            # Adicionar modelos 3.x válidos como fallback adicional
            for valid_model in ("gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.8-flash-lite"):
                if valid_model not in (decision.model_name, alt_gemini):
                    candidates.append(("gemini", valid_model))

        # 2. Provedor alternativo Groq se chave estiver configurada
        if getattr(config, "groq_api_key", None):
            candidates.append(("groq", self.FAST_GROQ_MODEL))

        # 3. Provedor alternativo OpenAI se chave estiver configurada
        if getattr(config, "openai_api_key", None):
            candidates.append(("openai", self.FAST_OPENAI_MODEL))

        # 4. Provedor Gemini caso o primário tenha sido outro provedor
        if decision.provider_name.lower() != "gemini" and getattr(config, "gemini_api_key", None):
            candidates.append(("gemini", self.FAST_GEMINI_MODEL))

        return [c for c in candidates if c != primary]


# Instância singleton global do Router e helper direto
router = LLMRouter()


def is_agentic_task(text: str) -> bool:
    """Helper global — mantido para compatibilidade, sempre retorna False (modo agêntico removido)."""
    return False

