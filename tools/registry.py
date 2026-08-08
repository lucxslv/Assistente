"""Mapeador/registrador de funções para a LLM."""

import inspect
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from tools import home_assistant, system_info, weather, media_player, web_search
from memory.database import db

logger = logging.getLogger(__name__)

ToolHandler = Callable[..., str | Awaitable[str]]


class ToolRegistry:
    """Registra e executa ferramentas disponíveis para a LLM."""

    def __init__(self) -> None:
        self._handlers: dict[str, ToolHandler] = {}
        self._schemas: dict[str, dict[str, Any]] = {}
        self._register_defaults()

    def register(
        self,
        name: str,
        handler: ToolHandler,
        description: str,
        parameters: dict[str, Any] | None = None,
    ) -> None:
        self._handlers[name] = handler
        self._schemas[name] = {
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": parameters
                or {"type": "object", "properties": {}, "required": []},
            },
        }

    def list_tools(self) -> list[str]:
        return list(self._handlers.keys())

    def get_schemas(self) -> list[dict[str, Any]]:
        return list(self._schemas.values())

    async def execute(self, name: str, arguments: dict[str, Any]) -> str:
        handler = self._handlers.get(name)
        if handler is None:
            return f"Ferramenta '{name}' não encontrada."

        try:
            if inspect.iscoroutinefunction(handler):
                result = await handler(**arguments)
            else:
                result = handler(**arguments)
            return str(result)
        except Exception as exc:
            logger.exception("Erro ao executar tool '%s'", name)
            return f"Erro ao executar '{name}': {exc}"

    def _register_defaults(self) -> None:
        self.register(
            name="get_weather",
            handler=weather.get_weather,
            description="Obtém a previsão do tempo para uma cidade.",
            parameters={
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "Nome da cidade",
                    }
                },
                "required": ["city"],
            },
        )
        self.register(
            name="get_datetime",
            handler=system_info.get_datetime,
            description="Retorna a data e hora atuais.",
        )
        self.register(
            name="get_system_status",
            handler=system_info.get_system_status,
            description="Retorna informações básicas do sistema (CPU, memória, disco).",
        )
        self.register(
            name="control_device",
            handler=home_assistant.control_device,
            description="Controla um dispositivo doméstico via Home Assistant.",
            parameters={
                "type": "object",
                "properties": {
                    "entity_id": {
                        "type": "string",
                        "description": "ID da entidade (ex: light.sala)",
                    },
                    "action": {
                        "type": "string",
                        "enum": ["turn_on", "turn_off", "toggle"],
                        "description": "Ação a executar",
                    },
                },
                "required": ["entity_id", "action"],
            },
        )
        self.register(
            name="play_music",
            handler=media_player.play_music,
            description="Toca uma música, artista ou áudio de forma invisível em background.",
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Nome da música ou artista para buscar e tocar",
                    }
                },
                "required": ["query"],
            },
        )
        self.register(
            name="pause_music",
            handler=media_player.pause_music,
            description="Pausa a música que está tocando atualmente.",
            parameters={"type": "object", "properties": {}},
        )
        self.register(
            name="resume_music",
            handler=media_player.resume_music,
            description="Retoma a música que estava pausada.",
            parameters={"type": "object", "properties": {}},
        )
        self.register(
            name="stop_music",
            handler=media_player.stop_music,
            description="Para a música que está tocando.",
            parameters={"type": "object", "properties": {}},
        )
        self.register(
            name="set_volume",
            handler=media_player.set_volume,
            description="Ajusta o volume da música em background.",
            parameters={
                "type": "object",
                "properties": {
                    "level": {
                        "type": "integer",
                        "description": "Nível de volume de 0 a 100",
                    }
                },
                "required": ["level"],
            },
        )
        self.register(
            name="memorize_fact",
            handler=self._wrap_memorize_fact,
            description="Salva um fato importante sobre o usuário (ex: 'O usuário tem um cachorro chamado Rex', 'O usuário trabalha com Python').",
            parameters={
                "type": "object",
                "properties": {
                    "fact": {
                        "type": "string",
                        "description": "Fato a ser memorizado de forma clara",
                    }
                },
                "required": ["fact"],
            },
        )
        self.register(
            name="memorize_preference",
            handler=self._wrap_memorize_pref,
            description="Salva uma preferência do usuário (ex: tema=escuro, musica_favorita=rock).",
            parameters={
                "type": "object",
                "properties": {
                    "key": {
                        "type": "string",
                        "description": "Chave da preferência (sem espaços, ex: estilo_musical)",
                    },
                    "value": {
                        "type": "string",
                        "description": "Valor da preferência",
                    }
                },
                "required": ["key", "value"],
            },
        )
        self.register(
            name="search_web",
            handler=web_search.search_web,
            description="Pesquisa na internet usando um motor de busca e retorna um resumo dos sites encontrados. Ideal para buscar notícias, tirar dúvidas ou descobrir sites.",
            parameters={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "A frase ou termo de pesquisa a ser buscado no DuckDuckGo",
                    }
                },
                "required": ["query"],
            },
        )
        self.register(
            name="read_webpage",
            handler=web_search.read_webpage,
            description="Lê e extrai todo o texto do conteúdo de uma página web específica através de uma URL. Utilize após fazer uma busca caso o resumo não seja suficiente.",
            parameters={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "O endereço completo (URL) do site a ser lido",
                    }
                },
                "required": ["url"],
            },
        )

    def _wrap_memorize_fact(self, fact: str) -> str:
        db.add_fact(fact)
        return f"Fato memorizado: {fact}"

    def _wrap_memorize_pref(self, key: str, value: str) -> str:
        db.set_preference(key, value)
        return f"Preferência salva: {key} = {value}"
