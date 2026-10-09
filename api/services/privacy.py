"""Serviço de privacidade de dados, pseudonimização de PII e sanitização de logs do Charlie."""

from __future__ import annotations
import re
from typing import Optional

# Padrões de chaves de API conhecidas
SENSITIVE_KEY_PATTERNS = [
    re.compile(r"sk-[a-zA-Z0-9_-]{20,}"),          # OpenAI / Anthropic
    re.compile(r"AIzaSy[a-zA-Z0-9_-]{8,}"),         # Google Gemini / Firebase
    re.compile(r"ghp_[a-zA-Z0-9]{30,}"),            # GitHub Personal Token
    re.compile(r"xox[baprs]-[a-zA-Z0-9-]+"),       # Slack Token
    re.compile(r"Bearer\s+[a-zA-Z0-9\._-]{20,}", re.IGNORECASE),  # Bearer JWT
]


def mask_email(email: Optional[str]) -> str:
    """Pseudonimiza endereços de e-mail para exibição em relatórios e logs.

    Exemplo: lucas.silva@empresa.com -> lu***@empresa.com
    """
    if not email or not isinstance(email, str) or "@" not in email:
        return "N/A"

    parts = email.strip().split("@", 1)
    user_part = parts[0]
    domain_part = parts[1]

    if len(user_part) <= 2:
        masked_user = user_part[0] + "***" if user_part else "***"
    else:
        masked_user = user_part[:2] + "***"

    return f"{masked_user}@{domain_part}"


def mask_ip(ip: Optional[str]) -> str:
    """Mascara endereços IP para prevenir identificação precisa de localização e dispositivo.

    IPv4: Mascara os dois últimos octetos (ex: 192.168.1.50 -> 192.168.***.***).
    IPv6: Mascara a partir do segundo grupo.
    """
    if not ip or not isinstance(ip, str) or ip.strip() in ("", "N/A"):
        return "N/A"

    ip_str = ip.strip()

    # IPv4
    if "." in ip_str and ":" not in ip_str:
        octets = ip_str.split(".")
        if len(octets) == 4:
            return f"{octets[0]}.{octets[1]}.***.***"
        return f"{octets[0]}.***.***.***"

    # IPv6
    if ":" in ip_str:
        groups = ip_str.split(":")
        if len(groups) >= 2:
            return f"{groups[0]}:{groups[1]}:***:***"
        return f"{groups[0]}:***:***"

    return "N/A"


def sanitize_log_message(msg: str, max_length: int = 1000) -> str:
    """Neutraliza quebras de linha e caracteres de controle para evitar Log Injection / Forging.

    Substitui \r e \n por espaços e trunca comprimentos anômalos.
    """
    if not msg:
        return ""

    # Converte quebras de linha em espaços
    sanitized = msg.replace("\r", " ").replace("\n", " ")

    # Remove caracteres de controle ASCII perigosos (0x00 - 0x1F exceto espaço)
    sanitized = re.sub(r"[\x00-\x1f\x7f]", "", sanitized)

    # Reduz espaços múltiplos repetidos
    sanitized = re.sub(r"\s+", " ", sanitized).strip()

    if len(sanitized) > max_length:
        sanitized = sanitized[:max_length] + " [TRUNCATED]"

    return sanitized


def redact_sensitive_credentials(text: str) -> str:
    """Substitui credenciais e chaves de API por [REDACTED_KEY]."""
    if not text:
        return ""

    redacted = text
    for pattern in SENSITIVE_KEY_PATTERNS:
        redacted = pattern.sub("[REDACTED_KEY]", redacted)

    return redacted
