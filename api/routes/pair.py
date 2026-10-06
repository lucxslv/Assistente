"""Rotas de pareamento e autenticação segura entre Desktop (Tauri) e Mobile (Expo).

Diretrizes de Segurança Implementadas:
1. Segredo Efêmero: Sessão criada com UUIDv4, pairing_secret criptográfico (32 bytes) e TTL de 5 minutos.
2. Rate Limiting no PIN: Máximo de 5 tentativas incorretas antes de invalidar o código contra força bruta.
3. Troca de Chaves Criptográfica: Validação em tempo constante (hmac.compare_digest) e emissão de
   token de longa duração 'charlie_dev_...' vinculado ao device_id e revogável a qualquer momento.
"""

import hmac
import json
import logging
import os
import secrets
import socket
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status
from api.db import get_or_init_db_pool

logger = logging.getLogger("charlie.pair")

router = APIRouter(prefix="/pair", tags=["Pairing"])


def get_local_ip_addresses() -> List[str]:
    """Detecta os endereços IP da rede local (LAN) da máquina hospedeira, priorizando a interface física."""
    ips = []
    # 1. Primeiro tenta o socket UDP com rota ativa padrão (prioridade máxima para a interface física)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        routing_ip = s.getsockname()[0]
        s.close()
        if routing_ip and not routing_ip.startswith("127.") and not routing_ip.startswith("169.254."):
            ips.append(routing_ip)
    except Exception as e:
        logger.debug(f"Erro ao obter IP de roteamento: {e}")

    # 2. Adiciona outros IPs locais físicos conhecidos, excluindo explicitamente adaptadores virtuais
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if (
                not ip.startswith("127.")
                and not ip.startswith("169.254.")
                and not ip.startswith("192.168.56.")  # VirtualBox
                and not ip.startswith("172.26.")     # WSL / Hyper-V vEthernet
                and ip not in ips
            ):
                ips.append(ip)
    except Exception as e:
        logger.debug(f"Erro ao resolver IPs por hostname: {e}")

    return ips or ["127.0.0.1"]


class PairingSession:
    """Representa uma sessão efêmera de pareamento em memória."""

    def __init__(
        self,
        pairing_id: str,
        pin: str,
        secret: str,
        lan_url: str,
        tunnel_url: Optional[str],
        name: str,
        ttl_seconds: int = 300,
        max_attempts: int = 5,
    ):
        self.pairing_id = pairing_id
        self.pin = pin
        self.secret = secret
        self.lan_url = lan_url
        self.tunnel_url = tunnel_url
        self.name = name
        self.created_at = time.time()
        self.expires_at = self.created_at + ttl_seconds
        self.attempts = 0
        self.max_attempts = max_attempts
        self.paired = False
        self.paired_at: Optional[float] = None
        self.device_info: Optional[Dict[str, Any]] = None
        self.device_token: Optional[str] = None

    def is_expired(self) -> bool:
        return time.time() > self.expires_at


# Armazenamento em memória para sessões efêmeras ativas
_active_sessions: Dict[str, PairingSession] = {}  # pairing_id -> PairingSession
_pin_to_session_id: Dict[str, str] = {}  # clean_pin -> pairing_id

# Registro de dispositivos móveis autorizados e vinculados
_authorized_devices: Dict[str, Dict[str, Any]] = {}  # device_id -> device_data
_token_to_device: Dict[str, str] = {}  # device_token -> device_id

_DEVICES_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "authorized_devices.json"


