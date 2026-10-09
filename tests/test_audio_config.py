import pytest

def test_audio_config_fields():
    from config import config
    assert hasattr(config, "elevenlabs_api_key"), "Missing elevenlabs_api_key"
    assert hasattr(config, "elevenlabs_voice_id"), "Missing elevenlabs_voice_id"
    assert hasattr(config, "elevenlabs_model_id"), "Missing elevenlabs_model_id"
    assert hasattr(config, "groq_stt_model"), "Missing groq_stt_model"
    assert hasattr(config, "tts_provider"), "Missing tts_provider"
    assert hasattr(config, "chatterbox_api_url"), "Missing chatterbox_api_url"
    assert hasattr(config, "chatterbox_model_type"), "Missing chatterbox_model_type"
    assert hasattr(config, "wake_word"), "Missing wake_word"
    assert hasattr(config, "wake_word_enabled"), "Missing wake_word_enabled"
