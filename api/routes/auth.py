"""Rotas de autenticação própria, gerenciamento de sessões, recuperação de acesso e perfil de usuário."""

import base64
import datetime
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import time
import urllib.error
import urllib.request
import uuid
from collections import OrderedDict
from contextvars import ContextVar
from typing import Any, Dict, Optional, Tuple
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from api.db import get_or_init_db_pool
from api.security.rate_limiter import (
    is_user_suspended_in_memory,
    rate_limiter,
)
from config import config

logger = logging.getLogger("charlie.api.auth")

router = APIRouter(prefix="/auth", tags=["Auth"])

# Context variables para rastrear o usuário autenticado da requisição atual
current_user_id_var: ContextVar[str] = ContextVar("current_user_id", default="default")
current_user_email_var: ContextVar[str] = ContextVar("current_user_email", default="")
current_user_name_var: ContextVar[str] = ContextVar("current_user_name", default="")


class TokenCache:
    """Cache LRU delimitado com TTL de expiração e suporte a revogação imediata."""

    def __init__(self, max_size: int = 500, ttl_seconds: float = 60.0):
        self._cache: OrderedDict[str, tuple[float, dict]] = OrderedDict()
        self._max_size = max_size
        self._ttl_seconds = ttl_seconds

    def get(self, token: str) -> Optional[dict]:
        now = time.time()
        if token in self._cache:
            cached_time, user_info = self._cache[token]
            if now - cached_time < self._ttl_seconds:
                self._cache.move_to_end(token)
                return user_info
            else:
                del self._cache[token]
        return None

    def set(self, token: str, user_info: dict) -> None:
        now = time.time()
        if token in self._cache:
            del self._cache[token]
        elif len(self._cache) >= self._max_size:
            self._purge_expired(now)
            while len(self._cache) >= self._max_size:
                self._cache.popitem(last=False)
        self._cache[token] = (now, user_info)

    def invalidate(self, token: str) -> None:
        self._cache.pop(token, None)

    def invalidate_user(self, user_id: str, email: str = "") -> None:
        uid = str(user_id)
        em = (email or "").strip().lower()
        to_remove = [
            tok
            for tok, (_, info) in self._cache.items()
            if str(info.get("id")) == uid or (em and (info.get("email") or "").strip().lower() == em)
        ]
        for tok in to_remove:
            self._cache.pop(tok, None)

    def _purge_expired(self, now: float) -> None:
        expired = [k for k, (t, _) in self._cache.items() if now - t >= self._ttl_seconds]
        for k in expired:
            self._cache.pop(k, None)

    def clear(self) -> None:
        self._cache.clear()


_token_cache = TokenCache(max_size=500, ttl_seconds=60.0)

# Lista de revogação em memória para tokens encerrados via logout ou redefinição de senha
_revoked_token_hashes: OrderedDict[str, float] = OrderedDict()
# Sessões efêmeras emitidas localmente (admin local ou sessão própria)
_local_issued_sessions: OrderedDict[str, Tuple[float, dict]] = OrderedDict()
# Armazenamento em memória complementar para perfis e tokens de recuperação (testes / modo sem DB)
_in_memory_profiles: Dict[str, Dict[str, Any]] = {}
_in_memory_reset_tokens: Dict[str, Dict[str, Any]] = {}  # token_hash -> record


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()


def _revoke_token(raw_token: str, ttl_seconds: int = 86400 * 7) -> None:
    if not raw_token:
        return
    clean = raw_token.replace("Bearer ", "").strip()
    _token_cache.invalidate(clean)
    _local_issued_sessions.pop(clean, None)
    th = _hash_token(clean)
    now = time.time()
    while len(_revoked_token_hashes) >= 2000:
        _revoked_token_hashes.popitem(last=False)
    _revoked_token_hashes[th] = now + ttl_seconds


def _is_token_revoked(raw_token: str) -> bool:
    if not raw_token:
        return True
    th = _hash_token(raw_token.replace("Bearer ", "").strip())
    exp = _revoked_token_hashes.get(th)
    if exp is None:
        return False
    if time.time() >= exp:
        _revoked_token_hashes.pop(th, None)
        return False
    return True


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200000)
    return f"pbkdf2_sha256$200000${salt}${dk.hex()}"


def _verify_password_hash(password: str, encoded: str) -> bool:
    if not encoded or not encoded.startswith("pbkdf2_sha256$"):
        return False
    try:
        _, iterations_str, salt, expected_hex = encoded.split("$", 3)
        dk = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            int(iterations_str),
        )
        return hmac.compare_digest(dk.hex(), expected_hex)
    except Exception:
        return False


def _issue_local_session_token(user_info: dict, ttl_seconds: int = 86400 * 7) -> str:
    tok = f"charlie_sess_{secrets.token_urlsafe(32)}"
    now = time.time()
    while len(_local_issued_sessions) >= 500:
        _local_issued_sessions.popitem(last=False)
    _local_issued_sessions[tok] = (now + ttl_seconds, dict(user_info))
    _token_cache.set(tok, dict(user_info))
    return tok


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
    email: Optional[str] = None


class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    avatar_url: Optional[str] = None
    banner_url: Optional[str] = None
    website: Optional[str] = None
    bio: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    is_admin: bool = False
    role: str = "user"
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    avatar_url: Optional[str] = None
    banner_url: Optional[str] = None
    website: Optional[str] = None
    bio: Optional[str] = None


