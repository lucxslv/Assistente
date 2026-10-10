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


def test_websocket_chat_passes_history_and_user_context():
    """Garante que o pipeline de streaming do WebSocket recebe histórico e identidade do usuário."""
    import asyncio
    from unittest.mock import AsyncMock, MagicMock, patch
    from api.routes.chat import chat_ws

    mock_ws = AsyncMock()
    mock_ws.query_params = {"token": "test_tok", "client_type": "desktop"}

    received_calls = []

    # Simula ciclo de 1 mensagem do websocket
    messages = [
        {"type": "chat", "message": "Qual o próximo passo?", "thread_id": "thread_ws_123"},
    ]

    async def mock_receive_json():
        if messages:
            return messages.pop(0)
        from fastapi import WebSocketDisconnect
        raise WebSocketDisconnect()

    mock_ws.receive_json = mock_receive_json

    user_info = {"id": "user_ws_test", "name": "Lucas Dev", "email": "lucas@test.com"}

    async def run():
        with patch("api.routes.auth.verify_supabase_token", AsyncMock(return_value=user_info)), \
             patch("api.routes.chat._prepare_session_and_store_user_message", AsyncMock(return_value="thread_ws_123")), \
             patch("api.routes.chat._load_thread_history", AsyncMock(return_value=[
                 {"role": "user", "content": "Primeiro passo executado"},
                 {"role": "assistant", "content": "Perfeito, registrado."},
             ])) as mock_load_hist, \
             patch("api.routes.chat._store_assistant_message", AsyncMock()):

            mock_pipeline = MagicMock()

            async def mock_run_stream(*args, **kwargs):
                received_calls.append({"args": args, "kwargs": kwargs})
                from core.streaming import StreamEvent
                yield StreamEvent(type="token", data={"token": "Próximo passo é..."})
                yield StreamEvent(type="done", data={"reply": "Próximo passo é..."})

            mock_pipeline.run_pipeline_stream = mock_run_stream

            with patch("api.routes.chat.get_pipeline", return_value=mock_pipeline):
                try:
                    await chat_ws(mock_ws)
                except Exception:
                    pass

            assert mock_load_hist.call_count == 1
            assert len(received_calls) == 1
            call_kwargs = received_calls[0]["kwargs"]
            assert call_kwargs.get("user_id") == "user_ws_test"
            assert call_kwargs.get("user_name") == "Lucas Dev"
            assert call_kwargs.get("history") is not None
            assert len(call_kwargs.get("history")) == 2
            assert call_kwargs["history"][0]["content"] == "Primeiro passo executado"

    asyncio.run(run())
