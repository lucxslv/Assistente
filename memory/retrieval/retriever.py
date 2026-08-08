"""Recuperador unificado de memórias."""

from memory.database import db

class MemoryRetriever:
    """Consolida as diferentes categorias de memória."""

    def get_summary_context(self) -> str:
        """Retorna as memórias consolidadas para injeção no system prompt."""
        prefs = db.get_all_preferences()
        facts = db.get_all_facts()
        
        lines = []
        if facts:
            lines.append("- Fatos Conhecidos:")
            for fact in facts:
                lines.append(f"  * {fact}")
                
        if prefs:
            lines.append("- Preferências do Usuário:")
            for k, v in prefs.items():
                lines.append(f"  * {k}: {v}")
                
        if not lines:
            return "Nenhuma memória registrada ainda."
            
        return "\n".join(lines)