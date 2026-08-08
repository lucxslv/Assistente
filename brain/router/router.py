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
            
        if any(w in normalized for w in ["pesquise", "quem é", "o que é", "onde", "qual a capital"]):
            return IntentCategory.SEARCH
            
        if any(w in normalized for w in ["desligue", "ligue", "abra", "feche", "luz", "horas", "tempo", "toca", "toque", "música", "som", "pausar", "pausa", "parar", "volume", "continua", "despausa", "aumenta", "abaixa"]):
            return IntentCategory.COMMAND
            
        if any(w in normalized for w in ["calcule", "quanto é", "matemática", "raiz"]):
            return IntentCategory.MATH

        return IntentCategory.CASUAL
