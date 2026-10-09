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

import ipaddress
import urllib.parse

def is_blocked_ssrf_url(url: str) -> tuple[bool, str]:
    """Verifica se a URL aponta para recursos internos, localhost, metadados ou esquema inseguro."""
    if not url or not isinstance(url, str):
        return True, "URL inválida."
    try:
        parsed = urllib.parse.urlparse(url.strip())
        if parsed.scheme.lower() not in ("http", "https"):
            return True, f"Esquema de protocolo não permitido: '{parsed.scheme}'. Apenas HTTP e HTTPS são suportados."
        
        hostname = (parsed.hostname or "").lower().strip()
        if not hostname:
            return True, "URL sem hostname válido."

        # Hostnames bloqueados
        blocked_hosts = {"localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"}
        if hostname in blocked_hosts or hostname.endswith(".local") or hostname.endswith(".internal"):
            return True, "Acesso negado: URLs para localhost, rede interna ou serviços de metadados são bloqueadas por segurança (SSRF)."

        # Checagem de IP se hostname for um endereço IP
        try:
            ip = ipaddress.ip_address(hostname)
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or str(ip) == "169.254.169.254":
                return True, "Acesso negado: endereços IP privados ou de metadados de nuvem são bloqueados por segurança (SSRF)."
        except ValueError:
            pass  # Hostname é um domínio (ex: google.com), continua

        return False, ""
    except Exception as e:
        return True, f"Erro ao validar URL: {e}"


async def read_webpage(url: str) -> str:
    """Acessa um site e extrai o texto principal para leitura.
    
    Args:
        url: O link da página a ser lida.
    """
    logger.info("Lendo página: %s", url)

    blocked, reason = is_blocked_ssrf_url(url)
    if blocked:
        logger.warning(f"[SSRF BLOCKED] Tentativa de acesso a URL restrita: {url} ({reason})")
        return f"Segurança: {reason}"

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
