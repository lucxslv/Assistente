"""Recuperador unificado e semântico de memórias (RAG)."""

from typing import Optional
from memory.database import db


class MemoryRetriever:
    """Consolida memórias semânticas e preferências para injeção de contexto dinâmico."""

    def get_summary_context(self, query: Optional[str] = None) -> str:
        """Retorna as memórias consolidadas para injeção no system prompt.

        Se uma query for fornecida, realiza busca semântica por similaridade (RAG).
        """
        prefs = db.get_all_preferences()
        lines = []

        # 1. Preferências globais do usuário
        if prefs:
            lines.append("## Preferências Registradas do Usuário:")
            for k, v in prefs.items():
                lines.append(f"- {k}: {v}")

        # 2. Busca semântica vetorial (RAG) se houver uma consulta ativa
        relevant_memories = []
        if query and query.strip():
            matches = db.search_memories(query, limit=5, threshold=0.35)
            if matches:
                relevant_memories = [m["content"] for m in matches]

        # 3. Se não houver matches semânticos ou não houver query, usa fatos gerais
        if relevant_memories:
            lines.append("\n## Memórias Relevantes para esta Conversa (RAG):")
            for mem in relevant_memories:
                lines.append(f"- {mem}")
        else:
            facts = db.get_all_facts()
            if facts:
                lines.append("\n## Fatos Gerais Conhecidos sobre o Usuário:")
                for fact in facts[:8]:
                    lines.append(f"- {fact}")

        if not lines:
            return "Nenhuma memória registrada ainda."

        return "\n".join(lines)