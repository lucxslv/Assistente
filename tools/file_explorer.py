"""Ferramentas de exploração e leitura do sistema de arquivos para o LLM."""

import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


# Arquivos e extensões sensíveis protegidos contra leitura ou alteração
SENSITIVE_PATTERNS = {
    ".env", ".git", ".github", ".gitignore", ".vercelignore",
    ".aws", ".ssh", "id_rsa", "id_ed25519", "credentials", "secrets",
    "token", "supabase", "config.py", "service_account",
}

INTERNAL_PROJECT_DIRS = {
    "api", "brain", "core", "memory", "tools", "providers", ".venv", "node_modules", "src-tauri"
}


def is_blocked_path(p: Path) -> tuple[bool, str]:
    """Valida se o caminho tenta acessar credenciais, arquivos do servidor ou código-fonte interno."""
    name_lower = p.name.lower()
    for s in SENSITIVE_PATTERNS:
        if s in name_lower:
            return True, "Acesso negado: arquivos de configuração interna, credenciais ou segredos são estritamente protegidos."

    repo_root = Path.cwd().resolve()
    try:
        resolved = p.resolve()
        # Bloqueio de pastas críticas do sistema operacional
        system_roots = {"windows", "system32", "syswow64", "$recycle.bin", "system volume information"}
        if any(part.lower() in system_roots for part in resolved.parts):
            return True, "Acesso negado: diretórios críticos do sistema operacional são protegidos contra manipulação."

        if resolved == repo_root or repo_root in resolved.parents:
            rel_parts = [part.lower() for part in resolved.relative_to(repo_root).parts]
            if not rel_parts:
                return True, "Acesso negado: a raiz do sistema interno é protegida. Especifique uma pasta de usuário (como 'Downloads' ou 'Documentos')."
            for part in rel_parts:
                if part in INTERNAL_PROJECT_DIRS or part.startswith(".env") or part.endswith(".py"):
                    return True, "Acesso negado: arquivos de sistema e código-fonte interno da plataforma são protegidos por segurança."
    except Exception:
        pass

    return False, ""


