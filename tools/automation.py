"""Ferramentas de automação de teclado, mouse e tela."""

import logging
import os
import time
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)

def press_key(key: str) -> str:
    """Pressiona uma tecla ou combinação de teclas no teclado.
    
    Args:
        key: A tecla ou atalho (ex: 'space', 'enter', 'ctrl+c', 'win+d').
    """
    try:
        import pyautogui
        
        keys = [k.strip().lower() for k in key.split('+')]
        
        # Pressiona teclas em sequência se for atalho
        if len(keys) > 1:
            pyautogui.hotkey(*keys)
        else:
            pyautogui.press(keys[0])
            
        return f"Tecla(s) '{key}' pressionada(s) com sucesso."
    except ImportError:
        return "Erro: A biblioteca 'pyautogui' não está instalada."
    except Exception as e:
        logger.exception(f"Erro ao pressionar tecla {key}")
        return f"Erro ao tentar pressionar '{key}': {str(e)}"


def type_text(text: str) -> str:
    """Digita um texto no teclado.
    
    Args:
        text: O texto a ser digitado.
    """
    try:
        import pyautogui
        # Digita o texto com um pequeno intervalo para simular uma pessoa digitando rápido e não travar
        pyautogui.write(text, interval=0.01)
        return f"Texto digitado com sucesso na janela atual."
    except ImportError:
        return "Erro: A biblioteca 'pyautogui' não está instalada."
    except Exception as e:
        logger.exception(f"Erro ao digitar texto")
        return f"Erro ao tentar digitar o texto: {str(e)}"


def take_screenshot() -> str:
    """Tira um print da tela inteira e salva na pasta Imagens do computador do usuário."""
    try:
        import pyautogui
        import subprocess

        # Salva na pasta oficial Pictures/Charlie Capturas do usuário do computador
        pictures_dir = Path.home() / "Pictures" / "Charlie Capturas"
        pictures_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filepath = pictures_dir / f"screen_{timestamp}.png"

        pyautogui.screenshot(str(filepath))

        # Revela o print salvo no Windows Explorer para acesso instantâneo
        try:
            subprocess.Popen(["explorer.exe", f"/select,{str(filepath.absolute())}"])
        except Exception:
            pass

        return f"Print da tela capturado e salvo em: {filepath.absolute()}. A pasta de imagens foi aberta no Windows."
    except ImportError:
        return "Erro: A biblioteca 'pyautogui' não está instalada no ambiente local."
    except Exception as e:
        logger.exception("Erro ao tirar print da tela")
        return f"Erro ao tentar capturar a tela: {str(e)}"
