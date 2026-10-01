"""Context Builder — Orquestrador Dinâmico de Contexto, Personalidade e Memória.

Monta o contexto final em camadas:
1. Charlie Core (Identidade e traços permanentes)
2. User Model (Expressão comportamental adaptada ao usuário)
3. Working Memory (Estado imediato, tópicos e tom da conversa)
4. Contexto Temporal e Ambiental (Fuso, clima, data, presença)
5. Memórias Selecionadas (RAG semântico e episódico filtrado por relevância)
6. Ferramentas Disponíveis
"""

import logging
from typing import Optional
from brain.context.manager import ContextManager
from brain.memory.working_memory import WorkingMemory, working_memory_store
from brain.personality.charlie_core import charlie_core
from brain.personality.user_model import UserModel, user_model_manager
from memory.retrieval.retriever import MemoryRetriever
from tools.registry import ToolRegistry

logger = logging.getLogger("charlie.brain.context_builder")


class ContextBuilder:
    """Construtor inteligente do System Prompt adaptativo do Charlie."""

    def __init__(self):
        self.retriever = MemoryRetriever()

    def detect_situational_tone(self, user_text: str, working_memory: WorkingMemory) -> str:
        """Identifica modulação situacional rápida (ex: emergência, frustração, humor)."""
        lower = user_text.lower()
        if any(w in lower for w in ["socorro", "urgente", "deu ruim", "falhou tudo", "quebrou", "erro grave", "merda"]):
            return "urgent_serious"
        if any(w in lower for w in ["kkk", "haha", "rsrs", "mano do ceu", "zoeira", "brincadeira"]):
            return "playful"
        if any(w in lower for w in ["como funciona", "arquitetura", "código", "função", "algoritmo", "debug"]):
            return "technical"
        return working_memory.emotional_tone or "casual"

    def build_system_prompt(
        self,
        user_text: str,
        user_id: str = "default",
        thread_id: Optional[str] = None,
        user_name: Optional[str] = None,
        context_manager: Optional[ContextManager] = None,
        tools: Optional[ToolRegistry] = None,
    ) -> str:
        """Monta o prompt completo unindo Core, UserModel, Working Memory, RAG e Ferramentas."""

        # 1. Carrega modelo do usuário e memória de trabalho
        user_model = user_model_manager.get_user_model(user_id=user_id)
        working_memory = working_memory_store.get(thread_id=thread_id)

        # 2. Modulação situacional (Personalidade Contextual)
        situational_tone = self.detect_situational_tone(user_text, working_memory)
        working_memory.update(tone=situational_tone)

        # 3. Contexto ambiental / temporal
        env_context = ""
        if context_manager:
            env_context = context_manager.build_context(active_thread_id=thread_id, user_name=user_name)

        # 4. Memória RAG (Semântica + Episódica)
        memory_summary = self.retriever.get_summary_context(query=user_text, user_id=user_id)

        # 5. Lista de Ferramentas
        tools_list = ", ".join(tools.list_tools()) if tools else "Nenhuma ferramenta disponível."

        # 6. Bloco de Modulação Situacional
        contextual_note = ""
        if situational_tone == "urgent_serious":
            contextual_note = (
                "\n> [!IMPORTANT]\n"
                "> **AJUSTE SITUACIONAL DE TOM (URGÊNCIA/PROBLEMA):** O usuário está lidando com uma situação crítica ou erro. "
                "Suspenda ironias e brincadeiras agora. Seja 100% resolutivo, claro e ágil.\n"
            )
        elif situational_tone == "playful":
            contextual_note = (
                "\n> **AJUSTE SITUACIONAL:** O usuário está em clima descontraído e bem-humorado. "
                "A cumplicidade, ironia sutil e humor característico do Charlie têm espaço total para brilhar.\n"
            )

        # Montagem hierárquica
        prompt = f"""{charlie_core.get_core_prompt_summary()}

---

{user_model.format_adaptation_prompt(core=charlie_core)}
{contextual_note}

---

# CONTEXTO AMBIENTAL & TEMPORAL
{env_context}

{working_memory.format_for_prompt()}

---

# MEMÓRIAS SELECIONADAS DO USUÁRIO (RAG)
{memory_summary}

---

# FERRAMENTAS DISPONÍVEIS
Você possui acesso às seguintes ferramentas de ação e consulta: {tools_list}.
Para usá-las, basta disparar chamadas de função com os parâmetros adequados.
- Ao executar ferramentas locais ou de mídia, responda com naturalidade e concisão após a conclusão.
- Nunca exponha arquivos internos do servidor em nuvem ou comandos de terminal de containers.

# REGRA DE OURO
Se houver conflito entre personalidade e utilidade, escolha utilidade.
Charlie é um parceiro autêntico e inteligente: cumplicidade leal sem forçar a barra.
"""
        return prompt


# Instância global compartilhada
context_builder = ContextBuilder()
