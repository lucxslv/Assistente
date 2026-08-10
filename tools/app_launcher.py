"""Ferramentas para abrir e fechar aplicativos no Windows."""

import logging
import os

logger = logging.getLogger(__name__)

# Mapeamento para ajudar a encontrar processos e comandos conhecidos
COMMON_APPS = {
    "chrome": {"cmd": "chrome", "process": "chrome.exe"},
    "google chrome": {"cmd": "chrome", "process": "chrome.exe"},
    "brave": {"cmd": "brave", "process": "brave.exe"},
    "vscode": {"cmd": "code", "process": "Code.exe"},
    "code": {"cmd": "code", "process": "Code.exe"},
    "spotify": {"cmd": "spotify", "process": "Spotify.exe"},
    "calculadora": {"cmd": "calc", "process": "CalculatorApp.exe"},
    "bloco de notas": {"cmd": "notepad", "process": "notepad.exe"},
    "discord": {"cmd": "discord", "process": "Discord.exe"},
    "edge": {"cmd": "msedge", "process": "msedge.exe"},
    "whatsapp": {"cmd": "whatsapp:", "process": "WhatsApp.exe"},
}

def manage_application(app_name: str, action: str) -> str:
    """Abre ou fecha um aplicativo no computador.
    
    Args:
        app_name: O nome do aplicativo (ex: 'chrome', 'spotify', 'vscode').
        action: 'open' para abrir, 'close' para fechar.
    """
    app_key = app_name.lower().strip()
    action = action.lower().strip()
    
    # Busca mapeamento conhecido ou tenta adivinhar o executável
    app_info = COMMON_APPS.get(app_key, {"cmd": app_key, "process": f"{app_key}.exe"})
    
    try:
        if action == "open":
            if app_key in ["navegador", "browser", "internet"]:
                import webbrowser
                webbrowser.open("https://google.com")
                return "Navegador padrão aberto com sucesso."
                
            # No Windows, 'start' usa o registro App Paths ou o PATH do sistema
            result = os.system(f"start {app_info['cmd']}")
            if result == 0:
                return f"Comando de abrir '{app_name}' enviado com sucesso."
            else:
                return f"Tentativa de abrir '{app_name}' concluída, mas o Windows pode não ter encontrado o executável."
                
        elif action == "close":
            # Tenta matar o processo pelo nome de forma forçada (/F)
            process_name = app_info['process']
            result = os.system(f"taskkill /IM {process_name} /F")
            if result == 0:
                return f"Aplicativo '{app_name}' ({process_name}) fechado com sucesso."
            else:
                return f"Não foi possível fechar '{app_name}'. Pode ser que ele não esteja aberto ou exija permissões de administrador."
        else:
            return f"Ação desconhecida: {action}. Use 'open' ou 'close'."
            
    except Exception as e:
        logger.exception(f"Erro ao gerenciar aplicativo {app_name}")
        return f"Erro ao tentar {action} o aplicativo '{app_name}': {str(e)}"
