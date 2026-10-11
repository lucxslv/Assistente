"""Rotas de consulta e atualização de configurações."""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from config import config
from api.routes.auth import get_current_user, require_local_or_authenticated
from memory.database import db

logger = logging.getLogger("charlie.api.settings")
router = APIRouter(prefix="/settings", tags=["Settings"])

_SETTINGS_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "runtime_settings.json"


def _load_persisted_settings() -> Dict[str, Any]:
    try:
        if _SETTINGS_FILE.exists():
            with open(_SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    for k, v in data.items():
                        if hasattr(config, k) and v is not None:
                            try:
                                setattr(config, k, v)
                            except Exception:
                                pass
                    return data
    except Exception as e:
        logger.warning(f"Aviso ao carregar runtime_settings.json: {e}")
    return {}


def _save_persisted_settings(updates: Dict[str, Any]) -> Dict[str, Any]:
    current = _load_persisted_settings()
    current.update({k: v for k, v in updates.items() if v is not None})
    try:
        _SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(_SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(current, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.warning(f"Aviso ao salvar runtime_settings.json: {e}")
    return current


# Carrega configurações persistidas na inicialização
_load_persisted_settings()


class SettingsUpdate(BaseModel):
    assistant_name: Optional[str] = None
    llm_provider: Optional[str] = None
    gemini_model: Optional[str] = None
    groq_model: Optional[str] = None
    tts_provider: Optional[str] = None
    tts_voice: Optional[str] = None
    stt_provider: Optional[str] = None
    wake_word: Optional[str] = None
    wake_word_enabled: Optional[bool] = None
    wake_word_sensitivity: Optional[float] = None
    home_assistant_url: Optional[str] = None
    home_assistant_token: Optional[str] = None
    knowledge_dirs: Optional[List[str]] = None
    auto_extract_memories: Optional[bool] = None
    global_shortcut: Optional[str] = None


class HomeAssistantTestRequest(BaseModel):
    url: Optional[str] = None
    token: Optional[str] = None


@router.get("")
async def get_settings(user: dict = Depends(require_local_or_authenticated)):
    """Retorna as configurações atuais do assistente."""
    persisted = _load_persisted_settings()
    return {
        "assistant_name": config.assistant_name,
        "llm_provider": config.llm_provider,
        "gemini_model": config.gemini_model,
        "groq_model": config.groq_llm_model,
        "tts_provider": getattr(config, "tts_provider", "elevenlabs"),
        "tts_voice": config.tts_voice,
        "stt_provider": getattr(config, "stt_provider", "groq"),
        "wake_word": config.wake_word,
        "wake_word_enabled": config.wake_word_enabled,
        "wake_word_sensitivity": persisted.get("wake_word_sensitivity", 0.65),
        "home_assistant_url": config.home_assistant_url,
        "home_assistant_configured": bool(config.home_assistant_token),
        "knowledge_dirs": persisted.get("knowledge_dirs", []),
        "auto_extract_memories": persisted.get("auto_extract_memories", True),
        "global_shortcut": persisted.get("global_shortcut", "Ctrl+Alt+Space"),
    }


@router.put("")
@router.patch("")
async def update_settings(
    data: SettingsUpdate,
    user: dict = Depends(require_local_or_authenticated),
):
    """Atualiza e persiste configurações dinâmicas do Charlie."""
    updates = data.model_dump(exclude_unset=True)

    field_map = {
        "assistant_name": "assistant_name",
        "llm_provider": "llm_provider",
        "gemini_model": "gemini_model",
        "groq_model": "groq_llm_model",
        "tts_provider": "tts_provider",
        "tts_voice": "tts_voice",
        "stt_provider": "stt_provider",
        "wake_word": "wake_word",
        "wake_word_enabled": "wake_word_enabled",
        "home_assistant_url": "home_assistant_url",
        "home_assistant_token": "home_assistant_token",
    }

    for key, val in updates.items():
        if val is not None and key in field_map:
            cfg_attr = field_map[key]
            try:
                setattr(config, cfg_attr, val)
            except Exception:
                pass

    # Persiste em disco (sem gravar token vazio se não enviado)
    persisted = _save_persisted_settings(updates)

    # Salva também nas preferências do usuário autenticado
    uid = str(user.get("id", "default"))
    if uid and uid not in ("default", "local-loopback"):
        for k, v in updates.items():
            if k != "home_assistant_token" and v is not None:
                try:
                    db.save_preference(f"setting_{k}", json.dumps(v) if isinstance(v, (list, dict, bool)) else str(v), user_id=uid)
                except Exception:
                    pass

    sanitized_updates = {k: ("***" if k == "home_assistant_token" and v else v) for k, v in updates.items()}
    return {
        "status": "success",
        "updated": sanitized_updates,
        "settings": {
            "assistant_name": config.assistant_name,
            "llm_provider": config.llm_provider,
            "gemini_model": config.gemini_model,
            "groq_model": config.groq_llm_model,
            "tts_provider": getattr(config, "tts_provider", "elevenlabs"),
            "tts_voice": config.tts_voice,
            "stt_provider": getattr(config, "stt_provider", "groq"),
            "wake_word": config.wake_word,
            "wake_word_enabled": config.wake_word_enabled,
            "wake_word_sensitivity": persisted.get("wake_word_sensitivity", 0.65),
            "home_assistant_url": config.home_assistant_url,
            "home_assistant_configured": bool(config.home_assistant_token),
            "knowledge_dirs": persisted.get("knowledge_dirs", []),
            "auto_extract_memories": persisted.get("auto_extract_memories", True),
            "global_shortcut": persisted.get("global_shortcut", "Ctrl+Alt+Space"),
        },
        "message": "Configurações atualizadas e salvas com sucesso.",
    }


@router.post("/test-ha")
async def test_home_assistant_connection(
    req: HomeAssistantTestRequest,
    user: dict = Depends(require_local_or_authenticated),
):
    """Testa de forma real a conectividade e autenticação com uma instância Home Assistant."""
    ha_url = (req.url or config.home_assistant_url or "").strip().rstrip("/")
    ha_token = (req.token or config.home_assistant_token or "").strip()

    if not ha_url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe a URL do Home Assistant para testar a conexão.",
        )
    if not (ha_url.startswith("http://") or ha_url.startswith("https://")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A URL do Home Assistant deve iniciar com http:// ou https://.",
        )

    headers = {"Content-Type": "application/json"}
    if ha_token:
        headers["Authorization"] = f"Bearer {ha_token}"

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{ha_url}/api/", headers=headers)
            if resp.status_code == 200:
                body = resp.json() if resp.content else {}
                return {
                    "status": "ok",
                    "connected": True,
                    "message": body.get("message", "Conectado ao Home Assistant com sucesso."),
                }
            elif resp.status_code in (401, 403):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Servidor Home Assistant acessível, mas o Token de Acesso (Long-Lived Access Token) foi recusado (401/403).",
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Home Assistant respondeu com status inesperado: HTTP {resp.status_code}.",
                )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Não foi possível conectar ao Home Assistant em '{ha_url}'. Verifique se o servidor está online e acessível na rede.",
        )


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
