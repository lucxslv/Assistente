import pytest
import numpy as np
from unittest.mock import patch, MagicMock

from audio.wakeword.wakeword import WakeWordDetector


def test_wakeword_initialization():
    detector = WakeWordDetector()
    assert detector is not None
    assert hasattr(detector, "play_activation_chime")
    assert hasattr(detector, "wait_for_wake_word")
    assert hasattr(detector, "close")


def test_generate_chime_waveform():
    detector = WakeWordDetector()
    waveform = detector._generate_chime_audio()
    assert isinstance(waveform, np.ndarray)
    assert len(waveform) > 0
    # Deve ser float32 entre -1.0 e 1.0
    assert waveform.dtype == np.float32
    assert np.max(np.abs(waveform)) <= 1.0


def test_play_activation_chime_does_not_crash(monkeypatch):
    detector = WakeWordDetector()
    played = False

    def mock_play(data, sr):
        nonlocal played
        played = True

    monkeypatch.setattr("sounddevice.play", mock_play)
    monkeypatch.setattr("sounddevice.wait", lambda: None)

    detector.play_activation_chime()
    assert played is True