def resolve_friendly_path(path: str) -> Path:
    """Resolve caminhos amigáveis, OneDrive e atalhos comuns do sistema operacional."""
    home = Path.home()
    onedrive = home / "OneDrive"

    # Mapeamento de pastas especiais do usuário (priorizando OneDrive se ativo no Windows)
    docs_dir = (
        onedrive / "Documentos"
        if (onedrive / "Documentos").exists()
        else (onedrive / "Documents" if (onedrive / "Documents").exists() else home / "Documents")
    )
    desktop_dir = (
        onedrive / "Desktop"
        if (onedrive / "Desktop").exists()
        else (onedrive / "Área de Trabalho" if (onedrive / "Área de Trabalho").exists() else home / "Desktop")
    )
    pics_dir = (
        onedrive / "Imagens"
        if (onedrive / "Imagens").exists()
        else (onedrive / "Pictures" if (onedrive / "Pictures").exists() else home / "Pictures")
    )
    downloads_dir = home / "Downloads"

    if not path or not path.strip() or path.strip() == ".":
        return docs_dir

    p = path.strip().strip("'\"")
    # Limpa prefixos naturais que o modelo pode enviar (ex: 'pasta do Bot-Sergoias', 'pasta Bot-Sergoias')
    clean_p = p
    for prefix in (
        "pasta do ",
        "pasta da ",
        "pasta de ",
        "pasta ",
        "diretório do ",
        "diretório da ",
        "diretório ",
        "diretorio do ",
        "diretorio da ",
        "diretorio ",
        "folder ",
    ):
        if clean_p.lower().startswith(prefix):
            clean_p = clean_p[len(prefix) :].strip().strip("'\"")
            break

    lower = clean_p.lower()

    if lower in ("downloads", "meus downloads", "~/downloads"):
        return downloads_dir
    elif lower in ("desktop", "área de trabalho", "area de trabalho", "~/desktop"):
        return desktop_dir
    elif lower in ("documentos", "meus documentos", "documents", "~/documents"):
        return docs_dir
    elif lower in ("imagens", "fotos", "pictures", "~/pictures"):
        return pics_dir
    elif lower in ("músicas", "musicas", "music", "~/music"):
        return home / "Music"
    elif lower in ("vídeos", "videos", "~/videos"):
        return home / "Videos"
    elif lower in ("home", "usuário", "usuario", "~"):
        return home
    elif clean_p.startswith("~"):
        return Path(os.path.expanduser(clean_p)).resolve()

    # Subpastas de pastas especiais (ex: 'desktop/teste', 'documentos/meus_arquivos')
    for prefix in (
        "desktop/", "desktop\\", "área de trabalho/", "área de trabalho\\", "area de trabalho/", "area de trabalho\\",
    ):
        if lower.startswith(prefix):
            sub = clean_p[len(prefix):].lstrip("/\\")
            return desktop_dir / sub

    for prefix in (
        "documentos/", "documentos\\", "documents/", "documents\\",
    ):
        if lower.startswith(prefix):
            sub = clean_p[len(prefix):].lstrip("/\\")
            return docs_dir / sub

    for prefix in (
        "downloads/", "downloads\\",
    ):
        if lower.startswith(prefix):
            sub = clean_p[len(prefix):].lstrip("/\\")
            return downloads_dir / sub

    for prefix in (
        "imagens/", "imagens\\", "pictures/", "pictures\\",
    ):
        if lower.startswith(prefix):
            sub = clean_p[len(prefix):].lstrip("/\\")
            return pics_dir / sub

    # Normalização de caminhos genéricos do Windows que o LLM pode inferir
    # (ex: C:\Users\Public\Documents\..., C:\Users\User\Documents\..., ou caminhos locais quando OneDrive está ativo)
    norm_slash = clean_p.replace("\\", "/").strip("/")
    parts = norm_slash.split("/")
    if len(parts) >= 3 and parts[0].endswith(":") and parts[1].lower() == "users":
        # Estrutura C:/Users/<user>/<folder>/...
        if len(parts) >= 4:
            special_name = parts[3].lower()
            if special_name in ("documents", "documentos"):
                sub = "/".join(parts[4:])
                return (docs_dir / sub).resolve() if sub else docs_dir
            elif special_name in ("desktop", "área de trabalho", "area de trabalho"):
                sub = "/".join(parts[4:])
                return (desktop_dir / sub).resolve() if sub else desktop_dir
            elif special_name in ("downloads",):
                sub = "/".join(parts[4:])
                return (downloads_dir / sub).resolve() if sub else downloads_dir
            elif special_name in ("pictures", "imagens", "fotos"):
                sub = "/".join(parts[4:])
                return (pics_dir / sub).resolve() if sub else pics_dir

    norm_lower = norm_slash.lower()
    for doc_token in ("users/public/documents", "users/public/documentos", "users/default/documents", "users/default/documentos"):
        if doc_token in norm_lower:
            idx = norm_lower.find(doc_token) + len(doc_token)
            sub = norm_slash[idx:].lstrip("/")
            return (docs_dir / sub).resolve() if sub else docs_dir

    for desk_token in ("users/public/desktop", "users/default/desktop", "users/public/área de trabalho", "users/public/area de trabalho"):
        if desk_token in norm_lower:
            idx = norm_lower.find(desk_token) + len(desk_token)
            sub = norm_slash[idx:].lstrip("/")
            return (desktop_dir / sub).resolve() if sub else desktop_dir

    for down_token in ("users/public/downloads", "users/default/downloads"):
        if down_token in norm_lower:
            idx = norm_lower.find(down_token) + len(down_token)
            sub = norm_slash[idx:].lstrip("/")
            return (downloads_dir / sub).resolve() if sub else downloads_dir

    # Se OneDrive estiver ativo e gerenciando Documentos, redireciona qualquer path
    # apontando para C:/Users/<usuario>/Documents diretamente para docs_dir (OneDrive/Documentos)
    try:
        norm_home_docs = (home / "Documents").as_posix().lower()
        if norm_lower.startswith(norm_home_docs) and docs_dir != (home / "Documents"):
            sub = norm_slash[len(norm_home_docs):].lstrip("/")
            return (docs_dir / sub).resolve() if sub else docs_dir
    except Exception:
        pass

    # 1. Tenta o caminho direto se for absoluto ou já existir
    direct = Path(clean_p).resolve()
    if direct.exists() or Path(clean_p).is_absolute():
        return direct

    # 2. Se for relativo e não existe diretamente, busca em diretórios comuns de usuário
    candidates = [
        desktop_dir / clean_p,
        docs_dir / clean_p,
        downloads_dir / clean_p,
        home / clean_p,
    ]
    for c in candidates:
        if c.exists():
            return c.resolve()

    # Se ainda não existe (ex: nova pasta ou novo arquivo), cria no Desktop do usuário
    return (desktop_dir / clean_p).resolve()