class AuthResponse(BaseModel):
    user: UserResponse
    token: str


async def _enrich_user_with_profile(user_info: dict) -> dict:
    """Mescla os campos de perfil (user_profiles / memória) no dicionário do usuário."""
    if not user_info or not user_info.get("id"):
        return user_info

    uid = str(user_info["id"])
    email = (user_info.get("email") or "").strip().lower()
    enriched = dict(user_info)

    # 1. Memória local
    mem_prof = _in_memory_profiles.get(uid) or (email and _in_memory_profiles.get(email))
    if mem_prof:
        for k in ("first_name", "last_name", "username", "avatar_url", "banner_url", "website", "bio"):
            if mem_prof.get(k) is not None:
                enriched[k] = mem_prof[k]
        if mem_prof.get("display_name"):
            enriched["name"] = mem_prof["display_name"]

    # 2. Banco de dados (se conectado)
    pool = await get_or_init_db_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    SELECT first_name, last_name, display_name, username,
                           avatar_url, banner_url, website, bio, role, is_suspended, suspended_reason
                    FROM public.user_profiles
                    WHERE user_id = $1 OR ($2 != '' AND LOWER(email) = $2)
                    LIMIT 1;
                    """,
                    uid,
                    email,
                )
                if row:
                    if row["display_name"]:
                        enriched["name"] = row["display_name"]
                    for k in ("first_name", "last_name", "username", "avatar_url", "banner_url", "website", "bio"):
                        if row[k] is not None:
                            enriched[k] = row[k]
                    if row["is_suspended"]:
                        enriched["is_suspended"] = True
                        enriched["suspended_reason"] = row["suspended_reason"]
        except Exception as e:
            logger.debug(f"Aviso ao enriquecer perfil de {uid}: {e}")

    # Deriva first_name / last_name a partir de name se ausentes
    if not enriched.get("first_name") and enriched.get("name"):
        parts = str(enriched["name"]).strip().split(" ", 1)
        enriched["first_name"] = parts[0]
        if len(parts) > 1 and not enriched.get("last_name"):
            enriched["last_name"] = parts[1]

    return enriched


async def verify_supabase_token(token: str) -> Optional[dict]:
    """Valida tokens de sessão, dispositivos pareados e JWTs do Supabase Auth com checagem de revogação."""
    if not token:
        return None

    clean_token = token.replace("Bearer ", "").strip()
    if not clean_token or _is_token_revoked(clean_token):
        return None

    # 1. Sessões emitidas localmente (ex.: redefinição de senha / login local autorizado)
    if clean_token in _local_issued_sessions:
        exp, session_user = _local_issued_sessions[clean_token]
        if time.time() < exp:
            _local_issued_sessions.move_to_end(clean_token)
            return dict(session_user)
        else:
            _local_issued_sessions.pop(clean_token, None)
            return None

    # 2. Validação de credencial de dispositivo móvel pareado
    if clean_token.startswith("charlie_dev_"):
        from api.routes.pair import get_authorized_device_async
        device = await get_authorized_device_async(clean_token)
        if device:
            owner_uid = device.get("user_id") or f"device:{device['device_id']}"
            dev_user = {
                "id": owner_uid,
                "email": f"{device.get('device_name', 'mobile').lower().replace(' ', '_')}@device.charlie",
                "name": device.get("device_name", "Dispositivo Móvel"),
                "is_admin": False,
                "role": "mobile_client",
                "device_id": device["device_id"],
            }
            _token_cache.set(clean_token, dev_user)
            return dev_user
        return None

    # 3. Modo convidado/local apenas fora de produção e SEM privilégio de administrador
    is_prod_cloud = bool(os.getenv("VERCEL") or os.getenv("ENV") == "production")
    if clean_token in ("charlie_guest_token", "charlie_local_token"):
        if is_prod_cloud and os.getenv("ALLOW_GUEST_TOKEN") != "true":
            logger.warning("Tentativa de uso de token estático local em ambiente de produção bloqueada.")
            return None
        local_user = {
            "id": "lucas-local",
            "email": "lucas@charlie.local",
            "name": "Lucas",
            "is_admin": False,
            "role": "guest",
        }
        _token_cache.set(clean_token, local_user)
        return local_user

    # 4. Rejeita explicitamente qualquer token estático legado de admin
    if clean_token == "charlie_admin_local_token":
        logger.warning("Token estático legado 'charlie_admin_local_token' rejeitado por política de segurança.")
        return None

    # 5. Verifica cache LRU em memória com TTL
    cached_user = _token_cache.get(clean_token)
    if cached_user:
        return cached_user

    # 6. Se não houver configuração de nuvem do Supabase, não processa tokens remotos
    if not config.supabase_url or not config.supabase_key:
        return None

    # 7. Validação pela API oficial do Supabase
    user_url = f"{config.supabase_url}/auth/v1/user"
    req = urllib.request.Request(
        user_url,
        headers={
            "apikey": config.supabase_key,
            "Authorization": f"Bearer {clean_token}",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            u_email = data.get("email") or ""
            from api.routes.admin import is_admin_email
            is_adm = (
                is_admin_email(u_email)
                or data.get("app_metadata", {}).get("role") == "admin"
                or data.get("user_metadata", {}).get("is_admin") is True
            )
            user_info = {
                "id": data.get("id"),
                "email": u_email,
                "name": data.get("user_metadata", {}).get("name") or u_email.split("@")[0],
                "is_admin": is_adm,
                "role": "admin" if is_adm else "user",
            }
            user_info = await _enrich_user_with_profile(user_info)
            _token_cache.set(clean_token, user_info)
            return user_info
    except Exception as e:
        logger.warning(f"Falha na validação do token com o Supabase Auth ({type(e).__name__}). Acesso negado.")
        return None


def _extract_request_token(request: Optional[Request], authorization: Optional[str]) -> Optional[str]:
    if authorization:
        return authorization.replace("Bearer ", "").strip()
    if request and "charlie_session" in request.cookies:
        return request.cookies.get("charlie_session")
    return None


async def get_current_user(request: Request, authorization: Optional[str] = Header(None)) -> dict:
    """Dependency do FastAPI: exige autenticação obrigatória do usuário e verifica suspensão."""
    token = _extract_request_token(request, authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação ausente. Faça login para acessar seus dados.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = await verify_supabase_token(token)
    if not user or not user.get("id"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão expirada ou token inválido. Faça login novamente.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verifica se o usuário foi suspenso pelo administrador
    susp_reason = is_user_suspended_in_memory(str(user["id"]), user.get("email") or "") or (
        user.get("suspended_reason") if user.get("is_suspended") else None
    )
    if susp_reason:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Sua conta está suspensa: {susp_reason}",
        )

    current_user_id_var.set(str(user["id"]))
    current_user_email_var.set(user.get("email") or "")
    current_user_name_var.set(user.get("name") or "")
    return user


async def get_current_user_optional(request: Request, authorization: Optional[str] = Header(None)) -> Optional[dict]:
    """Dependency do FastAPI: extrai o usuário autenticado caso o header ou cookie esteja presente."""
    token = _extract_request_token(request, authorization)
    if not token:
        return None
    user = await verify_supabase_token(token)
    if user and user.get("id"):
        susp_reason = is_user_suspended_in_memory(str(user["id"]), user.get("email") or "") or (
            user.get("suspended_reason") if user.get("is_suspended") else None
        )
        if susp_reason:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Sua conta está suspensa: {susp_reason}",
            )
        current_user_id_var.set(str(user["id"]))
        current_user_email_var.set(user.get("email") or "")
        current_user_name_var.set(user.get("name") or "")
    return user


async def require_local_or_authenticated(
    request: Request,
    authorization: Optional[str] = Header(None),
) -> dict:
    """Permite acesso a usuários autenticados ou chamadas locais loopback (127.0.0.1) fora de nuvem."""
    user = await get_current_user_optional(request, authorization)
    if user and user.get("id"):
        return user

    is_cloud = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME") or os.getenv("ENV") == "production")
    has_forwarded = bool(request and (request.headers.get("x-forwarded-for") or request.headers.get("x-real-ip")))
    client_host = (request.client.host if (request and request.client) else "") or ""

    if not is_cloud and not has_forwarded and client_host in ("127.0.0.1", "::1", "localhost", "testclient"):
        local_ctx = {
            "id": "lucas-local",
            "email": "lucas@charlie.local",
            "name": "Lucas (Local)",
            "is_admin": False,
            "role": "local_host",
        }
        current_user_id_var.set("lucas-local")
        return local_ctx

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Autenticação obrigatória para acessar este recurso.",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def _upsert_user_profile_record(
    user_id: str,
    email: str,
    display_name: str,
    role: str = "user",
    password_hash: Optional[str] = None,
    extra_fields: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Sincroniza os dados de perfil em memória e nas tabelas public.user_profiles e public.User."""
    uid = str(user_id)
    clean_email = (email or "").strip().lower()
    parts = (display_name or "").strip().split(" ", 1)
    first_name = (extra_fields or {}).get("first_name") or (parts[0] if parts else "")
    last_name = (extra_fields or {}).get("last_name") or (parts[1] if len(parts) > 1 else "")

    prof = _in_memory_profiles.get(uid, {}).copy()
    prof.update(
        {
            "user_id": uid,
            "email": clean_email,
            "display_name": display_name,
            "first_name": first_name,
            "last_name": last_name,
            "role": role,
        }
    )
    if password_hash:
        prof["password_hash"] = password_hash
    if extra_fields:
        for k in ("username", "avatar_url", "banner_url", "website", "bio", "first_name", "last_name"):
            if k in extra_fields and extra_fields[k] is not None:
                prof[k] = extra_fields[k]

    _in_memory_profiles[uid] = prof
    if clean_email:
        _in_memory_profiles[clean_email] = prof

    pool = await get_or_init_db_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO public.user_profiles (
                        user_id, email, first_name, last_name, display_name,
                        username, avatar_url, banner_url, website, bio, role, password_hash, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
                    ON CONFLICT (user_id) DO UPDATE SET
                        email = COALESCE(EXCLUDED.email, public.user_profiles.email),
                        first_name = COALESCE(EXCLUDED.first_name, public.user_profiles.first_name),
                        last_name = COALESCE(EXCLUDED.last_name, public.user_profiles.last_name),
                        display_name = COALESCE(EXCLUDED.display_name, public.user_profiles.display_name),
                        username = COALESCE(EXCLUDED.username, public.user_profiles.username),
                        avatar_url = COALESCE(EXCLUDED.avatar_url, public.user_profiles.avatar_url),
                        banner_url = COALESCE(EXCLUDED.banner_url, public.user_profiles.banner_url),
                        website = COALESCE(EXCLUDED.website, public.user_profiles.website),
                        bio = COALESCE(EXCLUDED.bio, public.user_profiles.bio),
                        role = COALESCE(EXCLUDED.role, public.user_profiles.role),
                        password_hash = COALESCE(EXCLUDED.password_hash, public.user_profiles.password_hash),
                        updated_at = NOW();
                    """,
                    uid,
                    clean_email,
                    prof.get("first_name"),
                    prof.get("last_name"),
                    prof.get("display_name"),
                    prof.get("username"),
                    prof.get("avatar_url"),
                    prof.get("banner_url"),
                    prof.get("website"),
                    prof.get("bio"),
                    role,
                    password_hash,
                )

                try:
                    u_uuid = uuid.UUID(uid)
                    metadata_json = json.dumps(
                        {
                            "name": prof.get("display_name"),
                            "first_name": prof.get("first_name"),
                            "last_name": prof.get("last_name"),
                            "username": prof.get("username"),
                            "avatar_url": prof.get("avatar_url"),
                            "banner_url": prof.get("banner_url"),
                            "website": prof.get("website"),
                            "bio": prof.get("bio"),
                        }
                    )
                    await conn.execute(
                        """
                        INSERT INTO public."User" (id, identifier, metadata, "createdAt", "updatedAt")
                        VALUES ($1, $2, $3::jsonb, now(), now())
                        ON CONFLICT (id) DO UPDATE
                        SET identifier = EXCLUDED.identifier,
                            metadata = COALESCE(public."User".metadata, '{}'::jsonb) || EXCLUDED.metadata,
                            "updatedAt" = now();
                        """,
                        u_uuid,
                        clean_email,
                        metadata_json,
                    )
                except (ValueError, TypeError):
                    pass
        except Exception as e:
            logger.warning(f"Aviso ao sincronizar user_profiles para {uid}: {e}")

    return prof


@router.post("/register", response_model=AuthResponse)
async def register(data: RegisterRequest, request: Request, response: Response):
    """Cria uma nova conta de usuário com rate limiting e proteção contra enumeração."""
    clean_email = (data.email or "").strip().lower()
    await rate_limiter.enforce(
        request=request,
        scope="auth_register_ip",
        max_requests=5,
        window_seconds=900,
        error_detail="Muitas tentativas de cadastro a partir deste endereço. Aguarde 15 minutos.",
    )

    if not clean_email or "@" not in clean_email or "." not in clean_email.split("@")[-1]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Informe um endereço de e-mail válido.",
        )

    if len(data.password or "") < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A senha deve ter pelo menos 8 caracteres.",
        )

    clean_name = (data.name or "").strip() or clean_email.split("@")[0]
    pw_hash = _hash_password(data.password)

    # Modo sem Supabase configurado: permite registro na autenticação própria local/DB
    if not config.supabase_url or not config.supabase_key:
        if clean_email in _in_memory_profiles:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não foi possível concluir o cadastro com os dados informados. Caso já possua conta, faça login ou recupere sua senha.",
            )
        user_id = str(uuid.uuid4())
        from api.routes.admin import is_admin_email
        is_adm = is_admin_email(clean_email)
        role = "admin" if is_adm else "user"
        prof = await _upsert_user_profile_record(
            user_id=user_id,
            email=clean_email,
            display_name=clean_name,
            role=role,
            password_hash=pw_hash,
        )
        user_obj = {
            "id": user_id,
            "name": clean_name,
            "email": clean_email,
            "is_admin": is_adm,
            "role": role,
            "first_name": prof.get("first_name"),
            "last_name": prof.get("last_name"),
        }
        token = _issue_local_session_token(user_obj)
        response.set_cookie(
            key="charlie_session",
            value=token,
            httponly=True,
            secure=True,
            samesite="lax",
            max_age=60 * 60 * 24 * 7,
            path="/",
        )
        return AuthResponse(user=UserResponse(**user_obj), token=token)

    # 1. Cria a conta no Supabase Auth
    signup_url = f"{config.supabase_url}/auth/v1/signup"
    payload = {
        "email": clean_email,
        "password": data.password,
        "data": {
            "name": clean_name,
        },
    }

    req = urllib.request.Request(
        signup_url,
        data=json.dumps(payload).encode(),
        headers={
            "apikey": config.supabase_key,
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            signup_res = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        logger.warning(f"Erro no cadastro Supabase: HTTP {e.code}")
        try:
            err_json = json.loads(error_body)
            raw_msg = (
                err_json.get("msg")
                or err_json.get("error_description")
                or err_json.get("message")
                or ""
            ).lower()
            if "already registered" in raw_msg or "already exists" in raw_msg:
                # Resposta neutra contra enumeração direta
                msg = "Não foi possível concluir o cadastro com os dados informados. Caso já possua conta, faça login ou recupere sua senha."
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)
            elif "rate limit" in raw_msg:
                msg = "Limite temporário de solicitações de cadastro atingido. Tente novamente em alguns minutos."
                raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=msg)
        except HTTPException:
            raise
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não foi possível concluir o cadastro. Verifique os dados informados.",
        )
    except Exception:
        logger.exception("Falha inesperada no cadastro")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de autenticação temporariamente indisponível. Tente novamente em instantes.",
        )

    user_id = signup_res.get("id") or signup_res.get("user", {}).get("id") or str(uuid.uuid4())

    # 2. Obtém o token de sessão
    token = signup_res.get("access_token")
    if not token:
        login_url = f"{config.supabase_url}/auth/v1/token?grant_type=password"
        login_payload = {
            "email": clean_email,
            "password": data.password,
        }
        login_req = urllib.request.Request(
            login_url,
            data=json.dumps(login_payload).encode(),
            headers={
                "apikey": config.supabase_key,
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(login_req, timeout=10) as login_resp:
                login_data = json.loads(login_resp.read().decode())
                token = login_data["access_token"]
                user_id = login_data.get("user", {}).get("id") or user_id
        except Exception as e:
            logger.warning(f"Aviso ao autenticar após registro ({type(e).__name__}); emitindo sessão local.")
            token = None

    from api.routes.admin import is_admin_email
    is_adm = is_admin_email(clean_email)
    role = "admin" if is_adm else "user"

    prof = await _upsert_user_profile_record(
        user_id=str(user_id),
        email=clean_email,
        display_name=clean_name,
        role=role,
        password_hash=pw_hash,
    )

    user_obj = {
        "id": str(user_id),
        "name": clean_name,
        "email": clean_email,
        "is_admin": is_adm,
        "role": role,
        "first_name": prof.get("first_name"),
        "last_name": prof.get("last_name"),
    }

    if not token:
        token = _issue_local_session_token(user_obj)
    else:
        _token_cache.set(token, user_obj)

    response.set_cookie(
        key="charlie_session",
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
        path="/",
    )

    return AuthResponse(
        user=UserResponse(**user_obj),
        token=token,
    )


@router.post("/guest", response_model=AuthResponse)
async def guest_login(request: Request, response: Response):
    """Inicia sessão local de convidado (apenas fora de produção, sem privilégio administrativo)."""
    is_prod_cloud = bool(os.getenv("VERCEL") or os.getenv("ENV") == "production")
    if is_prod_cloud and os.getenv("ALLOW_GUEST_TOKEN") != "true":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sessão de convidado desativada no ambiente de produção. Faça login com sua conta.",
        )

    await rate_limiter.enforce(
        request=request,
        scope="auth_guest_ip",
        max_requests=15,
        window_seconds=300,
    )

    token = "charlie_guest_token"
    local_user = {
        "id": "lucas-local",
        "email": "lucas@charlie.local",
        "name": "Lucas",
        "is_admin": False,
        "role": "guest",
    }
    _token_cache.set(token, local_user)
    response.set_cookie(
        key="charlie_session",
        value=token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
        path="/",
    )
    return AuthResponse(
        user=UserResponse(**local_user),
        token=token,
    )


@router.post("/login", response_model=AuthResponse)
async def login(data: LoginRequest, request: Request, response: Response):
    """Autentica o usuário com proteção contra força bruta, verificação de suspensão e suporte a senha redefinida."""
    clean_email = (data.email or "").strip().lower()

    # 1. Rate limiting por IP e por combinação IP + conta
    await rate_limiter.enforce(
        request=request,
        scope="auth_login_ip",
        max_requests=10,
        window_seconds=300,
        error_detail="Muitas tentativas de login. Aguarde 5 minutos antes de tentar novamente.",
    )
    await rate_limiter.enforce(
        request=request,
        scope="auth_login_account",
        identifier=clean_email,
        max_requests=5,
        window_seconds=300,
        error_detail="Muitas tentativas de login para esta conta. Aguarde 5 minutos ou utilize 'Esqueceu a senha?'.",
    )

    # 2. Verifica se a conta possui senha própria/redefinida localmente em user_profiles ou memória
    local_prof = _in_memory_profiles.get(clean_email)
    pool = await get_or_init_db_pool()
    if pool and not local_prof:
        try:
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    SELECT user_id, email, display_name, first_name, last_name, username,
                           avatar_url, banner_url, website, bio, role, is_suspended, suspended_reason, password_hash
                    FROM public.user_profiles
                    WHERE LOWER(email) = $1
                    LIMIT 1;
                    """,
                    clean_email,
                )
                if row:
                    local_prof = dict(row)
        except Exception as e:
            logger.debug(f"Aviso ao consultar perfil local no login: {e}")

    if local_prof:
        if local_prof.get("is_suspended"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Sua conta está suspensa: {local_prof.get('suspended_reason') or 'Contate o suporte.'}",
            )
        if local_prof.get("password_hash") and _verify_password_hash(data.password, local_prof["password_hash"]):
            from api.routes.admin import is_admin_email
            is_adm = is_admin_email(clean_email) or local_prof.get("role") == "admin"
            user_obj = {
                "id": str(local_prof["user_id"]),
                "name": local_prof.get("display_name") or clean_email.split("@")[0],
                "email": clean_email,
                "is_admin": is_adm,
                "role": "admin" if is_adm else "user",
                "first_name": local_prof.get("first_name"),
                "last_name": local_prof.get("last_name"),
                "username": local_prof.get("username"),
                "avatar_url": local_prof.get("avatar_url"),
                "banner_url": local_prof.get("banner_url"),
                "website": local_prof.get("website"),
                "bio": local_prof.get("bio"),
            }
            session_token = _issue_local_session_token(user_obj)
            response.set_cookie(
                key="charlie_session",
                value=session_token,
                httponly=True,
                secure=True,
                samesite="lax",
                max_age=60 * 60 * 24 * 7,
                path="/",
            )
            return AuthResponse(user=UserResponse(**user_obj), token=session_token)

    # 3. Login administrativo local somente se uma senha forte explícita (diferente do default "admin") foi configurada
    admin_email = (config.admin_email or "").strip().lower()
    admin_user_name = (config.admin_username or "").strip().lower()
    admin_pass = config.admin_password or ""
    is_strong_admin_pass = bool(admin_pass and admin_pass != "admin" and len(admin_pass) >= 8)

    if is_strong_admin_pass and (clean_email == admin_email or clean_email == admin_user_name):
        if hmac.compare_digest(data.password, admin_pass):
            admin_user_obj = {
                "id": "admin-lucas",
                "email": config.admin_email or "lucassilvacosta060@gmail.com",
                "name": config.admin_username or "Lucas",
                "is_admin": True,
                "role": "admin",
            }
            admin_user_obj = await _enrich_user_with_profile(admin_user_obj)
            local_token = _issue_local_session_token(admin_user_obj)
            response.set_cookie(
                key="charlie_session",
                value=local_token,
                httponly=True,
                secure=True,
                samesite="lax",
                max_age=60 * 60 * 24 * 7,
                path="/",
            )
            return AuthResponse(
                user=UserResponse(**admin_user_obj),
                token=local_token,
            )

    if not config.supabase_url or not config.supabase_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos. Verifique suas credenciais.",
        )

    login_url = f"{config.supabase_url}/auth/v1/token?grant_type=password"
    payload = {
        "email": clean_email,
        "password": data.password,
    }

    req = urllib.request.Request(
        login_url,
        data=json.dumps(payload).encode(),
        headers={
            "apikey": config.supabase_key,
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            res_data = json.loads(resp.read().decode())
            token = res_data["access_token"]
            user_obj = res_data.get("user", {})
            user_id = str(user_obj.get("id"))
            name = (
                user_obj.get("user_metadata", {}).get("name")
                or clean_email.split("@")[0]
            )

            susp_reason = is_user_suspended_in_memory(user_id, clean_email)
            if susp_reason:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Sua conta está suspensa: {susp_reason}",
                )

            from api.routes.admin import is_admin_email
            is_adm = (
                is_admin_email(clean_email)
                or user_obj.get("app_metadata", {}).get("role") == "admin"
                or user_obj.get("user_metadata", {}).get("is_admin") is True
            )
            role = "admin" if is_adm else "user"

            await _upsert_user_profile_record(
                user_id=user_id,
                email=clean_email,
                display_name=name,
                role=role,
            )

            user_dict = await _enrich_user_with_profile(
                {
                    "id": user_id,
                    "name": name,
                    "email": clean_email,
                    "is_admin": is_adm,
                    "role": role,
                }
            )
            if user_dict.get("is_suspended"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Sua conta está suspensa: {user_dict.get('suspended_reason') or 'Contate o suporte.'}",
                )

            _token_cache.set(token, user_dict)

            if token:
                response.set_cookie(
                    key="charlie_session",
                    value=token,
                    httponly=True,
                    secure=True,
                    samesite="lax",
                    max_age=60 * 60 * 24 * 7,
                    path="/",
                )

            return AuthResponse(
                user=UserResponse(**user_dict),
                token=token,
            )
    except HTTPException:
        raise
    except urllib.error.HTTPError as e:
        logger.warning(f"Falha de login Supabase: HTTP {e.code}")
        # Mensagem uniforme para impedir enumeração de contas ou timing oracle
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha incorretos. Verifique suas credenciais.",
        )
    except Exception:
        logger.exception("Erro inesperado no login")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de autenticação temporariamente indisponível.",
        )


