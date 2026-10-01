"""Recuperador unificado e semântico de memórias (RAG).

Separa estritamente a recuperação em:
- Preferências diretas
- Memória Episódica (acontecimentos e marcos com continuidade temporal)
- Memória Semântica (fatos, preferências e regras com relevância e importância)
"""

from typing import Dict, List, Optional
from memory.database import db


class MemoryRetriever:
    """Consolida memórias semânticas e episódicas para injeção inteligente de contexto dinâmico."""

    def get_summary_context(self, query: Optional[str] = None, user_id: Optional[str] = None) -> str:
        """Retorna apenas as memórias relevantes selecionadas por relevância e importância.
        
        NUNCA envia toda a memória para o LLM. Apenas os itens pertinentes à consulta atual.
        """
        try:
            from api.routes.auth import current_user_id_var
            uid = user_id or current_user_id_var.get()
        except Exception:
            uid = user_id or "default"

        sections: List[str] = []

        # 1. Preferências diretas do usuário (Context Budgeting: máx 4)
        prefs = db.get_all_preferences(user_id=uid)
        if prefs:
            pref_lines = [f"- {k}: {v}" for k, v in list(prefs.items())[:4]]
            sections.append("## Preferências Diretas do Usuário:\n" + "\n".join(pref_lines))

        # 2. Busca semântica e episódica vetorial (RAG) (Context Budgeting: máx 3 episódicas, máx 4 semânticas)
        if query and query.strip():
            matches = db.search_memories(query, limit=7, threshold=0.35, user_id=uid)
            episodic_matches: List[str] = []
            semantic_matches: List[str] = []

            for m in matches:
                m_type = m.get("memory_type", "")
                content = m.get("content", "")
                
                # Se for episódico (eventos passados, projetos)
                if ("episodic" in m_type or m.get("category") == "event") and len(episodic_matches) < 3:
                    episodic_matches.append(f"- {content}")
                elif len(semantic_matches) < 4:
                    semantic_matches.append(f"- {content}")

            if episodic_matches:
                sections.append(
                    "## Memória Episódica Relevante (Acontecimentos e Histórico de Projetos):\n"
                    + "\n".join(episodic_matches)
                )

            if semantic_matches:
                sections.append(
                    "## Memória Semântica Relevante (Fatos e Preferências):\n"
                    + "\n".join(semantic_matches)
                )

        # 3. Fallback se não houver query ou matches semânticos: exibe até 3 fatos de maior importância
        if len(sections) <= 1:
            facts = db.get_all_facts(user_id=uid)
            if facts:
                sections.append(
                    "## Fatos Gerais Conhecidos sobre o Usuário:\n"
                    + "\n".join(f"- {f}" for f in facts[:3])
                )

        if not sections:
            return "Nenhuma memória relevante registrada para esta interação."

        return "\n\n".join(sections)