def create_folder(path: str) -> str:
    """
    Cria uma nova pasta ou diretório no computador do usuário.
    Pode ser um nome simples (ex: 'teste', 'Projetos', 'Viagem') que será criado no Desktop do usuário,
    ou um caminho especificado (ex: 'Documentos/Projetos', 'Desktop/teste').
    """
    is_cloud = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))
    if is_cloud:
        return f"Comando para criar pasta '{path}' despachado para execução no Windows Desktop do usuário."

    try:
        target = resolve_friendly_path(path)
        blocked, reason = is_blocked_path(target)
        if blocked:
            return reason

        target.mkdir(parents=True, exist_ok=True)
        return f"Sucesso: Pasta '{target.name}' criada com sucesso em '{target.parent}'."
    except Exception as e:
        logger.error(f"Erro em create_folder: {e}")
        return f"Erro ao criar a pasta: {str(e)}"


def list_directory(path: str = "Documentos") -> str:
    """
    Lista os arquivos e subdiretórios de um diretório específico.
    """
    is_cloud = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))
    if is_cloud:
        return f"Solicitação de listagem do diretório '{path}' despachada para o Windows Desktop do usuário."

    try:
        target = resolve_friendly_path(path)
        blocked, reason = is_blocked_path(target)
        if blocked:
            return reason

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
            return f"O diretório '{target.name}' está vazio (ou só contém arquivos ocultos)."

        items.sort()
        return f"Conteúdo da pasta '{target}':\n" + "\n".join(items)
    except Exception as e:
        logger.error(f"Erro em list_directory: {e}")
        return f"Erro ao listar o diretório: {str(e)}"


def read_file(path: str, start_line: int = 1, end_line: int = None) -> str:
    """
    Lê o conteúdo de um arquivo de texto, código ou configuração.
    Permite ler partes específicas passando start_line e end_line.
    """
    is_cloud = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))
    if is_cloud:
        return f"Solicitação de leitura do arquivo '{path}' despachada para o Windows Desktop do usuário."

    try:
        target = resolve_friendly_path(path)
        blocked, reason = is_blocked_path(target)
        if blocked:
            return reason

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
    is_cloud = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))
    if is_cloud:
        return f"Comando para gravar no arquivo '{path}' despachado para o Windows Desktop do usuário."

    try:
        target = resolve_friendly_path(path)
        blocked, reason = is_blocked_path(target)
        if blocked:
            return reason

        target.parent.mkdir(parents=True, exist_ok=True)
        with open(target, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Sucesso: Arquivo '{target.name}' foi escrito com sucesso em '{target.parent}'."
    except Exception as e:
        logger.error(f"Erro em write_file: {e}")
        return f"Erro ao escrever no arquivo: {str(e)}"


def replace_in_file(path: str, target_text: str, replacement_text: str) -> str:
    """
    Busca um texto específico dentro de um arquivo e o substitui por outro.
    """
    is_cloud = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))
    if is_cloud:
        return f"Solicitação de alteração no arquivo '{path}' despachada para o Windows Desktop do usuário."

    try:
        target = resolve_friendly_path(path)
        blocked, reason = is_blocked_path(target)
        if blocked:
            return reason

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