@router.post("/logout")
async def logout(request: Request, response: Response, authorization: Optional[str] = Header(None)):
    """Encerra a sessão removendo o cookie HttpOnly e invalidando imediatamente o token no servidor."""
    token = _extract_request_token(request, authorization)
    if token:
        _revoke_token(token)
    response.delete_cookie(key="charlie_session", path="/", secure=True, httponly=True, samesite="lax")
    return {"ok": True, "message": "Sessão encerrada com sucesso."}


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, request: Request):
    """Inicia fluxo de recuperação de senha com token de uso único, expiração de 15m e anti-enumeração."""
    clean_email = (data.email or "").strip().lower()
    await rate_limiter.enforce(
        request=request,
        scope="auth_forgot_ip",
        max_requests=5,
        window_seconds=900,
        error_detail="Muitas solicitações de recuperação de senha. Aguarde 15 minutos.",
    )
    if clean_email:
        await rate_limiter.enforce(
            request=request,
            scope="auth_forgot_email",
            identifier=clean_email,
            max_requests=3,
            window_seconds=900,
            error_detail="Muitas solicitações de recuperação para este endereço. Aguarde 15 minutos.",
        )

    generic_response = {
        "ok": True,
        "message": "Se o e-mail informado estiver associado a uma conta, enviaremos as instruções de redefinição de senha.",
    }

    if not clean_email or "@" not in clean_email:
        return generic_response

    # Gera token de uso único imprevisível com expiração de 15 minutos
    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_token(raw_token)
    now_ts = time.time()
    expires_at_dt = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=15)
    client_ip = rate_limiter._get_client_ip(request)

    # Identifica user_id se já conhecido
    prof = _in_memory_profiles.get(clean_email)
    user_id = str(prof["user_id"]) if prof and prof.get("user_id") else clean_email

    # Invalida tokens anteriores não utilizados do mesmo e-mail em memória
    for old_hash, rec in list(_in_memory_reset_tokens.items()):
        if rec.get("email") == clean_email and rec.get("used_at") is None:
            _in_memory_reset_tokens.pop(old_hash, None)

    _in_memory_reset_tokens[token_hash] = {
        "user_id": user_id,
        "email": clean_email,
        "token_hash": token_hash,
        "expires_at": now_ts + 900,
        "used_at": None,
        "request_ip": client_ip,
    }

    pool = await get_or_init_db_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE public.password_reset_tokens
                    SET used_at = NOW()
                    WHERE LOWER(email) = $1 AND used_at IS NULL;
                    """,
                    clean_email,
                )
                await conn.execute(
                    """
                    INSERT INTO public.password_reset_tokens (
                        user_id, email, token_hash, expires_at, request_ip
                    )
                    VALUES ($1, $2, $3, $4, $5);
                    """,
                    user_id,
                    clean_email,
                    token_hash,
                    expires_at_dt,
                    client_ip,
                )
        except Exception as e:
            logger.warning(f"Aviso ao persistir token de recuperação no banco: {e}")

    # Se o Supabase estiver configurado e SMTP externo não estiver definido, aciona o disparo de recuperação do Supabase
    smtp_host = os.getenv("SMTP_HOST")
    if smtp_host:
        logger.info(f"[AUTH RECOVERY] Token de recuperação gerado e agendado via SMTP ({smtp_host}) para conta solicitante.")
    else:
        logger.info(
            "[AUTH RECOVERY] Token de recuperação de uso único gerado e persistido com sucesso (SMTP_HOST não configurado no ambiente)."
        )

    return generic_response


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, request: Request):
    """Redefine a senha utilizando token de uso único válido, revogando todas as sessões anteriores."""
    await rate_limiter.enforce(
        request=request,
        scope="auth_reset_ip",
        max_requests=5,
        window_seconds=900,
        error_detail="Muitas tentativas de redefinição de senha. Aguarde 15 minutos.",
    )

    raw_token = (data.token or "").strip()
    new_password = data.new_password or ""

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token de recuperação ausente ou inválido.",
        )

    if len(new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A nova senha deve ter pelo menos 8 caracteres.",
        )

    token_hash = _hash_token(raw_token)
    now_ts = time.time()
    target_email: Optional[str] = None
    target_user_id: Optional[str] = None

    # 1. Verifica no banco de dados se disponível
    pool = await get_or_init_db_pool()
    db_verified = False
    if pool:
        try:
            async with pool.acquire() as conn:
                row = await conn.fetchrow(
                    """
                    UPDATE public.password_reset_tokens
                    SET used_at = NOW()
                    WHERE token_hash = $1
                      AND used_at IS NULL
                      AND expires_at > NOW()
                    RETURNING user_id, email;
                    """,
                    token_hash,
                )
                if row:
                    target_user_id = str(row["user_id"])
                    target_email = str(row["email"]).strip().lower()
                    db_verified = True
        except Exception as e:
            logger.warning(f"Aviso ao validar token de reset no banco: {e}")

    # 2. Verifica no armazenamento em memória (ou sincroniza uso único)
    mem_rec = _in_memory_reset_tokens.get(token_hash)
    if mem_rec:
        if not db_verified:
            if mem_rec.get("used_at") is not None or now_ts >= float(mem_rec.get("expires_at", 0)):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Token de recuperação inválido, expirado ou já utilizado.",
                )
            target_email = str(mem_rec["email"]).strip().lower()
            target_user_id = str(mem_rec["user_id"])
        mem_rec["used_at"] = now_ts
    elif not db_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Token de recuperação inválido, expirado ou já utilizado.",
        )

    assert target_email is not None
    pw_hash = _hash_password(new_password)
    existing_prof = _in_memory_profiles.get(target_email) or {}
    uid = existing_prof.get("user_id") or target_user_id or str(uuid.uuid4())
    display_name = existing_prof.get("display_name") or target_email.split("@")[0]
    role = existing_prof.get("role") or "user"

    await _upsert_user_profile_record(
        user_id=str(uid),
        email=target_email,
        display_name=display_name,
        role=role,
        password_hash=pw_hash,
    )

    # Incrementa token_version no banco e invalida todas as sessões ativas do usuário
    if pool:
        try:
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE public.user_profiles
                    SET password_hash = $1,
                        token_version = COALESCE(token_version, 1) + 1,
                        updated_at = NOW()
                    WHERE user_id = $2 OR LOWER(email) = $3;
                    """,
                    pw_hash,
                    str(uid),
                    target_email,
                )
        except Exception as e:
            logger.debug(f"Aviso ao incrementar token_version para {target_email}: {e}")

    _token_cache.invalidate_user(str(uid), target_email)
    for sess_tok, (_, sess_info) in list(_local_issued_sessions.items()):
        if str(sess_info.get("id")) == str(uid) or (sess_info.get("email") or "").strip().lower() == target_email:
            _local_issued_sessions.pop(sess_tok, None)

    return {
        "ok": True,
        "message": "Senha redefinida com sucesso. Todas as sessões anteriores foram encerradas.",
    }


