"""Recuperador unificado de memórias."""

class MemoryRetriever:
    """Consolida as diferentes categorias de memória."""

    def get_summary_context(self) -> str:
        """Retorna as memórias consolidadas para injeção no system prompt."""
        # TODO: Integrar LongTerm, Preferences e Events
        return (
            "- Fatos Conhecidos: linguagem_principal: Python, sistema_operacional: Windows\n"
            "- Preferências: estilo_resposta: objetivo e amigável, tema_preferido: dark"
        )