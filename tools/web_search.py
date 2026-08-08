"""Ferramentas para acesso à internet (Pesquisa e Leitura de Páginas)."""

import logging
import httpx
from bs4 import BeautifulSoup
from ddgs import DDGS

logger = logging.getLogger(__name__)

def search_web(query: str, max_results: int = 5) -> str:
    """Pesquisa na web usando DuckDuckGo e retorna os resultados.
    
    Args:
        query: Termo a ser pesquisado.
        max_results: Número máximo de resultados (padrão 5).
    """
    logger.info("Pesquisando na web: %s", query)
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
            
        if not results:
            return "Nenhum resultado encontrado para a pesquisa."
            
        formatted_results = []
        for i, res in enumerate(results, 1):
            title = res.get('title', 'Sem Título')
            link = res.get('href', '')
            body = res.get('body', 'Sem descrição disponível.')
            formatted_results.append(f"{i}. Título: {title}\nURL: {link}\nResumo: {body}\n")
            
        return "\n".join(formatted_results)
    except Exception as e:
        logger.exception("Erro ao pesquisar na web")
        return f"Erro ao realizar a pesquisa: {str(e)}"

async def read_webpage(url: str) -> str:
    """Acessa um site e extrai o texto principal para leitura.
    
    Args:
        url: O link da página a ser lida.
    """
    logger.info("Lendo página: %s", url)
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=15.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            
            # Usa BeautifulSoup para extrair apenas o texto, removendo scripts e estilos
            soup = BeautifulSoup(response.text, "html.parser")
            for script in soup(["script", "style", "nav", "header", "footer", "aside"]):
                script.decompose()
                
            text = soup.get_text(separator=' ', strip=True)
            
            # Limita o tamanho do texto para não estourar o limite de tokens
            max_chars = 15000
            if len(text) > max_chars:
                text = text[:max_chars] + "\n\n...[Conteúdo truncado]..."
                
            return text if text else "Página vazia ou texto não extraível."
    except Exception as e:
        logger.exception("Erro ao ler página web")
        return f"Erro ao tentar ler o site: {str(e)}"
