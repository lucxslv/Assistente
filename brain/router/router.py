"""Router: Decide qual provedor e qual perfil usar."""

from brain.planner.planner import IntentCategory


class LLMRouter:
    """Analisa a entrada para determinar o melhor modelo e a intenção."""

    def classify_intent(self, text: str) -> IntentCategory:
        """Heurística simples para classificar a intenção inicial."""
        normalized = text.lower()
        
        if any(w in normalized for w in ["código", "python", "javascript", "bug", "erro", "função"]):
            return IntentCategory.PROGRAMMING
            
        if any(w in normalized for w in ["escreva", "crie", "poema", "redação", "texto"]):
            return IntentCategory.WRITE
            
        if any(w in normalized for w in ["pesquise", "pesquisar", "quem é", "quem foi", "o que é", "onde", "qual a", "notícia", "notícias"]):
            return IntentCategory.SEARCH
            
        if any(w in normalized for w in ["desligue", "desligar", "ligue", "abra", "abrir", "feche", "fechar", "luz", "horas", "tempo", "toca", "tocar", "toque", "música", "som", "pausar", "pausa", "parar", "volume", "continua", "despausa", "aumenta", "abaixa", "mutar", "muta", "bloqueie", "bloquear", "tela", "suspender", "reiniciar"]):
            return IntentCategory.COMMAND
            
        if any(w in normalized for w in ["calcule", "quanto é", "matemática", "raiz"]):
            return IntentCategory.MATH

        return IntentCategory.CASUAL
