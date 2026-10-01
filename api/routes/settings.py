"""Rotas de consulta e atualização de configurações."""

from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from config import config
from api.routes.auth import get_current_user
from memory.database import db

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
    return {
        "status": "success",
        "updated": data.model_dump(exclude_unset=True),
        "message": "Configurações atualizadas com sucesso.",
    }


@router.get("/memory")
async def get_user_memory(user: dict = Depends(get_current_user)):
    """Retorna as memórias semânticas e episódicas do usuário autenticado."""
    user_id = str(user["id"])
    facts = db.get_all_facts(user_id=user_id)
    prefs = db.get_all_preferences(user_id=user_id)
    return {
        "user_id": user_id,
        "facts": facts,
        "preferences": prefs,
        "count": len(facts),
    }


@router.get("/user-model")
async def get_user_model_profile(user: dict = Depends(get_current_user)):
    """Retorna o modelo comportamental adaptativo do usuário e os traços do Charlie Core."""
    from brain.personality.user_model import user_model_manager
    from brain.personality.charlie_core import charlie_core
    user_id = str(user["id"])
    model = user_model_manager.get_user_model(user_id=user_id)
    return {
        "user_id": user_id,
        "charlie_core": {
            "name": charlie_core.name,
            "traits": charlie_core.traits.to_dict(),
        },
        "user_model": {
            "communication": model.communication.to_dict(),
            "interaction": model.interaction.to_dict(),
            "traits": model.traits,
            "stats": model.stats,
            "updated_at": model.updated_at,
        },
    }


@router.delete("/memory")
async def clear_user_memory(user: dict = Depends(get_current_user)):
    """Limpa todas as memórias episódicas e preferências do usuário autenticado."""
    user_id = str(user["id"])
    db.clear_all_memories(user_id=user_id)
    return {
        "status": "success",
        "message": "Memórias episódicas apagadas com sucesso.",
    }
