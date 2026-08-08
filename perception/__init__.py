"""Entrada e saída de áudio."""

from perception.stt import SpeechToText
from perception.tts import TextToSpeech
from perception.wakeword import WakeWordDetector

__all__ = ["SpeechToText", "TextToSpeech", "WakeWordDetector"]
