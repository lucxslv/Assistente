"""Ferramentas para controle de sistema no Windows (Volume, Energia, etc.)."""

import logging
import os
import re
import subprocess
import ctypes
from ctypes import cast, POINTER
from typing import Optional

# Tentamos importar pycaw para gerenciar áudio
try:
    from pycaw.pycaw import AudioUtilities
except ImportError:
    AudioUtilities = None

logger = logging.getLogger(__name__)

BLOCKED_COMMAND_PATTERNS = [
    (r"\b(?:rmdir|rd)\s+/[sS]\b", "remoção recursiva de diretórios via CMD"),
    (r"\bformat\b", "formatação de unidade de disco"),
    (r"\bdel\s+(?:/[a-zA-Z0-9_-]+\s+)*[cC]:", "exclusão em massa na raiz do disco C:"),
    (r"\bRemove-Item\b.*-Recurse\b.*[cC]:", "exclusão recursiva do PowerShell visando o disco C:"),
    (r"\brm\s+-r(?:f)?\s+[cC]:", "exclusão recursiva visando o disco C:"),
    (r"\bClear-Disk\b", "limpeza/formatação de disco físico"),
    (r"\bStop-Computer\b", "desligamento forçado de máquina via PowerShell"),
    (r"\bdiskpart\b", "manipulação de partições em baixo nível"),
    (r"\bbcdedit\b", "alteração dos registros de boot do Windows"),
    (r"\bvssadmin\s+delete\s+shadows\b", "exclusão de cópias de sombra"),
    (r"\b(?:rm\s+-rf\s+/|mkfs\b|dd\s+if=)", "comandos destrutivos de formato/disco"),
]


def validate_system_command(command: str) -> tuple[bool, Optional[str]]:
    """Valida se uma instrução contém comandos perigosos ou destrutivos."""
    if not command or not command.strip():
        return True, None

    cmd_normalized = command.strip()
    for pattern, reason in BLOCKED_COMMAND_PATTERNS:
        if re.search(pattern, cmd_normalized, re.IGNORECASE):
            return False, reason

    return True, None

def set_system_volume(level: int = None, mute: bool = None) -> str:
    """Altera o volume do sistema do Windows ou muta/desmuta.
    
    Args:
        level: Nível de volume desejado (0 a 100).
        mute: True para mutar, False para desmutar. Se None, ignora.
    """
    if AudioUtilities is None:
        return "Erro: A biblioteca pycaw não está instalada no sistema."

    try:
        devices = AudioUtilities.GetSpeakers()
        volume = devices.EndpointVolume
        
        response_parts = []

        if mute is not None:
            # 1 é mutado, 0 é desmutado
            volume.SetMute(1 if mute else 0, None)
            state = "mutado" if mute else "desmutado"
            response_parts.append(f"O áudio do sistema foi {state}.")

        if level is not None:
            # Garante que está entre 0 e 100
            level = max(0, min(100, int(level)))
            
            # O volume na pycaw é medido em dB (decibéis). Para facilitar, 
            # podemos usar a função SetMasterVolumeLevelScalar que aceita um float entre 0.0 e 1.0.
            scalar_volume = level / 100.0
            volume.SetMasterVolumeLevelScalar(scalar_volume, None)
            response_parts.append(f"O volume do sistema foi ajustado para {level}%.")

        if not response_parts:
            return "Nenhuma alteração de volume solicitada."

        return " ".join(response_parts)

    except Exception as e:
        logger.exception("Erro ao ajustar volume do sistema")
        return f"Ocorreu um erro ao tentar alterar o volume: {str(e)}"

def system_power_action(action: str) -> str:
    """Executa ações de energia no sistema (bloquear, desligar, reiniciar, suspender).
    
    Args:
        action: A ação a ser executada. Valores aceitos: 'lock', 'sleep', 'shutdown', 'restart'.
    """
    action = action.lower()
    
    try:
        if action == "lock":
            # Trava a estação de trabalho instantaneamente
            ctypes.windll.user32.LockWorkStation()
            return "O computador foi bloqueado com sucesso."
            
        elif action == "sleep":
            # Coloca o computador para dormir / hibernar / suspender
            # Depende das configurações de energia do Windows do usuário
            subprocess.run(["rundll32.exe", "powrprof.dll,SetSuspendState", "0,1,0"], check=False)
            return "O comando de suspensão foi enviado."
            
        elif action == "shutdown":
            # Desliga após 60 segundos por segurança, permitindo 'shutdown /a'
            subprocess.run(["shutdown", "/s", "/t", "60"], check=False)
            return "Atenção: O computador será desligado em 60 segundos."
            
        elif action == "restart":
            # Reinicia após 60 segundos por segurança
            subprocess.run(["shutdown", "/r", "/t", "60"], check=False)
            return "Atenção: O computador será reiniciado em 60 segundos."
            
        else:
            return f"Ação desconhecida: {action}. Use lock, sleep, shutdown ou restart."
            
    except Exception as e:
        logger.exception(f"Erro ao executar ação de energia: {action}")
        return f"Falha ao executar a ação {action}: {str(e)}"


def execute_system_command(command: str, cwd: str = None) -> str:
    """Executa um comando no PowerShell ou CMD do computador Windows do usuário com validação de segurança."""
    is_valid, reason = validate_system_command(command)
    if not is_valid:
        logger.warning(f"[AUDIT DE SEGURANÇA] Tentativa de execução de comando perigoso bloqueada: {command} (Motivo: {reason})")
        return f"Segurança: O comando foi bloqueado pelas políticas de proteção do Charlie por conter instruções potencialmente destrutivas ({reason})."

    is_cloud = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))
    if is_cloud:
        return f"Comando '{command}' despachado para execução no PowerShell do computador Windows do usuário via Charlie Desktop."

    import platform
    import subprocess

    if platform.system() != "Windows":
        return f"Comando '{command}' despachado para o aplicativo Desktop local do usuário."

    try:
        res = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=cwd or None,
        )
        output = [
            f"STDOUT:\n{res.stdout.strip()}" if res.stdout.strip() else "",
            f"STDERR:\n{res.stderr.strip()}" if res.stderr.strip() else "",
            f"[Código de saída: {res.returncode}]",
        ]
        return "\n\n".join(filter(None, output))
    except Exception as e:
        logger.error(f"Erro ao executar comando no Windows: {e}")
        return f"Erro ao executar o comando no Windows: {e}"

