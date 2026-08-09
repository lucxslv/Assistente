"""Ferramentas para controle de sistema no Windows (Volume, Energia, etc.)."""

import logging
import os
import ctypes
from ctypes import cast, POINTER

# Tentamos importar pycaw para gerenciar áudio
try:
    from pycaw.pycaw import AudioUtilities
except ImportError:
    AudioUtilities = None

logger = logging.getLogger(__name__)

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
            os.system("rundll32.exe powrprof.dll,SetSuspendState 0,1,0")
            return "O comando de suspensão foi enviado."
            
        elif action == "shutdown":
            # Desliga após 60 segundos por segurança, permitindo 'shutdown /a'
            os.system("shutdown /s /t 60")
            return "Atenção: O computador será desligado em 60 segundos."
            
        elif action == "restart":
            # Reinicia após 60 segundos por segurança
            os.system("shutdown /r /t 60")
            return "Atenção: O computador será reiniciado em 60 segundos."
            
        else:
            return f"Ação desconhecida: {action}. Use lock, sleep, shutdown ou restart."
            
    except Exception as e:
        logger.exception(f"Erro ao executar ação de energia: {action}")
        return f"Falha ao executar a ação {action}: {str(e)}"
