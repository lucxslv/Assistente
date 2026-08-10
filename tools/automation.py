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
    """Tira um print da tela inteira e salva na pasta do projeto."""
    try:
        import pyautogui
        
        # Cria a pasta screenshots se não existir
        screenshots_dir = Path("screenshots")
        screenshots_dir.mkdir(exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filepath = screenshots_dir / f"screen_{timestamp}.png"
        
        pyautogui.screenshot(str(filepath))
        
        return f"Print da tela salvo com sucesso em: {filepath.absolute()}"
    except ImportError:
        return "Erro: A biblioteca 'pyautogui' não está instalada."
    except Exception as e:
        logger.exception("Erro ao tirar print da tela")
        return f"Erro ao tentar capturar a tela: {str(e)}"
