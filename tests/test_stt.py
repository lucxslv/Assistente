import dataclasses
import numpy as np
import pytest
from config import config
from audio.stt.stt import SpeechToText


def test_transcribe_groq_empty_audio():
    stt = SpeechToText()
    result = stt._transcribe_groq(np.array([], dtype=np.float32))
    assert result is None


def test_transcribe_groq_success(monkeypatch):
    stt = SpeechToText()
    mock_audio = np.zeros(8000, dtype=np.float32)

    class MockResponse:
        status_code = 200
        def raise_for_status(self):
            pass
        def json(self):
            return {"text": "Olá Charlie, como você está?"}

    monkeypatch.setattr("httpx.post", lambda *args, **kwargs: MockResponse())
    mock_cfg = dataclasses.replace(config, groq_api_key="mock_key")
    monkeypatch.setattr("audio.stt.stt.config", mock_cfg)

    result = stt._transcribe_groq(mock_audio)
    assert result == "Olá Charlie, como você está?"


def test_transcribe_groq_hallucination_filter(monkeypatch):
    stt = SpeechToText()
    mock_audio = np.zeros(8000, dtype=np.float32)

    class MockResponse:
        status_code = 200
        def raise_for_status(self):
            pass
        def json(self):
            return {"text": "Muito obrigado por assistir ao canal [Música]"}

    monkeypatch.setattr("httpx.post", lambda *args, **kwargs: MockResponse())
    mock_cfg = dataclasses.replace(config, groq_api_key="mock_key")
    monkeypatch.setattr("audio.stt.stt.config", mock_cfg)

    result = stt._transcribe_groq(mock_audio)
    assert result is None
