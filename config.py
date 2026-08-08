"""Carregamento de variáveis e configurações gerais."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Config:
    """Configurações centralizadas da assistente."""

    # LLM
    llm_provider: str = os.getenv("LLM_PROVIDER", "openai")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "llama3.2")
    openrouter_api_key: str = os.getenv("OPENROUTER_API_KEY", "")
    openrouter_model: str = os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct")
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    groq_llm_model: str = os.getenv("GROQ_LLM_MODEL", "llama-3.3-70b-versatile")

    # Áudio
    stt_provider: str = os.getenv("STT_PROVIDER", "whisper")
    whisper_model: str = os.getenv("WHISPER_MODEL", "base")
    whisper_device: str = os.getenv("WHISPER_DEVICE", "auto")
    whisper_compute_type: str = os.getenv("WHISPER_COMPUTE_TYPE", "default")
    whisper_vad_filter: bool = _bool(os.getenv("WHISPER_VAD_FILTER"), True)
    whisper_beam_size: int = int(os.getenv("WHISPER_BEAM_SIZE", "5"))
    stt_silence_threshold: float = float(os.getenv("STT_SILENCE_THRESHOLD", "0.01"))
    stt_silence_duration: float = float(os.getenv("STT_SILENCE_DURATION", "1.2"))
    stt_max_duration: float = float(os.getenv("STT_MAX_DURATION", "30.0"))
    tts_provider: str = os.getenv("TTS_PROVIDER", "edge")
    tts_voice: str = os.getenv("TTS_VOICE", "pt-BR-FranciscaNeural")
    wake_word: str = os.getenv("WAKE_WORD", "assistente")
    wake_word_enabled: bool = _bool(os.getenv("WAKE_WORD_ENABLED"), False)

    # Integrações
    home_assistant_url: str = os.getenv("HOME_ASSISTANT_URL", "")
    home_assistant_token: str = os.getenv("HOME_ASSISTANT_TOKEN", "")
    openweather_api_key: str = os.getenv("OPENWEATHER_API_KEY", "")

    # Geral
    assistant_name: str = os.getenv("ASSISTANT_NAME", "Assistente")
    max_history_messages: int = int(os.getenv("MAX_HISTORY_MESSAGES", "20"))
    language: str = os.getenv("LANGUAGE", "pt-BR")


config = Config()
