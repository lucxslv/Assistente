"""Rotas de pareamento e descoberta entre Desktop (Tauri/Windows) e Mobile (Expo/React Native)."""

import logging
import os
import random
import secrets
import socket
import time
from typing import Dict, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

logger = logging.getLogger("charlie.pair")

router = APIRouter(prefix="/pair", tags=["Pairing"])


def get_local_ip_addresses() -> list[str]:
    """Detecta os endereços IP da rede local (LAN) da máquina hospedeira."""
    ips = []
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127.") and not ip.startswith("169.254."):
                ips.append(ip)
    except Exception as e:
        logger.debug(f"Erro ao resolver IPs por hostname: {e}")

    if not ips:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            if ip and not ip.startswith("127."):
                ips.append(ip)
        except Exception:
            pass

    return ips or ["127.0.0.1"]


class PairingSession:
    def __init__(self, pin: str, token: str, lan_url: str, tunnel_url: Optional[str], name: str, ttl_seconds: int = 300):
        self.pin = pin
        self.token = token
        self.lan_url = lan_url
        self.tunnel_url = tunnel_url
        self.name = name
        self.created_at = time.time()
        self.expires_at = self.created_at + ttl_seconds
        self.paired = False
        self.paired_at: Optional[float] = None
        self.device_info: Optional[dict] = None

    def is_expired(self) -> bool:
        return time.time() > self.expires_at


# In-memory store para sessões ativas de pareamento (PIN -> PairingSession)
_active_sessions: Dict[str, PairingSession] = {}
# Token -> PIN para consulta rápida de status
_token_to_pin: Dict[str, str] = {}


def _cleanup_expired_sessions():
    """Remove sessões expiradas da memória."""
    now = time.time()
    expired_pins = [pin for pin, session in _active_sessions.items() if session.expires_at < now]
    for pin in expired_pins:
        sess = _active_sessions.pop(pin, None)
        if sess and sess.token in _token_to_pin:
            _token_to_pin.pop(sess.token, None)


class PairInitRequest(BaseModel):
    name: Optional[str] = "Desktop Principal"
    port: Optional[int] = 8005
    tunnelUrl: Optional[str] = None


class PairVerifyPinRequest(BaseModel):
    pin: str
    deviceInfo: Optional[dict] = None


@router.post("/init")
async def init_pairing(req: PairInitRequest):
    """Gera um QR Code payload e um código PIN de 6 dígitos válido por 5 minutos."""
    _cleanup_expired_sessions()

    # Gera PIN de 6 dígitos legível
    pin = f"{random.randint(100000, 999999)}"
    # Garante unicidade
    while pin in _active_sessions and not _active_sessions[pin].is_expired():
        pin = f"{random.randint(100000, 999999)}"

    # Gera token de pareamento efêmero
    token = f"pair_{secrets.token_urlsafe(24)}"

    # Detecta melhor IP local
    local_ips = get_local_ip_addresses()
    primary_ip = local_ips[0] if local_ips else "127.0.0.1"
    port = req.port or int(os.getenv("PORT", "8005"))
    lan_url = f"http://{primary_ip}:{port}/api"

    # URL de túnel (Cloudflare, Tailscale ou Vercel se configurado)
    tunnel_url = (
        req.tunnelUrl
        or os.getenv("TUNNEL_URL")
        or os.getenv("PUBLIC_URL")
        or os.getenv("EXPO_PUBLIC_API_URL")
    )

    session = PairingSession(
        pin=pin,
        token=token,
        lan_url=lan_url,
        tunnel_url=tunnel_url,
        name=req.name or "Desktop Principal",
        ttl_seconds=300,  # 5 minutos
    )

    _active_sessions[pin] = session
    _token_to_pin[token] = pin

    logger.info(f"[PAIRING] Nova sessão de pareamento gerada. PIN: {pin} | LAN: {lan_url}")

    return {
        "status": "ok",
        "type": "charlie-pair",
        "pin": pin,
        "token": token,
        "name": session.name,
        "lanUrl": lan_url,
        "tunnelUrl": tunnel_url,
        "availableIps": local_ips,
        "expiresInSeconds": 300,
        "qrPayload": {
            "type": "charlie-pair",
            "name": session.name,
            "lanUrl": lan_url,
            "tunnelUrl": tunnel_url,
            "token": token,
            "pin": pin,
        },
    }


@router.post("/verify-pin")
async def verify_pin(req: PairVerifyPinRequest):
    """Valida o código PIN de 6 dígitos informado no mobile e retorna as credenciais do servidor."""
    _cleanup_expired_sessions()

    cleaned_pin = req.pin.replace("-", "").replace(" ", "").strip()
    session = _active_sessions.get(cleaned_pin)

    if not session or session.is_expired():
        raise HTTPException(status_code=404, detail="Código PIN inválido ou expirado. Gere um novo no Desktop.")

    session.paired = True
    session.paired_at = time.time()
    session.device_info = req.deviceInfo

    logger.info(f"[PAIRING] Dispositivo mobile pareado com sucesso via PIN {cleaned_pin}!")

    return {
        "status": "ok",
        "name": session.name,
        "lanUrl": session.lan_url,
        "tunnelUrl": session.tunnel_url,
        "token": session.token,
        "paired": True,
    }


@router.get("/status")
async def check_pairing_status(token: Optional[str] = None, pin: Optional[str] = None):
    """Desktop consulta se o mobile completou a leitura do QR Code ou confirmação do PIN."""
    target_pin = pin
    if not target_pin and token:
        target_pin = _token_to_pin.get(token)

    if not target_pin or target_pin not in _active_sessions:
        return {"paired": False, "expired": True}

    session = _active_sessions[target_pin]
    return {
        "paired": session.paired,
        "expired": session.is_expired(),
        "pairedAt": session.paired_at,
        "deviceInfo": session.device_info,
    }
