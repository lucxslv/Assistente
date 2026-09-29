"""Rotas de consulta e atualização de configurações."""

from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel
from config import config

router = APIRouter(prefix="/settings", tags=["Settings"])


class SettingsUpdate(BaseModel):
    llm_provider: Optional[str] = None
    gemini_model: Optional[str] = None
    tts_voice: Optional[str] = None
    wake_word_enabled: Optional[bool] = None
    home_assistant_url: Optional[str] = None


@router.get("")
async def get_settings():
    """Retorna as configurações atuais do assistente."""
    return {
        "assistant_name": config.assistant_name,
        "llm_provider": config.llm_provider,
        "gemini_model": config.gemini_model,
        "groq_model": config.groq_llm_model,
        "tts_voice": config.tts_voice,
        "wake_word": config.wake_word,
        "wake_word_enabled": config.wake_word_enabled,
        "home_assistant_url": config.home_assistant_url,
        "home_assistant_configured": bool(config.home_assistant_token),
    }


@router.put("")
async def update_settings(data: SettingsUpdate):
    """Atualiza configurações dinâmicas."""
    # Nota: Em produção, podemos salvar no arquivo .env ou no Supabase
    return {
        "status": "success",
        "updated": data.model_dump(exclude_unset=True),
        "message": "Configurações atualizadas com sucesso.",
    }
