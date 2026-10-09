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
    AGENTIC = "agentic"


@dataclass
class RouteDecision:
    mode: RouteMode
    intent: IntentCategory
    model_name: str
    provider_name: str
    reason: str


class LLMRouter:
    """Classifica a complexidade e direciona requisições para a rota ideal (Fast vs. Reasoning vs. Agentic)."""

    FAST_GEMINI_MODEL = "gemini-3.5-flash-lite"
    REASONING_GEMINI_MODEL = "gemini-3.8-flash"
    AGENTIC_GEMINI_MODEL = "gemini-3.8-flash"

    FAST_OPENAI_MODEL = "gpt-4o-mini"
    REASONING_OPENAI_MODEL = "gpt-4o"
    AGENTIC_OPENAI_MODEL = "gpt-4o"

    FAST_GROQ_MODEL = "llama-3.3-70b-versatile"
    REASONING_GROQ_MODEL = "qwen/qwen3.8-27b"
    AGENTIC_GROQ_MODEL = "llama-3.3-70b-versatile"

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

    AGENTIC_TRIGGERS = [
        "crie e teste", "crie um script e", "baixe e analise", "pesquise e resuma",
        "instale e configure", "configure e rode", "automatize", "faça um backup e",
        "desenvolva e teste", "execute o plano", "plano de execução", "modo agente",
        "tarefa completa", "resolva de ponta a ponta", "de ponta a ponta",
        "investigue e", "corrija e", "encontre e corrija", "analise e corrija",
        "configure e suba", "clone e configure", "clone o repositorio",
        # Metas de desenvolvimento, codificação e criação de projetos
        "crie uma landing page", "crie uma landing", "crie um site", "crie uma página",
        "crie uma pagina", "crie os arquivos", "crie o arquivo", "crie um projeto",
        "desenvolva uma página", "desenvolva um site", "desenvolva o código", "crie o código",
        "programe uma", "crie um script", "crie uma aplicação", "crie um app",
        "construa uma landing", "construa um site", "faça uma landing page"
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

    def is_agentic_task(self, text: str) -> bool:
        """Identifica se a requisição é um objetivo multi-etapas autônomo que exige o Agent Runtime."""
        normalized = text.lower()
        import re

        # Se for manifestamente ambíguo sem contexto, não deve virar plano agêntico cego
        if self.is_ambiguous_request(text):
            return False

        # Gatilhos diretos de ação encadeada
        if any(trigger in normalized for trigger in self.AGENTIC_TRIGGERS):
            return True

        # Padrão de codificação/criação de arquivos e páginas em diretórios
        file_creation_pattern = r"\b(crie|gere|escreva|desenvolva|faça|construa)\b.*\b(index\.html|style\.css|\.html|\.css|\.js|\.ts|\.py|landing|site|página|pagina|arquivos|projeto)\b"
        if re.search(file_creation_pattern, normalized) and ("pasta" in normalized or "diretório" in normalized or "diretorio" in normalized or "em " in normalized or "na " in normalized or "no " in normalized):
            return True

        # Heurística de verbos encadeados com conjunção ("crie ... e agende", "baixe ... e salve", "corrija ... e rode")
        chain_connectors = [
            " e depois ", " e em seguida ", " e teste ", " e salve ", " e execute ",
            " e agende ", " e configure ", " e rode ", " e inicie ", " e suba ",
            " e valide ", " e verifique ", " e reinicie ", " e pare ", " e publique ",
            " e escreva ", " e coloque ", " e crie ", " e adicione ", " e corrija "
        ]
        if any(conn in normalized for conn in chain_connectors):
            return True

        # Múltiplas etapas com vírgula e conjunção (ex: "Crie uma pasta..., coloque um arquivo... e escreva...")
        action_verbs = [
            "crie", "cria", "coloque", "escreva", "salve", "rode", "execute", "teste",
            "valide", "verifique", "instale", "configure", "compile", "analise", "corrija", "investigue"
        ]
        verb_matches = sum(1 for v in action_verbs if re.search(rf"\b{v}\b", normalized))
        if verb_matches >= 2 and ("," in normalized or " e " in normalized):
            return True

        # Padrão regex para múltiplos verbos operacionais encadeados ou condicionais
        chained_action_pattern = r"\b(crie|baixe|instale|clone|configure|analise|investigue|corrija|encontre)\b.*\b(e|depois|em seguida|se encontrar)\b\s+.*(rode|teste|reinicie|execute|suba|salve|valide|inicie|crie|configure|publique|corrija|coloque|escreva)\b"
        if re.search(chained_action_pattern, normalized):
            return True

        # Padrões explícitos de meta
        if normalized.startswith("meta:") or normalized.startswith("objetivo:"):
            return True

        # Múltiplas etapas ordenadas no texto
        step_indicators = ["primeiro,", "em seguida,", "depois,", "por fim,"]
        matches = sum(1 for s in step_indicators if s in normalized)
        if matches >= 2:
            return True

        return False

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

        is_agentic = self.is_agentic_task(text)
        is_complex = False
        reason = "Consulta casual ou comando direto (Fast Route selecionada)"

        if is_agentic:
            mode = RouteMode.AGENTIC
            reason = "Objetivo multi-etapas autônomo detectado (Fluxo Agêntico DAG ativado)"
        else:
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
            if mode == RouteMode.AGENTIC:
                model = self.AGENTIC_GEMINI_MODEL
            elif mode == RouteMode.REASONING:
                model = self.REASONING_GEMINI_MODEL
            else:
                model = self.FAST_GEMINI_MODEL
        elif provider == "openai":
            if mode == RouteMode.AGENTIC:
                model = self.AGENTIC_OPENAI_MODEL
            elif mode == RouteMode.REASONING:
                model = self.REASONING_OPENAI_MODEL
            else:
                model = self.FAST_OPENAI_MODEL
        elif provider == "groq":
            if mode == RouteMode.AGENTIC:
                model = self.AGENTIC_GROQ_MODEL
            elif mode == RouteMode.REASONING:
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


# Instância singleton global do Router e helper direto
router = LLMRouter()


def is_agentic_task(text: str) -> bool:
    """Helper global para verificar se uma intenção exige orquestração agêntica."""
    return router.is_agentic_task(text)

