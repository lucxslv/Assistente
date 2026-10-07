"""Rotas da API FastAPI para gerenciamento do serviço de voz (ElevenLabs TTS, STT e Wake Word)."""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from audio.service import voice_service, VoiceState
from config import config

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/voice", tags=["voice"])


class ToggleVoiceRequest(BaseModel):
    enabled: bool


class SpeakRequest(BaseModel):
    text: str


class TestVoiceRequest(BaseModel):
    text: Optional[str] = None


@router.get("/status")
async def get_voice_status():
    """Retorna o status atual do serviço de voz e configurações ativas."""
    return voice_service.get_status()


@router.post("/toggle")
async def toggle_voice_service(req: ToggleVoiceRequest):
    """Liga ou desliga a escuta em segundo plano do Wake Word."""
    try:
        if req.enabled:
            await voice_service.start()
        else:
            await voice_service.stop()

        return {
            "status": "ok",
            "running": voice_service.state != VoiceState.STOPPED,
            "state": voice_service.state.value,
        }
    except Exception as e:
        logger.exception("Erro ao alternar estado do serviço de voz: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/speak")
async def speak_text(req: SpeakRequest):
    """Sintetiza um texto sob demanda no alto-falante via TTS."""
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="Texto vazio para reprodução de áudio.")

    try:
        await voice_service.tts.speak(req.text)
        return {"status": "ok", "message": "Áudio reproduzido com sucesso."}
    except Exception as e:
        logger.exception("Erro ao sintetizar áudio: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test")
async def test_voice(req: Optional[TestVoiceRequest] = None):
    """Reproduz uma frase de teste no alto-falante usando a voz configurada."""
    text_to_speak = (
        req.text if req and req.text
        else f"Olá! Esta é uma demonstração da voz configurada para o Charlie usando {config.tts_provider}."
    )

    try:
        await voice_service.tts.speak(text_to_speak)
        return {"status": "ok", "message": "Áudio de teste disparado com sucesso."}
    except Exception as e:
        logger.exception("Erro ao disparar áudio de teste: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
