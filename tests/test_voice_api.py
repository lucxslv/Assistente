import pytest
from fastapi.testclient import TestClient
from api.main import app


def test_get_voice_status():
    client = TestClient(app)
    response = client.get("/api/voice/status")
    assert response.status_code == 200
    data = response.json()
    assert "running" in data
    assert "state" in data
    assert "tts_provider" in data


def test_toggle_voice_service():
    client = TestClient(app)
    response = client.post("/api/voice/toggle", json={"enabled": False})
    assert response.status_code == 200
    data = response.json()
    assert data["running"] is False


def test_voice_test_synthesis(monkeypatch):
    client = TestClient(app)
    from audio.service import voice_service

    async def mock_speak(text):
        return None

    monkeypatch.setattr(voice_service.tts, "speak", mock_speak)

    response = client.post("/api/voice/test", json={"text": "Teste de voz do Charlie"})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
