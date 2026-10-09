"""Testes de privacidade, sanitização contra log injection e controle de acesso estrito."""

import pytest
from api.services.privacy import (
    mask_email,
    mask_ip,
    sanitize_log_message,
    redact_sensitive_credentials,
)


def test_mask_email_protects_pii():
    """Valida pseudonimização de e-mails em visualizações e logs."""
    assert mask_email("lucas.silva@empresa.com") == "lu***@empresa.com"
    assert mask_email("a@b.com") == "a***@b.com"
    assert mask_email("") == "N/A"
    assert mask_email(None) == "N/A"


def test_mask_ip_prevents_fingerprinting():
    """Valida mascaramento agressivo de IPs (dois últimos octetos de IPv4)."""
    assert mask_ip("192.168.1.150") == "192.168.***.***"
    assert mask_ip("200.189.12.34") == "200.189.***.***"
    assert mask_ip("127.0.0.1") == "127.0.***.***"
    assert mask_ip("2001:0db8:85a3:0000:0000:8a2e:0370:7334").startswith("2001:0db8:***")
    assert mask_ip(None) == "N/A"


def test_sanitize_log_message_prevents_log_injection():
    """Garante que quebras de linha e caracteres de controle sejam neutralizados para evitar log forging."""
    malicious_input = "User Login\r\n[CRITICAL] Admin access granted to attacker\nPayload executed"
    sanitized = sanitize_log_message(malicious_input)
    assert "\r" not in sanitized
    assert "\n" not in sanitized
    assert "[CRITICAL]" in sanitized or "Admin access" in sanitized


def test_redact_sensitive_credentials_strips_api_keys():
    """Garante que tokens de API e credenciais não vazem em mensagens de log."""
    text_with_keys = "Error connecting with key sk-proj-1234567890abcdef12345678 and AIzaSyD987654321"
    redacted = redact_sensitive_credentials(text_with_keys)
    assert "sk-proj-1234567890abcdef12345678" not in redacted
    assert "AIzaSyD987654321" not in redacted
    assert "[REDACTED_KEY]" in redacted
