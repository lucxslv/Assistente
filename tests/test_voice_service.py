import asyncio
from unittest.mock import AsyncMock, MagicMock

from audio.service import VoiceService, VoiceState


def test_voice_service_initial_state():
    service = VoiceService()
    assert service.state == VoiceState.STOPPED
    status = service.get_status()
    assert status["running"] is False
    assert status["state"] == "stopped"
    assert "tts_provider" in status
    assert "stt_provider" in status
    assert "wake_word" in status


def test_voice_service_turn_execution(monkeypatch):
    service = VoiceService()

    # Mock dos componentes de áudio para teste isolado
    mock_pipeline = MagicMock()
    mock_pipeline.run_pipeline = AsyncMock(return_value="Olá! Estou funcionando perfeitamente.")

    service.pipeline = mock_pipeline
    service.stt = MagicMock()
    service.stt.transcribe = AsyncMock(return_value="Olá Charlie")
    service.tts = MagicMock()
    service.tts.speak = AsyncMock()

    # Executa um turno único do ciclo de voz
    success = asyncio.run(service.process_voice_turn())
    assert success is True
    assert mock_pipeline.run_pipeline.called
    assert service.tts.speak.called
    assert service.state == VoiceState.IDLE
