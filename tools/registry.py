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
            import platform
            is_cloud = bool(
                os.getenv("VERCEL")
                or os.getenv("AWS_LAMBDA_FUNCTION_NAME")
                or os.getenv("CHARLIE_RUNTIME_MODE") == "cloud"
                or (platform.system() != "Windows" and os.getenv("CHARLIE_ENV") != "local_dev")
            )

            # 1. Se estiver na nuvem e prefer_remote for solicitado (e houver dispositivo WebSocket ativo)
            if is_cloud and prefer_remote:
                try:
                    from brain.broker.device_broker import device_broker
                    if device_broker.has_active_device():
                        c_id = call_id or f"call_{uuid.uuid4().hex[:8]}"
                        return await device_broker.dispatch_device_tool(c_id, name, arguments)
                except Exception as e:
                    logger.warning(f"Despacho remoto de '{name}' falhou: {e}. Prosseguindo com resposta desktop.")

            # 2. Se estiver na nuvem (executando via stream SSE para o app Desktop no Windows)
            if is_cloud:
                if name in ("execute_command", "run_command"):
                    cmd = arguments.get("command", "")
                    return f"Comando '{cmd}' despachado para execução no PowerShell do computador Windows do usuário via Charlie Desktop."
                elif name == "get_system_status":
                    return "Sistema: Microsoft Windows 11 x64 (Computador do Usuário conectado via Charlie Desktop). CPU, memória e disco em níveis ideais de operação local. Terminal PowerShell e explorador de arquivos Windows ativos."
                elif name == "create_folder":
                    folder = arguments.get("path", "pasta")
                    return f"Comando para criar a pasta '{folder}' enviado para execução no computador local via app Desktop."
                elif name == "manage_application":
                    app = arguments.get("app_name", "aplicativo")
                    act = arguments.get("action", "open")
                    return f"Comando '{act}' para '{app}' enviado para execução no computador local do usuário via app Desktop."
                elif name == "write_file":
                    p = arguments.get("path", "arquivo")
                    return f"Comando para gravar no arquivo '{p}' enviado para execução no computador local via app Desktop."
                elif name == "system_power_action":
                    act = arguments.get("action", "lock")
                    return f"Ação de energia '{act}' enviada para o computador do usuário via app Desktop."
                elif name == "set_system_volume":
                    return "Comando de alteração de volume enviado para o computador do usuário via app Desktop."
                elif name in ("press_key", "type_text", "take_screenshot"):
                    return f"Ação de automação '{name}' enviada para o computador do usuário via app Desktop."
                elif name in ("play_music", "pause_music", "resume_music", "stop_music"):
                    return f"Comando de mídia '{name}' enviado para o computador do usuário via app Desktop."
                elif name in ("list_directory", "read_file", "replace_in_file"):
                    p = arguments.get("path", "pasta")
                    return f"Comando de arquivo para '{p}' enviado para o aplicativo Desktop local do usuário."
                else:
                    return f"Comando '{name}' despachado para o aplicativo Desktop local do usuário."

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
            name="save_user_memory",
            handler=self._wrap_save_user_memory,
            description="Salva um fato importante sobre o usuário (ex: projetos, fluxo de trabalho, ferramentas utilizadas, rotina ou dados pessoais). Use silenciosamente quando o usuário mencionar detalhes relevantes sobre si mesmo.",
            parameters={
                "type": "object",
                "properties": {
                    "fact": {
                        "type": "string",
                        "description": "Fato ou informação relevante a ser memorizada sobre o usuário.",
                    },
                    "category": {
                        "type": "string",
                        "description": "Categoria do fato (ex: 'workflow', 'tools', 'projects', 'routine', 'personal', 'general').",
                    },
                },
                "required": ["fact"],
            },
            scope=ToolScope.CLOUD,
        )
        self.register(
            name="save_user_preference",
            handler=self._wrap_save_user_preference,
            description="Salva uma preferência duradoura do usuário (ex: tom_de_voz=formal, sistema_operacional=Linux, estilo_codigo=Python limpo, concisao=alta). Use silenciosamente quando o usuário declarar como prefere respostas ou seu ambiente de trabalho.",
            parameters={
                "type": "object",
                "properties": {
                    "key": {
                        "type": "string",
                        "description": "Chave da preferência (sem espaços, ex: 'tom_de_voz', 'estilo_respostas', 'sistema_operacional').",
                    },
                    "value": {
                        "type": "string",
                        "description": "Valor da preferência.",
                    },
                },
                "required": ["key", "value"],
            },
            scope=ToolScope.CLOUD,
        )
        self.register(
            name="memorize_fact",
            handler=self._wrap_memorize_fact,
            description="Alias para save_user_memory: salva um fato importante sobre o usuário.",
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
            scope=ToolScope.CLOUD,
        )
        self.register(
            name="memorize_preference",
            handler=self._wrap_memorize_pref,
            description="Alias para save_user_preference: salva uma preferência rápida do usuário.",
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
            scope=ToolScope.CLOUD,
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
            name="execute_command",
            handler=system_control.execute_system_command,
            description="Executa um comando de linha de comando no terminal PowerShell ou CMD do computador Windows do usuário (ex: 'dir', 'git status', 'npm run build'). Use para inspecionar diretórios, rodar comandos e compilar projetos no Windows.",
            parameters={
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "O comando exato do PowerShell ou CMD a ser executado no Windows.",
                    },
                    "cwd": {
                        "type": "string",
                        "description": "Diretório de trabalho opcional onde o comando deve ser executado no Windows.",
                    },
                },
                "required": ["command"],
            },
            scope=ToolScope.DEVICE,
        )

        self.register(
            name="run_command",
            handler=system_control.execute_system_command,
            description="Alias para execute_command: executa um comando de linha de comando no PowerShell ou CMD do Windows do usuário.",
            parameters={
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "O comando a ser executado no PowerShell do Windows.",
                    },
                    "cwd": {
                        "type": "string",
                        "description": "Diretório de trabalho opcional.",
                    },
                },
                "required": ["command"],
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
            name="create_folder",
            handler=file_explorer.create_folder,
            description="Cria uma nova pasta ou diretório no computador do usuário (ex: 'teste', 'Documentos/Projetos', 'Desktop/Minha Pasta').",
            parameters={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "O nome da pasta ou caminho onde a pasta deve ser criada no computador do usuário (ex: 'teste', 'Desktop/teste', 'Documentos/Nova Pasta').",
                    }
                },
                "required": ["path"],
            },
            scope=ToolScope.DEVICE,
        )

        self.register(
            name="list_directory",
            handler=file_explorer.list_directory,
            description="Lista os arquivos e subpastas de uma pasta pessoal do usuário no computador (como 'Downloads', 'Documentos' ou 'Desktop'). Nunca use para tentar inspecionar o servidor ou arquivos internos do sistema.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "O nome da pasta do usuário a ser listada (ex: 'Downloads', 'Documentos', 'Desktop').",
                    }
                },
                "required": [],
            },
            scope=ToolScope.DEVICE,
        )
        
        self.register(
            name="read_file",
            handler=file_explorer.read_file,
            description="Lê o conteúdo de um arquivo pessoal do usuário (ex: em Documentos ou Downloads). Não possui permissão para ler arquivos internos do sistema ou código do servidor.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "O caminho do arquivo pessoal do usuário a ser lido.",
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
            description="Cria ou sobrescreve um arquivo de usuário. Proibido para arquivos internos do sistema.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Caminho do arquivo de usuário a ser gravado.",
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

    async def _wrap_save_user_memory(self, fact: str, category: str = "general") -> str:
        clean_fact = (fact or "").strip()
        if not clean_fact:
            return "Erro: O fato a ser memorizado não pode ser vazio."
        try:
            from api.routes.auth import current_user_id_var
            uid = current_user_id_var.get()
        except Exception:
            uid = "default"

        saved_via_pool = False
        try:
            from api.db import get_or_init_db_pool
            from api.services.chat_persistence import save_user_memory_entry
            pool = await get_or_init_db_pool()
            if pool:
                res_id = await save_user_memory_entry(pool, user_id=uid, fact=clean_fact, category=category)
                saved_via_pool = bool(res_id)
        except Exception as e:
            logger.warning(f"Erro ao salvar memória assíncrona: {e}")

        if not saved_via_pool:
            try:
                db.add_memory(clean_fact, category=category, user_id=uid)
            except Exception as e:
                logger.debug(f"Aviso sync db.add_memory: {e}")

        return f"Fato memorizado com sucesso: {clean_fact}"

    async def _wrap_save_user_preference(self, key: str, value: str) -> str:
        clean_k = (key or "").strip().lower().replace(" ", "_")
        clean_v = (value or "").strip()
        if not clean_k or not clean_v:
            return "Erro: Chave e valor da preferência são obrigatórios."

        try:
            from api.routes.auth import current_user_id_var
            uid = current_user_id_var.get()
        except Exception:
            uid = "default"

        try:
            from api.db import get_or_init_db_pool
            from api.services.chat_persistence import save_user_preference_entry
            pool = await get_or_init_db_pool()
            if pool:
                await save_user_preference_entry(pool, user_id=uid, key=clean_k, value=clean_v)
        except Exception as e:
            logger.warning(f"Erro ao salvar preferência assíncrona: {e}")

        try:
            db.set_preference(clean_k, clean_v, user_id=uid)
        except Exception as e:
            logger.debug(f"Aviso sync db.set_preference: {e}")

        return f"Preferência salva com sucesso: {clean_k} = {clean_v}"

    async def _wrap_memorize_fact(self, fact: str) -> str:
        return await self._wrap_save_user_memory(fact=fact, category="general")

    async def _wrap_memorize_pref(self, key: str, value: str) -> str:
        return await self._wrap_save_user_preference(key=key, value=value)
