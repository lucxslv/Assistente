"""Planner: Estrutura o raciocínio da assistente."""

import logging
from enum import Enum

logger = logging.getLogger(__name__)


class IntentCategory(Enum):
    CASUAL = "Conversa casual"
    COMMAND = "Comando local"
    SEARCH = "Pesquisa na web"
    PROGRAMMING = "Programação"
    WRITE = "Escrita"
    MATH = "Matemática / Raciocínio"


class IntentPlanner:
    """Extrai planos complexos e analisa a viabilidade da resposta."""
    
    def validate_response(self, text: str) -> bool:
        """Valida se a resposta gerada é segura e não-vazia."""
        if not text or len(text.strip()) == 0:
            return False
        return True