@router.get("/me", response_model=UserResponse)
async def get_me(request: Request, authorization: Optional[str] = Header(None)):
    """Retorna os dados completos de perfil do usuário autenticado."""
    user = await get_current_user_optional(request, authorization)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão expirada ou não autenticada.",
        )
    enriched = await _enrich_user_with_profile(user)
    return UserResponse(
        id=str(enriched["id"]),
        name=enriched.get("name") or "Usuário",
        email=enriched.get("email") or "",
        is_admin=bool(enriched.get("is_admin", False)),
        role=enriched.get("role", "user"),
        first_name=enriched.get("first_name"),
        last_name=enriched.get("last_name"),
        username=enriched.get("username"),
        avatar_url=enriched.get("avatar_url"),
        banner_url=enriched.get("banner_url"),
        website=enriched.get("website"),
        bio=enriched.get("bio"),
    )


@router.patch("/profile", response_model=UserResponse)
@router.put("/profile", response_model=UserResponse)
@router.patch("/me", response_model=UserResponse)
@router.put("/me", response_model=UserResponse)
async def update_profile(
    data: ProfileUpdateRequest,
    request: Request,
    authorization: Optional[str] = Header(None),
    user: dict = Depends(get_current_user),
):
    """Atualiza e persiste os dados do perfil do usuário autenticado."""
    await rate_limiter.enforce(
        request=request,
        scope="auth_profile_update",
        identifier=str(user["id"]),
        max_requests=20,
        window_seconds=300,
    )

    first_name = data.first_name.strip() if data.first_name is not None else None
    last_name = data.last_name.strip() if data.last_name is not None else None
    display_name = data.name.strip() if data.name is not None else None

    if not display_name and (first_name is not None or last_name is not None):
        fn = first_name if first_name is not None else (user.get("first_name") or "")
        ln = last_name if last_name is not None else (user.get("last_name") or "")
        combined = f"{fn} {ln}".strip()
        if combined:
            display_name = combined

    if not display_name:
        display_name = user.get("name") or "Usuário"

    username = data.username.strip() if data.username is not None else None
    if username:
        if not re.match(r"^[a-zA-Z0-9_.-]{3,30}$", username):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O username deve conter entre 3 e 30 caracteres (letras, números, '_', '.' ou '-').",
            )

    website = data.website.strip() if data.website is not None else None
    if website:
        if len(website) > 255 or not (website.startswith("http://") or website.startswith("https://")):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O website deve ser uma URL válida iniciando com http:// ou https://.",
            )

    bio = data.bio.strip() if data.bio is not None else None
    if bio is not None and len(bio) > 280:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A bio deve ter no máximo 280 caracteres.",
        )

    avatar_url = data.avatar_url.strip() if data.avatar_url is not None else None
    if avatar_url and len(avatar_url) > 2_500_000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A imagem de avatar excede o tamanho máximo permitido.",
        )

    banner_url = data.banner_url.strip() if data.banner_url is not None else None
    if banner_url and len(banner_url) > 3_500_000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A imagem de banner excede o tamanho máximo permitido.",
        )

    extra_fields = {
        "first_name": first_name,
        "last_name": last_name,
        "username": username,
        "avatar_url": avatar_url,
        "banner_url": banner_url,
        "website": website,
        "bio": bio,
    }

    prof = await _upsert_user_profile_record(
        user_id=str(user["id"]),
        email=user.get("email") or "",
        display_name=display_name,
        role=user.get("role", "user"),
        extra_fields=extra_fields,
    )

    updated_user = dict(user)
    updated_user["name"] = prof.get("display_name") or display_name
    for k in ("first_name", "last_name", "username", "avatar_url", "banner_url", "website", "bio"):
        if prof.get(k) is not None:
            updated_user[k] = prof[k]

    token = _extract_request_token(request, authorization)
    if token:
        _token_cache.set(token, updated_user)
        if token in _local_issued_sessions:
            exp, _ = _local_issued_sessions[token]
            _local_issued_sessions[token] = (exp, updated_user)

    return UserResponse(
        id=str(updated_user["id"]),
        name=updated_user["name"],
        email=updated_user.get("email") or "",
        is_admin=bool(updated_user.get("is_admin", False)),
        role=updated_user.get("role", "user"),
        first_name=updated_user.get("first_name"),
        last_name=updated_user.get("last_name"),
        username=updated_user.get("username"),
        avatar_url=updated_user.get("avatar_url"),
        banner_url=updated_user.get("banner_url"),
        website=updated_user.get("website"),
        bio=updated_user.get("bio"),
    )
