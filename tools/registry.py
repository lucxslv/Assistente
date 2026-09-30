import enum
import inspect
import logging
import uuid
from collections.abc import Awaitable, Callable
from typing import Any, Optional

from tools import home_assistant, system_info, weather, media_player, web_search, system_control, app_launcher, automation, file_explorer
from memory.database import db

logger = logging.getLogger(__name__)

ToolHandler = Callable[..., str | Awaitable[str]]


class ToolScope(enum.Enum):
    CLOUD = "cloud"       # Executa no cérebro na nuvem (IA, memórias, clima, web search)
    DEVICE = "device"     # Executa no computador local (aplicativos, arquivos, áudio, sistema)
    HOME = "home"         # Executa na automação residencial (Home Assistant)


class ToolRegistry:
    """Registra e executa ferramentas disponíveis para a LLM com suporte a escopos e despacho remoto."""

    def __init__(self) -> None:
        self._handlers: dict[str, ToolHandler] = {}
        self._schemas: dict[str, dict[str, Any]] = {}
        self._scopes: dict[str, ToolScope] = {}
        self._register_defaults()

    def register(
        self,
        name: str,
        handler: ToolHandler,
        description: str,
        parameters: dict[str, Any] | None = None,
        scope: ToolScope = ToolScope.CLOUD,
    ) -> None:
        self._handlers[name] = handler
        self._scopes[name] = scope
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

    def get_scope(self, name: str) -> ToolScope:
        return self._scopes.get(name, ToolScope.CLOUD)

    async def execute(
        self,
        name: str,
        arguments: dict[str, Any],
        prefer_remote: bool = False,
        call_id: Optional[str] = None,
    ) -> str:
        handler = self._handlers.get(name)
        if handler is None:
            return f"Ferramenta '{name}' não encontrada."

        scope = self.get_scope(name)

        # Se for ferramenta local de dispositivo
        if scope == ToolScope.DEVICE:
            import os
            is_cloud = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))
            if is_cloud:
                if name == "manage_application":
                    app = arguments.get("app_name", "aplicativo")
                    act = arguments.get("action", "open")
                    return f"Comando '{act}' para '{app}' enviado para execução no computador local do usuário via app Desktop."
                elif name == "system_power_action":
                    act = arguments.get("action", "lock")
                    return f"Ação de energia '{act}' enviada para o computador do usuário via app Desktop."
                elif name == "set_system_volume":
                    return "Comando de alteração de volume enviado para o computador do usuário via app Desktop."
                elif name in ("press_key", "type_text", "take_screenshot"):
                    return f"Ação de automação '{name}' enviada para o computador do usuário via app Desktop."
                elif name in ("play_music", "pause_music", "resume_music", "stop_music"):
                    return f"Comando de mídia '{name}' enviado para o computador do usuário via app Desktop."
                elif name in ("list_directory", "read_file", "write_file", "replace_in_file"):
                    return (
                        "Aviso: O cérebro do Charlie está conectado ao servidor em nuvem (Vercel) e não possui "
                        "acesso direto ao disco rígido do seu computador local por isolamento de rede da nuvem. "
                        "Para que eu possa listar, ler e manipular seus arquivos e pastas locais (como Downloads, Documentos ou C:\\), "
                        "inicie o assistente localmente executando o arquivo 'run_desktop.bat' no seu computador."
                    )

            if is_cloud and prefer_remote:
                try:
                    from brain.broker.device_broker import device_broker
                    if device_broker.has_active_device():
                        c_id = call_id or f"call_{uuid.uuid4().hex[:8]}"
                        return await device_broker.dispatch_device_tool(c_id, name, arguments)
                except Exception as e:
                    logger.warning(f"Despacho remoto de '{name}' falhou: {e}. Executando localmente.")

        # Notifica o observador de estado (se o módulo de API estiver ativo)
        state_mgr = None
        try:
            from api.state import state
            state.set_tool_start(name, arguments)
            state_mgr = state
        except Exception:
            pass

        try:
            if inspect.iscoroutinefunction(handler):
                result = await handler(**arguments)
            else:
                result = handler(**arguments)
            return str(result)
        except Exception as exc:
            logger.exception("Erro ao executar tool '%s'", name)
            return f"Erro ao executar '{name}': {exc}"
        finally:
            if state_mgr:
                state_mgr.set_tool_end()

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
            scope=ToolScope.DEVICE,
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
            scope=ToolScope.HOME,
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
            scope=ToolScope.DEVICE,
        )
        self.register(
            name="pause_music",
            handler=media_player.pause_music,
            description="Pausa a música que está tocando atualmente.",
            parameters={"type": "object", "properties": {}},
            scope=ToolScope.DEVICE,
        )
        self.register(
            name="resume_music",
            handler=media_player.resume_music,
            description="Retoma a música que estava pausada.",
            parameters={"type": "object", "properties": {}},
            scope=ToolScope.DEVICE,
        )
        self.register(
            name="stop_music",
            handler=media_player.stop_music,
            description="Para a música que está tocando.",
            parameters={"type": "object", "properties": {}},
            scope=ToolScope.DEVICE,
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
            scope=ToolScope.DEVICE,
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
        self.register(
            name="set_system_volume",
            handler=system_control.set_system_volume,
            description="Altera o volume principal do computador (Windows) de 0 a 100, ou muta/desmuta completamente o PC.",
            parameters={
                "type": "object",
                "properties": {
                    "level": {
                        "type": "integer",
                        "description": "O nível do volume em porcentagem, de 0 a 100.",
                    },
                    "mute": {
                        "type": "boolean",
                        "description": "True para mutar o PC, False para desmutar.",
                    }
                },
                "required": [],
            },
            scope=ToolScope.DEVICE,
        )
        self.register(
            name="system_power_action",
            handler=system_control.system_power_action,
            description="Executa ações de energia ou segurança no Windows: bloquear tela, desligar, reiniciar ou suspender.",
            parameters={
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["lock", "sleep", "shutdown", "restart"],
                        "description": "A ação a ser executada no PC.",
                    }
                },
                "required": ["action"],
            },
            scope=ToolScope.DEVICE,
        )
        self.register(
            name="manage_application",
            handler=app_launcher.manage_application,
            description="Abre ou fecha um aplicativo no computador (ex: chrome, spotify, vscode, calculadora).",
            parameters={
                "type": "object",
                "properties": {
                    "app_name": {
                        "type": "string",
                        "description": "Nome do aplicativo (ex: 'chrome', 'spotify', 'vscode', 'calculadora').",
                    },
                    "action": {
                        "type": "string",
                        "enum": ["open", "close"],
                        "description": "'open' para abrir o aplicativo, 'close' para fechar.",
                    }
                },
                "required": ["app_name", "action"],
            },
            scope=ToolScope.DEVICE,
        )
        
        self.register(
            name="press_key",
            handler=automation.press_key,
            description="Pressiona uma tecla ou atalho do teclado do computador (ex: 'space', 'enter', 'ctrl+c', 'win+d', 'f5').",
            parameters={
                "type": "object",
                "properties": {
                    "key": {
                        "type": "string",
                        "description": "A tecla ou combinação a ser pressionada (ex: 'space', 'esc', 'ctrl+shift+esc').",
                    }
                },
                "required": ["key"],
            },
            scope=ToolScope.DEVICE,
        )
        
        self.register(
            name="type_text",
            handler=automation.type_text,
            description="Digita um texto na janela que estiver em foco no momento usando o teclado virtual.",
            parameters={
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "O texto exato a ser digitado.",
                    }
                },
                "required": ["text"],
            },
            scope=ToolScope.DEVICE,
        )
        
        self.register(
            name="take_screenshot",
            handler=automation.take_screenshot,
            description="Tira um print (captura) da tela inteira e salva na pasta do projeto.",
            parameters={
                "type": "object",
                "properties": {},
                "required": [],
            },
            scope=ToolScope.DEVICE,
        )

        self.register(
            name="list_directory",
            handler=file_explorer.list_directory,
            description="Lista todos os arquivos e pastas de um diretório específico. Muito útil para explorar projetos.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "O caminho da pasta a ser listada (ex: '.' para a pasta atual, ou 'c:/projetos').",
                    }
                },
                "required": [],
            },
            scope=ToolScope.DEVICE,
        )
        
        self.register(
            name="read_file",
            handler=file_explorer.read_file,
            description="Lê o conteúdo de um arquivo. ATENÇÃO: O resultado desta ferramenta é enviado apenas para você (IA). O usuário NÃO VÊ o resultado. Se o usuário pedir para ver o código ou texto, você DEVE transcrever/copiar o conteúdo na sua resposta.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "O caminho completo ou relativo do arquivo a ser lido.",
                    },
                    "start_line": {
                        "type": "integer",
                        "description": "Linha inicial da leitura (opcional, padrão 1).",
                    },
                    "end_line": {
                        "type": "integer",
                        "description": "Linha final da leitura (opcional, lê até o fim se não especificado).",
                    }
                },
                "required": ["path"],
            },
            scope=ToolScope.DEVICE,
        )

        self.register(
            name="write_file",
            handler=file_explorer.write_file,
            description="Cria ou sobrescreve completamente um arquivo com um novo conteúdo. ATENÇÃO: Substitui tudo no arquivo.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Caminho do arquivo a ser criado ou sobrescrito.",
                    },
                    "content": {
                        "type": "string",
                        "description": "O conteúdo completo que será gravado no arquivo.",
                    }
                },
                "required": ["path", "content"],
            },
            scope=ToolScope.DEVICE,
        )

        self.register(
            name="replace_in_file",
            handler=file_explorer.replace_in_file,
            description="Substitui um trecho específico de texto por outro dentro de um arquivo. Muito útil para fazer pequenas edições sem reescrever tudo.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Caminho do arquivo.",
                    },
                    "target_text": {
                        "type": "string",
                        "description": "O texto EXATO que existe hoje e será substituído (inclua espaços e quebras de linha exatas).",
                    },
                    "replacement_text": {
                        "type": "string",
                        "description": "O novo texto que vai entrar no lugar.",
                    }
                },
                "required": ["path", "target_text", "replacement_text"],
            },
            scope=ToolScope.DEVICE,
        )

    def _wrap_memorize_fact(self, fact: str) -> str:
        db.add_fact(fact)
        return f"Fato memorizado: {fact}"

    def _wrap_memorize_pref(self, key: str, value: str) -> str:
        db.set_preference(key, value)
        return f"Preferência salva: {key} = {value}"
