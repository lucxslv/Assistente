"""Ferramentas para abrir e fechar aplicativos no Windows."""

import logging
import os
import subprocess

logger = logging.getLogger(__name__)

# Mapeamento para ajudar a encontrar processos e comandos conhecidos
COMMON_APPS = {
    "terminal": {"cmd": "wt.exe", "fallback_cmd": "powershell.exe", "process": "WindowsTerminal.exe"},
    "windows terminal": {"cmd": "wt.exe", "fallback_cmd": "powershell.exe", "process": "WindowsTerminal.exe"},
    "wt": {"cmd": "wt.exe", "fallback_cmd": "powershell.exe", "process": "WindowsTerminal.exe"},
    "powershell": {"cmd": "powershell.exe", "process": "powershell.exe"},
    "cmd": {"cmd": "cmd.exe", "process": "cmd.exe"},
    "prompt": {"cmd": "cmd.exe", "process": "cmd.exe"},
    "prompt de comando": {"cmd": "cmd.exe", "process": "cmd.exe"},
    "explorer": {"cmd": "explorer.exe", "process": "explorer.exe"},
    "explorador": {"cmd": "explorer.exe", "process": "explorer.exe"},
    "explorador de arquivos": {"cmd": "explorer.exe", "process": "explorer.exe"},
    "arquivos": {"cmd": "explorer.exe", "process": "explorer.exe"},
    "chrome": {"cmd": "chrome", "process": "chrome.exe"},
    "google chrome": {"cmd": "chrome", "process": "chrome.exe"},
    "brave": {"cmd": "brave", "process": "brave.exe"},
    "vscode": {"cmd": "code", "process": "Code.exe"},
    "code": {"cmd": "code", "process": "Code.exe"},
    "visual studio code": {"cmd": "code", "process": "Code.exe"},
    "spotify": {"cmd": "spotify", "process": "Spotify.exe"},
    "calc": {"cmd": "calc.exe", "process": "CalculatorApp.exe"},
    "calculadora": {"cmd": "calc.exe", "process": "CalculatorApp.exe"},
    "notepad": {"cmd": "notepad.exe", "process": "notepad.exe"},
    "bloco de notas": {"cmd": "notepad.exe", "process": "notepad.exe"},
    "discord": {"cmd": "discord", "process": "Discord.exe"},
    "edge": {"cmd": "msedge", "process": "msedge.exe"},
    "microsoft edge": {"cmd": "msedge", "process": "msedge.exe"},
    "whatsapp": {"cmd": "whatsapp:", "process": "WhatsApp.exe"},
}

def manage_application(app_name: str, action: str) -> str:
    """Abre ou fecha um aplicativo no computador.
    
    Args:
        app_name: O nome do aplicativo (ex: 'chrome', 'spotify', 'vscode', 'terminal').
        action: 'open' para abrir, 'close' para fechar.
    """
    app_key = app_name.lower().strip()
    action = action.lower().strip()

    # Validação rigorosa contra Command Injection (metacaracteres de shell)
    import re
    if any(ch in app_key for ch in ["&", "|", ";", ">", "<", "`", "$", "\n", "\r", '"', "'"]):
        logger.warning(f"[SEGURANÇA] Bloqueada tentativa de injeção em manage_application: {app_name}")
        return f"Segurança: Nome de aplicativo inválido ou contendo caracteres proibidos ({app_name})."

    # Busca mapeamento conhecido ou tenta adivinhar o executável
    app_info = COMMON_APPS.get(app_key, {"cmd": app_key, "process": f"{app_key}.exe"})
    
    try:
        if action == "open":
            if app_key in ["navegador", "browser", "internet"]:
                import webbrowser
                webbrowser.open("https://google.com")
                return "Navegador padrão aberto com sucesso."
                
            cmd_to_run = app_info.get("cmd", app_key)
            # No Windows, 'start "" <cmd>' desacopla o processo e permite janela interativa visível
            res = subprocess.run(["cmd.exe", "/c", "start", "", cmd_to_run], capture_output=True, text=True, check=False)
            
            # Se falhou e houver fallback definido (ex: wt.exe falha sem Windows Terminal, tenta powershell)
            if res.returncode != 0 and app_info.get("fallback_cmd"):
                fallback = app_info["fallback_cmd"]
                res = subprocess.run(["cmd.exe", "/c", "start", "", fallback], capture_output=True, text=True, check=False)
                if res.returncode == 0:
                    return f"Aplicativo '{app_name}' aberto com sucesso via {fallback}."

            if res.returncode == 0:
                return f"Aplicativo '{app_name}' aberto com sucesso no computador."
            else:
                return f"Tentativa de abrir '{app_name}' concluída, mas o Windows pode não ter encontrado o executável."
                
        elif action == "close":
            process_name = app_info['process']
            res = subprocess.run(["taskkill", "/IM", process_name, "/F"], capture_output=True, text=True, check=False)
            if res.returncode == 0:
                return f"Aplicativo '{app_name}' ({process_name}) fechado com sucesso."
            else:
                return f"Não foi possível fechar '{app_name}'. Pode ser que ele não esteja aberto ou exija permissões de administrador."
        else:
            return f"Ação desconhecida: {action}. Use 'open' ou 'close'."
            
    except Exception as e:
        logger.exception(f"Erro ao gerenciar aplicativo {app_name}")
        return f"Erro ao tentar {action} o aplicativo '{app_name}': {str(e)}"
