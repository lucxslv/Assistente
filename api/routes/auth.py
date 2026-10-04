"""Rotas de autenticação e gerenciamento de contas (Supabase Auth)."""

import json
import logging
import time
import urllib.error
import urllib.request
from typing import Dict, Optional
from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel
from api.db import get_or_init_db_pool
from config import config

logger = logging.getLogger("charlie.api.auth")
import base64
from contextvars import ContextVar

router = APIRouter(prefix="/auth", tags=["Auth"])

# Context variables para rastrear o usuário autenticado da requisição atual
current_user_id_var: ContextVar[str] = ContextVar("current_user_id", default="default")
current_user_email_var: ContextVar[str] = ContextVar("current_user_email", default="")
current_user_name_var: ContextVar[str] = ContextVar("current_user_name", default="")

# Cache simples em memória para tokens validados (TTL: 60 segundos)
_TOKEN_CACHE: Dict[str, tuple[float, dict]] = {}


class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    is_admin: bool = False
    role: str = "user"


class AuthResponse(BaseModel):
    user: UserResponse
    token: str


async def verify_supabase_token(token: str) -> Optional[dict]:
    """Valida o token JWT contra o serviço oficial de autenticação do Supabase."""
    if not token or not config.supabase_url or not config.supabase_key:
        return None

    clean_token = token.replace("Bearer ", "").strip()
    now = time.time()

    # 1. Verifica cache em memória
    if clean_token in _TOKEN_CACHE:
        cached_time, cached_user = _TOKEN_CACHE[clean_token]
        if now - cached_time < 60:
            return cached_user

    # 2. Validação pela API oficial do Supabase
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
            _TOKEN_CACHE[clean_token] = (now, user_info)
            return user_info
    except Exception as e:
        logger.warning(f"Falha na validação do token com o Supabase Auth ({e}). Acesso negado por segurança.")
        return None


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """Dependency do FastAPI: exige autenticação obrigatória do usuário."""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação ausente. Faça login para acessar seus dados.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = await verify_supabase_token(authorization)
    if not user or not user.get("id"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão expirada ou token inválido. Faça login novamente.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    current_user_id_var.set(str(user["id"]))
    current_user_email_var.set(user.get("email") or "")
    current_user_name_var.set(user.get("name") or "")
    return user


async def get_current_user_optional(authorization: Optional[str] = Header(None)) -> Optional[dict]:
    """Dependency do FastAPI: extrai o usuário autenticado caso o header esteja presente."""
    if not authorization:
        return None
    user = await verify_supabase_token(authorization)
    if user and user.get("id"):
        current_user_id_var.set(str(user["id"]))
        current_user_email_var.set(user.get("email") or "")
        current_user_name_var.set(user.get("name") or "")
    return user


@router.post("/register", response_model=AuthResponse)
async def register(data: RegisterRequest):
    """Cria uma nova conta de usuário no Supabase Auth."""
    if len(data.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A senha deve ter pelo menos 6 caracteres.",
        )

    # 1. Cria a conta no Supabase Auth
    signup_url = f"{config.supabase_url}/auth/v1/signup"
    payload = {
        "email": data.email,
        "password": data.password,
        "data": {
            "name": data.name.strip(),
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
        with urllib.request.urlopen(req) as resp:
            signup_res = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        logger.error(f"Erro no cadastro Supabase: {e.code} - {error_body}")
        try:
            err_json = json.loads(error_body)
            msg = err_json.get("msg") or err_json.get("error_description") or err_json.get("message") or "Erro ao criar conta."
            if "already registered" in msg.lower():
                msg = "Este e-mail já está cadastrado. Faça login para continuar."
            elif "rate limit" in msg.lower():
                msg = "Limite de e-mails do Supabase atingido. Desative a opção 'Confirm email' no painel do Supabase para permitir cadastros imediatos sem restrição."
        except Exception:
            msg = "Erro ao processar o cadastro no servidor de autenticação."
        raise HTTPException(status_code=e.code, detail=msg)
    except Exception as e:
        logger.exception("Falha inesperada no cadastro")
        raise HTTPException(status_code=500, detail=f"Erro de conexão com o banco de autenticação: {str(e)}")

    user_id = signup_res.get("id") or signup_res.get("user", {}).get("id")
    pool = await get_or_init_db_pool()

    # 2. Realiza o login para obter o token de sessão
    token = signup_res.get("access_token")
    if not token:
        login_url = f"{config.supabase_url}/auth/v1/token?grant_type=password"
        login_payload = {
            "email": data.email,
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
            with urllib.request.urlopen(login_req) as login_resp:
                login_data = json.loads(login_resp.read().decode())
                token = login_data["access_token"]
                user_id = login_data.get("user", {}).get("id") or user_id
        except Exception as e:
            logger.error(f"Erro ao autenticar após registro: {e}")
            raise HTTPException(status_code=400, detail="Conta criada! Por favor, faça login com seu e-mail e senha.")

    # Garante espelhamento na tabela public."User" para integridade de chaves estrangeiras
    if pool and user_id:
        try:
            import uuid
            async with pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO public."User" (id, identifier, metadata, "createdAt", "updatedAt")
                    VALUES ($1, $2, '{}'::jsonb, now(), now())
                    ON CONFLICT (id) DO UPDATE SET identifier = EXCLUDED.identifier;
                """, uuid.UUID(str(user_id)), data.email)
        except Exception as e:
            logger.warning(f"Não foi possível sincronizar public.User no registro: {e}")

    from api.routes.admin import is_admin_email
    is_adm = is_admin_email(data.email)
    return AuthResponse(
        user=UserResponse(
            id=str(user_id),
            name=data.name.strip(),
            email=data.email,
            is_admin=is_adm,
            role="admin" if is_adm else "user",
        ),
        token=token,
    )


@router.post("/login", response_model=AuthResponse)
async def login(data: LoginRequest):
    """Autentica o usuário com e-mail e senha via Supabase Auth."""
    login_url = f"{config.supabase_url}/auth/v1/token?grant_type=password"
    payload = {
        "email": data.email,
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
        with urllib.request.urlopen(req) as resp:
            res_data = json.loads(resp.read().decode())
            token = res_data["access_token"]
            user_obj = res_data.get("user", {})
            user_id = user_obj.get("id")
            name = (
                user_obj.get("user_metadata", {}).get("name")
                or data.email.split("@")[0]
            )

            # Garante espelhamento na tabela public."User"
            pool = await get_or_init_db_pool()
            if pool and user_id:
                try:
                    import uuid
                    async with pool.acquire() as conn:
                        await conn.execute("""
                            INSERT INTO public."User" (id, identifier, metadata, "createdAt", "updatedAt")
                            VALUES ($1, $2, '{}'::jsonb, now(), now())
                            ON CONFLICT (id) DO UPDATE SET identifier = EXCLUDED.identifier;
                        """, uuid.UUID(str(user_id)), data.email)
                except Exception as e:
                    logger.warning(f"Não foi possível sincronizar public.User no login: {e}")

            from api.routes.admin import is_admin_email
            is_adm = (
                is_admin_email(data.email)
                or user_obj.get("app_metadata", {}).get("role") == "admin"
                or user_obj.get("user_metadata", {}).get("is_admin") is True
            )
            return AuthResponse(
                user=UserResponse(
                    id=str(user_id),
                    name=name,
                    email=data.email,
                    is_admin=is_adm,
                    role="admin" if is_adm else "user",
                ),
                token=token,
            )
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        logger.warning(f"Falha de login Supabase: {e.code} - {error_body}")
        try:
            err_json = json.loads(error_body)
            msg = err_json.get("error_description") or err_json.get("msg") or "E-mail ou senha incorretos."
            if "invalid" in msg.lower() or "credentials" in msg.lower():
                msg = "E-mail ou senha incorretos. Verifique suas credenciais."
            elif "not confirmed" in msg.lower():
                # Auto-confirma se for erro de email não confirmado e tenta novamente
                pool = await get_or_init_db_pool()
                if pool:
                    async with pool.acquire() as conn:
                        await conn.execute(
                            "UPDATE auth.users SET email_confirmed_at = now() WHERE email = $1",
                            data.email,
                        )
                    # Tenta mais uma vez
                    with urllib.request.urlopen(req) as retry_resp:
                        retry_data = json.loads(retry_resp.read().decode())
                        return AuthResponse(
                            user=UserResponse(
                                id=str(retry_data.get("user", {}).get("id")),
                                name=retry_data.get("user", {}).get("user_metadata", {}).get("name") or data.email.split("@")[0],
                                email=data.email,
                            ),
                            token=retry_data["access_token"],
                        )
        except Exception:
            msg = "E-mail ou senha incorretos. Verifique suas credenciais."
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=msg)
    except Exception as e:
        logger.exception("Erro inesperado no login")
        raise HTTPException(status_code=500, detail="Serviço de autenticação temporariamente indisponível.")


@router.get("/me", response_model=UserResponse)
async def get_me(authorization: Optional[str] = Header(None)):
    """Retorna os dados do usuário autenticado a partir do token de sessão."""
    user = await get_current_user_optional(authorization)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sessão expirada ou não autenticada.",
        )
    return UserResponse(
        id=user["id"],
        name=user["name"],
        email=user["email"],
        is_admin=bool(user.get("is_admin", False)),
        role=user.get("role", "user"),
    )
