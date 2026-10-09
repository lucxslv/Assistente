import asyncio
from pathlib import Path
import pytest

from audio.tts.tts import TextToSpeech


def test_clean_text_for_speech():
    tts = TextToSpeech()
    dirty_text = "Aqui está: ```python\nprint(123)\n``` e visite https://github.com/lucas para ver mais. **Importante**!"
    cleaned = tts._clean_text(dirty_text)
    assert "```" not in cleaned
    assert "print(123)" not in cleaned
    assert "https://" not in cleaned
    assert "**" not in cleaned
    assert "Importante" in cleaned


def test_elevenlabs_fallback_to_edge(monkeypatch):
    tts = TextToSpeech()
    tts.provider = "elevenlabs"

    # Simula falha no ElevenLabs (ex: 401 ou 429)
    async def mock_fail(text):
        return None

    monkeypatch.setattr(tts, "_synthesize_elevenlabs", mock_fail)

    # Simula sucesso no Edge
    async def mock_edge(text):
        return Path("mock_edge.mp3")

    monkeypatch.setattr(tts, "_synthesize_edge", mock_edge)

    result_path = asyncio.run(tts._synthesize("Olá Charlie"))
    assert result_path == Path("mock_edge.mp3")


def test_chatterbox_success(monkeypatch):
    tts = TextToSpeech()
    tts.provider = "chatterbox"
    tts.chatterbox_api_url = "https://mock--chatterbox.modal.run"

    async def mock_chatterbox(text):
        return Path("mock_chatterbox.wav")

    monkeypatch.setattr(tts, "_synthesize_chatterbox", mock_chatterbox)

    result_path = asyncio.run(tts._synthesize("Teste Chatterbox"))
    assert result_path == Path("mock_chatterbox.wav")


def test_chatterbox_fallback_to_edge(monkeypatch):
    tts = TextToSpeech()
    tts.provider = "chatterbox"
    tts.chatterbox_api_url = "https://mock--chatterbox.modal.run"

    async def mock_fail(text):
        return None

    monkeypatch.setattr(tts, "_synthesize_chatterbox", mock_fail)

    async def mock_edge(text):
        return Path("mock_edge.mp3")

    monkeypatch.setattr(tts, "_synthesize_edge", mock_edge)

    result_path = asyncio.run(tts._synthesize("Olá Charlie Chatterbox"))
    assert result_path == Path("mock_edge.mp3")
