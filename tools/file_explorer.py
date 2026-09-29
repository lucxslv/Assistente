"""Ferramentas de exploração e leitura do sistema de arquivos para o LLM."""

import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

def list_directory(path: str = ".") -> str:
    """
    Lista os arquivos e subdiretórios de um diretório específico.
    """
    try:
        target = Path(path).resolve()
        if not target.exists() or not target.is_dir():
            return f"Erro: O diretório '{path}' não existe ou não é uma pasta válida."

        items = []
        for p in target.iterdir():
            # Oculta arquivos e pastas ocultas (como .git, .env, __pycache__)
            if p.name.startswith("."):
                continue
            if p.name == "__pycache__":
                continue
                
            kind = "[DIR]" if p.is_dir() else "[FILE]"
            items.append(f"{kind} {p.name}")

        if not items:
            return "O diretório está vazio (ou só contém arquivos ocultos)."
            
        items.sort()
        return "\n".join(items)
    except Exception as e:
        logger.error(f"Erro em list_directory: {e}")
        return f"Erro ao listar o diretório: {str(e)}"

def read_file(path: str, start_line: int = 1, end_line: int = None) -> str:
    """
    Lê o conteúdo de um arquivo de texto, código ou configuração.
    Permite ler partes específicas passando start_line e end_line.
    """
    try:
        target = Path(path).resolve()
        if not target.exists() or not target.is_file():
            return f"Erro: O arquivo '{path}' não existe ou não é um arquivo válido."

        # Limite de segurança: não ler arquivos binários
        try:
            with open(target, "r", encoding="utf-8") as f:
                lines = f.readlines()
        except UnicodeDecodeError:
            return f"Erro: '{path}' parece ser um arquivo binário ou ter codificação não suportada."

        if not lines:
            return "O arquivo está vazio."

        start = max(0, start_line - 1)
        end = min(len(lines), end_line) if end_line else len(lines)

        content = "".join(lines[start:end])
        
        # Se for muito grande, avisa o LLM
        if len(content) > 15000:
            content = content[:15000] + "\n\n[...CONTEÚDO TRUNCADO POR SEGURANÇA. O ARQUIVO É MUITO GRANDE...]"

        return f"--- Arquivo: {target.name} (Linhas {start_line} até {end}) ---\n\n{content}"
    except Exception as e:
        logger.error(f"Erro em read_file: {e}")
        return f"Erro ao tentar ler o arquivo: {str(e)}"

def write_file(path: str, content: str) -> str:
    """
    Cria um novo arquivo ou sobrescreve um arquivo existente com o conteúdo fornecido.
    """
    try:
        target = Path(path).resolve()
        with open(target, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Sucesso: Arquivo '{target.name}' foi escrito com sucesso."
    except Exception as e:
        logger.error(f"Erro em write_file: {e}")
        return f"Erro ao escrever no arquivo: {str(e)}"

def replace_in_file(path: str, target_text: str, replacement_text: str) -> str:
    """
    Busca um texto específico dentro de um arquivo e o substitui por outro.
    """
    try:
        target = Path(path).resolve()
        if not target.exists() or not target.is_file():
            return f"Erro: O arquivo '{path}' não existe."

        with open(target, "r", encoding="utf-8") as f:
            content = f.read()

        if target_text not in content:
            return f"Erro: O texto alvo '{target_text}' não foi encontrado no arquivo."

        new_content = content.replace(target_text, replacement_text)

        with open(target, "w", encoding="utf-8") as f:
            f.write(new_content)
            
        return f"Sucesso: Texto substituído com sucesso no arquivo '{target.name}'."
    except Exception as e:
        logger.error(f"Erro em replace_in_file: {e}")
        return f"Erro ao tentar substituir texto no arquivo: {str(e)}"