def _load_authorized_devices() -> None:
    """Carrega dispositivos autorizados salvos em disco para persistir entre reinicializações."""
    try:
        if _DEVICES_FILE.exists():
            with open(_DEVICES_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    for dev_id, dev_info in data.items():
                        _authorized_devices[dev_id] = dev_info
                        token = dev_info.get("token")
                        if token:
                            _token_to_device[token] = dev_id
            logger.info(f"[PAIRING] {len(_authorized_devices)} dispositivo(s) carregado(s) do disco.")
    except Exception as e:
        logger.warning(f"Erro ao carregar dispositivos pareados do disco: {e}")


def _save_authorized_devices() -> None:
    """Persiste dispositivos autorizados no disco."""
    try:
        _DEVICES_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(_DEVICES_FILE, "w", encoding="utf-8") as f:
            json.dump(_authorized_devices, f, indent=2, ensure_ascii=False)
    except Exception as e:
        logger.warning(f"Erro ao persistir dispositivos pareados no disco: {e}")


_load_authorized_devices()


def _cleanup_expired_sessions() -> None:
    """Purga sessões expiradas da memória."""
    now = time.time()
    expired_ids = [s_id for s_id, s in _active_sessions.items() if s.is_expired()]
    for s_id in expired_ids:
        sess = _active_sessions.pop(s_id, None)
        if sess and sess.pin in _pin_to_session_id:
            _pin_to_session_id.pop(sess.pin, None)


def get_authorized_device_by_token(token: str) -> Optional[Dict[str, Any]]:
    """Consulta se um token pertence a um dispositivo móvel ativo e não revogado."""
    clean_token = token.replace("Bearer ", "").strip()
    device_id = _token_to_device.get(clean_token)
    if not device_id:
        return None
    device = _authorized_devices.get(device_id)
    if device:
        device["last_seen"] = time.time()
        return device
    return None


async def get_authorized_device_async(token: str) -> Optional[Dict[str, Any]]:
    """Consulta dispositivo por token, checando memória e Supabase (para ambiente serverless WAN)."""
    clean_token = token.replace("Bearer ", "").strip()
    dev = get_authorized_device_by_token(clean_token)
    if dev:
        return dev
    pool = await get_or_init_db_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                row = await conn.fetchrow("""
                    SELECT device_id, device_name, platform, token, paired_at, last_seen, permissions
                    FROM device_authorized_devices
                    WHERE token = $1;
                """, clean_token)
                if row:
                    dev_data = {
                        "device_id": row["device_id"],
                        "device_name": row["device_name"],
                        "platform": row["platform"],
                        "token": row["token"],
                        "paired_at": row["paired_at"],
                        "last_seen": time.time(),
                        "permissions": json.loads(row["permissions"]) if isinstance(row["permissions"], str) else (row["permissions"] or ["mobile_client"]),
                    }
                    _authorized_devices[row["device_id"]] = dev_data
                    _token_to_device[clean_token] = row["device_id"]
                    return dev_data
        except Exception as e:
            logger.warning(f"Erro ao buscar dispositivo no Supabase: {e}")
    return None


class PairInitRequest(BaseModel):
    name: Optional[str] = "Desktop Principal"
    port: Optional[int] = 8005
    local_ip: Optional[str] = None
    tunnel_url: Optional[str] = None


class VerifyPinRequest(BaseModel):
    pin: str
    device_name: Optional[str] = "Dispositivo Móvel"
    device_id: str
    platform: Optional[str] = None


class VerifyQrRequest(BaseModel):
    id: str
    secret: str
    device_name: Optional[str] = "Dispositivo Móvel"
    device_id: str
    platform: Optional[str] = None


@router.post("/init")
async def init_pairing(req: PairInitRequest):
    """Gera sessão de pareamento com PIN de 6 dígitos (secrets.randbelow), segredo efêmero e TTL de 5 min."""
    _cleanup_expired_sessions()

    # Gera PIN de 6 dígitos estritamente via secrets.randbelow (não previsível)
    pin = f"{secrets.randbelow(900000) + 100000}"
    while pin in _pin_to_session_id:
        pin = f"{secrets.randbelow(900000) + 100000}"

    pairing_id = str(uuid.uuid4())
    secret = secrets.token_urlsafe(32)

    # Identificação do IP local
    local_ips = get_local_ip_addresses()
    primary_ip = req.local_ip if (req.local_ip and not req.local_ip.startswith("127.")) else (local_ips[0] if local_ips else "127.0.0.1")
    port = req.port or int(os.getenv("PORT", "8005"))
    lan_url = f"http://{primary_ip}:{port}"

    tunnel_url = (
        req.tunnel_url
        or os.getenv("TUNNEL_URL")
        or os.getenv("PUBLIC_URL")
        or os.getenv("EXPO_PUBLIC_API_URL")
    )

    session = PairingSession(
        pairing_id=pairing_id,
        pin=pin,
        secret=secret,
        lan_url=lan_url,
        tunnel_url=tunnel_url,
        name=req.name or "Desktop Principal",
        ttl_seconds=300,
        max_attempts=5,
    )

    _active_sessions[pairing_id] = session
    _pin_to_session_id[pin] = pairing_id

    # Persistência no Supabase para garantir sincronização entre instâncias serverless na Nuvem
    pool = await get_or_init_db_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO device_pairing_sessions (
                        pairing_id, pin, secret, lan_url, tunnel_url, name, expires_at, attempts, paired
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, FALSE)
                    ON CONFLICT (pairing_id) DO UPDATE
                    SET pin = EXCLUDED.pin, secret = EXCLUDED.secret, expires_at = EXCLUDED.expires_at;
                """, pairing_id, pin, secret, lan_url, tunnel_url, req.name or "Desktop Principal", session.expires_at)
        except Exception as e:
            logger.warning(f"Aviso ao salvar sessão de pareamento no Supabase: {e}")

    qr_payload = {
        "v": 1,
        "id": pairing_id,
        "lan": lan_url,
        "tunnel": tunnel_url,
        "secret": secret,
        "pin": pin,
        "name": req.name or "Desktop Principal",
    }

    logger.info(f"[PAIRING] Nova sessão gerada: ID={pairing_id} | PIN={pin} | LAN={lan_url}")

    return {
        "status": "ok",
        "pairing_id": pairing_id,
        "id": pairing_id,
        "pin": pin,
        "formatted_pin": f"{pin[:3]}-{pin[3:]}",
        "lan_url": lan_url,
        "lanUrl": lan_url,
        "tunnel_url": tunnel_url,
        "tunnelUrl": tunnel_url,
        "expires_in": 300,
        "expiresInSeconds": 300,
        "secret": secret,
        "token": secret,
        "name": req.name or "Desktop Principal",
        "qr_payload": qr_payload,
        "qrPayload": qr_payload,
    }


@router.post("/verify-pin")
async def verify_pin(req: VerifyPinRequest):
    """Valida o PIN de 6 dígitos com rate limiting (máximo 5 tentativas) e emite token de longa duração."""
    _cleanup_expired_sessions()

    clean_pin = req.pin.replace("-", "").replace(" ", "").strip()
    session_id = _pin_to_session_id.get(clean_pin)

    # Se não encontrado na memória local desta lambda, tenta resgatar do Supabase
    if not session_id or session_id not in _active_sessions:
        pool = await get_or_init_db_pool()
        if pool:
            try:
                async with pool.acquire() as conn:
                    row = await conn.fetchrow("""
                        SELECT pairing_id, pin, secret, lan_url, tunnel_url, name, expires_at, attempts, paired
                        FROM device_pairing_sessions
                        WHERE pin = $1 AND expires_at > $2 AND paired = FALSE;
                    """, clean_pin, time.time())
                    if row:
                        session = PairingSession(
                            pairing_id=row["pairing_id"],
                            pin=row["pin"],
                            secret=row["secret"],
                            lan_url=row["lan_url"] or "",
                            tunnel_url=row["tunnel_url"],
                            name=row["name"] or "Desktop Principal",
                            ttl_seconds=max(10, int(row["expires_at"] - time.time())),
                        )
                        session.attempts = row["attempts"] or 0
                        _active_sessions[row["pairing_id"]] = session
                        _pin_to_session_id[clean_pin] = row["pairing_id"]
                        session_id = row["pairing_id"]
            except Exception as e:
                logger.warning(f"Erro ao buscar sessão no Supabase por PIN: {e}")

    if not session_id or session_id not in _active_sessions:
        # Proteção contra força bruta em rede
        active_sess_list = [s for s in _active_sessions.values() if not s.is_expired() and not s.paired]
        if active_sess_list:
            target_sess = active_sess_list[0]
            target_sess.attempts += 1
            remaining = target_sess.max_attempts - target_sess.attempts
            if remaining <= 0:
                _active_sessions.pop(target_sess.pairing_id, None)
                _pin_to_session_id.pop(target_sess.pin, None)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="PIN bloqueado por excesso de tentativas. Gere um novo código no Desktop.",
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"PIN incorreto. {remaining} tentativa(s) restante(s).",
            )

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Código PIN não encontrado ou expirado. Gere um novo no Desktop.",
        )

    session = _active_sessions[session_id]

    if session.is_expired():
        _active_sessions.pop(session_id, None)
        _pin_to_session_id.pop(clean_pin, None)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Código PIN expirado. Gere um novo no Desktop.",
        )

    # Proteção contra força bruta: máximo 5 tentativas
    if session.attempts >= session.max_attempts:
        _active_sessions.pop(session_id, None)
        _pin_to_session_id.pop(clean_pin, None)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="PIN bloqueado por excesso de tentativas. Gere um novo código no Desktop.",
        )

    # Comparação segura do PIN em tempo constante
    if not hmac.compare_digest(session.pin, clean_pin):
        session.attempts += 1
        remaining = session.max_attempts - session.attempts
        if remaining <= 0:
            _active_sessions.pop(session_id, None)
            _pin_to_session_id.pop(clean_pin, None)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="PIN bloqueado por excesso de tentativas. Gere um novo código no Desktop.",
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"PIN incorreto. {remaining} tentativa(s) restante(s).",
        )

    # PIN correto: Emite credencial permanente vinculada ao device_id
    device_token = f"charlie_dev_{secrets.token_urlsafe(32)}"
    now = time.time()
    device_data = {
        "device_id": req.device_id,
        "device_name": req.device_name or "Dispositivo Móvel",
        "platform": req.platform or "mobile",
        "token": device_token,
        "paired_at": now,
        "last_seen": now,
        "permissions": ["mobile_client"],
    }

    _authorized_devices[req.device_id] = device_data
    _token_to_device[device_token] = req.device_id
    _save_authorized_devices()

    session.paired = True
    session.paired_at = now
    session.device_token = device_token
    session.device_info = {
        "device_id": req.device_id,
        "device_name": req.device_name,
        "platform": req.platform,
    }

    # Atualiza no Supabase
    pool = await get_or_init_db_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                await conn.execute("""
                    UPDATE device_pairing_sessions
                    SET paired = TRUE, paired_at = $1, device_token = $2, device_info = $3::jsonb
                    WHERE pairing_id = $4;
                    INSERT INTO device_authorized_devices (device_id, device_name, platform, token, paired_at, last_seen, permissions)
                    VALUES ($5, $6, $7, $8, $9, $10, $11::jsonb)
                    ON CONFLICT (device_id) DO UPDATE
                    SET token = EXCLUDED.token, last_seen = EXCLUDED.last_seen;
                """, now, device_token, json.dumps(session.device_info), session.pairing_id,
                req.device_id, req.device_name or "Dispositivo Móvel", req.platform or "mobile", device_token, now, now, json.dumps(["mobile_client"]))
        except Exception as e:
            logger.warning(f"Erro ao salvar pareamento no Supabase: {e}")

    _pin_to_session_id.pop(clean_pin, None)
    logger.info(f"[PAIRING] Mobile {req.device_name} ({req.device_id}) pareado com sucesso via PIN!")

    return {
        "status": "ok",
        "token": device_token,
        "device_id": req.device_id,
        "device_name": req.device_name,
        "server_name": session.name,
        "lan_url": session.lan_url,
        "tunnel_url": session.tunnel_url,
        "paired": True,
    }


@router.post("/verify-qr")
async def verify_qr(req: VerifyQrRequest):
    """Valida o QR Code via segredo de sessão (tempo constante) e emite token de longa duração."""
    _cleanup_expired_sessions()

    session = _active_sessions.get(req.id)

    # Se não encontrado na memória desta instância serverless, tenta resgatar do Supabase
    if not session or session.is_expired():
        pool = await get_or_init_db_pool()
        if pool:
            try:
                async with pool.acquire() as conn:
                    row = await conn.fetchrow("""
                        SELECT pairing_id, pin, secret, lan_url, tunnel_url, name, expires_at, attempts, paired
                        FROM device_pairing_sessions
                        WHERE pairing_id = $1 AND expires_at > $2 AND paired = FALSE;
                    """, req.id, time.time())
                    if row:
                        session = PairingSession(
                            pairing_id=row["pairing_id"],
                            pin=row["pin"],
                            secret=row["secret"],
                            lan_url=row["lan_url"] or "",
                            tunnel_url=row["tunnel_url"],
                            name=row["name"] or "Desktop Principal",
                            ttl_seconds=max(10, int(row["expires_at"] - time.time())),
                        )
                        session.attempts = row["attempts"] or 0
                        _active_sessions[row["pairing_id"]] = session
            except Exception as e:
                logger.warning(f"Erro ao buscar sessão no Supabase por ID: {e}")

    if not session or session.is_expired():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Sessão de pareamento não encontrada ou expirada. Gere um novo QR Code.",
        )

    if session.attempts >= session.max_attempts:
        _active_sessions.pop(req.id, None)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Sessão bloqueada por excesso de tentativas inválidas.",
        )

    # Comparação criptográfica de tempo constante contra timing-attacks
    if not hmac.compare_digest(session.secret, req.secret):
        session.attempts += 1
        if session.attempts >= session.max_attempts:
            _active_sessions.pop(req.id, None)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Sessão bloqueada por excesso de tentativas inválidas.",
            )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Segredo de pareamento inválido.",
        )

    device_token = f"charlie_dev_{secrets.token_urlsafe(32)}"
    now = time.time()
    device_data = {
        "device_id": req.device_id,
        "device_name": req.device_name or "Dispositivo Móvel",
        "platform": req.platform or "mobile",
        "token": device_token,
        "paired_at": now,
        "last_seen": now,
        "permissions": ["mobile_client"],
    }

    _authorized_devices[req.device_id] = device_data
    _token_to_device[device_token] = req.device_id
    _save_authorized_devices()

    session.paired = True
    session.paired_at = now
    session.device_token = device_token
    session.device_info = {
        "device_id": req.device_id,
        "device_name": req.device_name,
        "platform": req.platform,
    }

    # Atualiza no Supabase
    pool = await get_or_init_db_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                await conn.execute("""
                    UPDATE device_pairing_sessions
                    SET paired = TRUE, paired_at = $1, device_token = $2, device_info = $3::jsonb
                    WHERE pairing_id = $4;
                    INSERT INTO device_authorized_devices (device_id, device_name, platform, token, paired_at, last_seen, permissions)
                    VALUES ($5, $6, $7, $8, $9, $10, $11::jsonb)
                    ON CONFLICT (device_id) DO UPDATE
                    SET token = EXCLUDED.token, last_seen = EXCLUDED.last_seen;
                """, now, device_token, json.dumps(session.device_info), session.pairing_id,
                req.device_id, req.device_name or "Dispositivo Móvel", req.platform or "mobile", device_token, now, now, json.dumps(["mobile_client"]))
        except Exception as e:
            logger.warning(f"Erro ao salvar pareamento QR no Supabase: {e}")

    logger.info(f"[PAIRING] Mobile {req.device_name} ({req.device_id}) pareado com sucesso via QR Code!")

    return {
        "status": "ok",
        "token": device_token,
        "device_id": req.device_id,
        "device_name": req.device_name,
        "server_name": session.name,
        "lan_url": session.lan_url,
        "tunnel_url": session.tunnel_url,
        "paired": True,
    }


@router.get("/status")
async def check_pairing_status(id: Optional[str] = None, pin: Optional[str] = None):
    """Desktop consulta se o mobile completou o pareamento via QR Code ou PIN."""
    session_id = id
    clean_pin = pin.replace("-", "").replace(" ", "").strip() if pin else None
    if not session_id and clean_pin:
        session_id = _pin_to_session_id.get(clean_pin)

    session = _active_sessions.get(session_id) if session_id else None

    # Se na memória local ainda não foi pareado, consulta o Supabase (para ambiente serverless WAN)
    if not session or not session.paired:
        pool = await get_or_init_db_pool()
        if pool:
            try:
                async with pool.acquire() as conn:
                    row = None
                    if session_id:
                        row = await conn.fetchrow("""
                            SELECT pairing_id, paired, paired_at, device_info, expires_at
                            FROM device_pairing_sessions WHERE pairing_id = $1;
                        """, session_id)
                    elif clean_pin:
                        row = await conn.fetchrow("""
                            SELECT pairing_id, paired, paired_at, device_info, expires_at
                            FROM device_pairing_sessions WHERE pin = $1;
                        """, clean_pin)

                    if row and row["paired"]:
                        dev_info = json.loads(row["device_info"]) if isinstance(row["device_info"], str) else (row["device_info"] or {})
                        return {
                            "paired": True,
                            "expired": False,
                            "paired_at": row["paired_at"],
                            "device": dev_info,
                        }
            except Exception as e:
                logger.warning(f"Erro ao consultar status no Supabase: {e}")

    if not session:
        return {"paired": False, "expired": True, "device": None}

    return {
        "paired": session.paired,
        "expired": session.is_expired(),
        "paired_at": session.paired_at,
        "device": session.device_info,
    }


@router.get("/devices")
async def list_authorized_devices():
    """Retorna a lista de dispositivos móveis pareados ativos (sem expor o segredo completo)."""
    devices_summary = []
    for d in _authorized_devices.values():
        devices_summary.append({
            "device_id": d["device_id"],
            "device_name": d["device_name"],
            "platform": d["platform"],
            "paired_at": d["paired_at"],
            "last_seen": d["last_seen"],
        })
    return {"status": "ok", "devices": devices_summary}


@router.delete("/devices/{device_id}")
async def revoke_device(device_id: str):
    """Revoga imediatamente o acesso de um dispositivo móvel previamente pareado."""
    device = _authorized_devices.pop(device_id, None)
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado.")

    token = device.get("token")
    if token and token in _token_to_device:
        _token_to_device.pop(token, None)

    _save_authorized_devices()

    logger.info(f"[PAIRING REVOKE] Dispositivo {device_id} ({device.get('device_name')}) revogado pelo usuário.")
    return {"status": "ok", "message": f"Dispositivo '{device.get('device_name')}' revogado com sucesso."}
