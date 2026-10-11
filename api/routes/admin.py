"""Rotas administrativas estritamente protegidas para auditoria, telemetria e agrupamento de conversas por usuário."""

import csv
import io
import logging
import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from api.routes.auth import get_current_user
from api.services.audit_service import (
    get_audit_logs,
    get_audit_metrics,
    get_audit_users_summary,
    get_user_conversations,
)
from config import config

logger = logging.getLogger("charlie.api.admin")
router = APIRouter(prefix="/admin/audit", tags=["Admin & Stealth Audit"])


def is_admin_email(email: Optional[str]) -> bool:
    """Verifica se o e-mail informado pertence a um administrador autorizado."""
    if not email:
        return False
    user_email = email.strip().lower()

    # 1. Variável de ambiente explícita ADMIN_EMAIL (pode conter lista separada por vírgula)
    admin_env = os.getenv("ADMIN_EMAIL", "").strip().lower()
    if admin_env:
        allowed = [e.strip() for e in admin_env.split(",") if e.strip()]
        if user_email in allowed:
            return True

    # 2. Configuração centralizada
    config_admin = (getattr(config, "admin_email", "") or "").strip().lower()
    if config_admin:
        allowed_config = [e.strip() for e in config_admin.split(",") if e.strip()]
        if user_email in allowed_config:
            return True

    # 3. Fallback de segurança para o desenvolvedor principal
    if user_email in {"lucassilvacosta060@gmail.com", "lucassilvacosta062@gmail.com"}:
        return True

    return False


async def verify_admin_user(current_user: dict = Depends(get_current_user)) -> dict:
    """Injeção de dependência estrita: valida se o usuário autenticado é administrador.
    
    Retorna HTTP 404 NOT FOUND (em vez de 403) para mascarar totalmente a existência
    do endpoint perante usuários comuns ou scanners.
    """
    user_email = current_user.get("email")
    if not is_admin_email(user_email):
        logger.warning(f"[Stealth Security] Tentativa não autorizada ao vault de auditoria por: {user_email}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not Found",
        )
    return current_user


@router.get("/verify")
async def verify_admin_status(
    admin: dict = Depends(verify_admin_user),
):
    """Verifica se a credencial atual possui acesso à rota secreta."""
    return {
        "status": "authorized",
        "is_admin": True,
        "email": admin.get("email"),
    }


@router.get("/metrics")
async def fetch_audit_metrics(
    admin: dict = Depends(verify_admin_user),
):
    """Retorna métricas consolidadas de consumo de tokens e custos em USD."""
    try:
        metrics = await get_audit_metrics()
        return metrics
    except Exception as e:
        logger.error(f"Erro ao buscar métricas de auditoria: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha interna ao consolidar métricas de auditoria.",
        )


@router.get("/users")
async def fetch_audit_users(
    admin: dict = Depends(verify_admin_user),
):
    """Retorna diretório de amigos/usuários com total de conversas, sessões e custo USD acumulado."""
    try:
        data = await get_audit_users_summary()
        return data
    except Exception as e:
        logger.error(f"Erro ao buscar lista de usuários para auditoria: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha interna ao consultar diretório de usuários.",
        )


@router.get("/users/{user_email}/conversations")
async def fetch_user_conversations(
    user_email: str,
    admin: dict = Depends(verify_admin_user),
):
    """Retorna as mensagens do usuário selecionado organizadas e agrupadas por sessões de conversa."""
    try:
        data = await get_user_conversations(user_email)
        return data
    except Exception as e:
        logger.error(f"Erro ao buscar conversas do usuário {user_email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha interna ao recuperar conversas do usuário.",
        )


@router.get("/logs")
async def fetch_audit_logs(
    page: int = Query(1, ge=1, description="Número da página"),
    limit: int = Query(30, ge=1, le=100, description="Itens por página"),
    search: Optional[str] = Query(None, description="Busca textual em prompts, respostas ou emails"),
    user_email: Optional[str] = Query(None, description="Filtrar por e-mail de usuário"),
    model_name: Optional[str] = Query(None, description="Filtrar por modelo de LLM"),
    anonymized: bool = Query(False, description="Mascarar e-mails e IPs nos resultados"),
    admin: dict = Depends(verify_admin_user),
):
    """Retorna a lista paginada e filtrada de interações registradas no sistema."""
    try:
        data = await get_audit_logs(
            page=page,
            limit=limit,
            search=search,
            user_email=user_email,
            model_name=model_name,
            anonymize=anonymized,
        )
        return data
    except Exception as e:
        logger.error(f"Erro ao buscar logs de auditoria: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha interna ao consultar logs de auditoria.",
        )


@router.get("/export")
async def export_audit_logs(
    format_type: str = Query("csv", pattern="^(csv|json)$"),
    user_email: Optional[str] = Query(None, description="Filtrar exportação para usuário específico"),
    anonymized: bool = Query(True, description="Mascarar e-mails e IPs nos dados exportados"),
    admin: dict = Depends(verify_admin_user),
):
    """Exporta os registros de auditoria em CSV ou JSON para relatórios externos."""
    try:
        data = await get_audit_logs(page=1, limit=5000, user_email=user_email, anonymize=anonymized)
        logs = data.get("logs", [])

        if format_type == "json":
            return logs

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "ID", "Data/Hora (UTC)", "Email", "IP", "Sessao",
            "Modelo", "Prompt Tokens", "Completion Tokens", "Total Tokens",
            "Custo (USD)", "Prompt", "Resposta"
        ])

        for item in logs:
            writer.writerow([
                item["id"],
                item["created_at"],
                item["user_email"],
                item["ip_address"],
                item["session_id"],
                item["model_name"],
                item["prompt_tokens"],
                item["completion_tokens"],
                item["total_tokens"],
                f"${item['cost_usd']:.6f}",
                item["user_prompt"].replace("\n", " ")[:300],
                item["model_response"].replace("\n", " ")[:300],
            ])

        output.seek(0)
        filename = f"charlie_audit_{user_email or 'all'}.csv"
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    except Exception as e:
        logger.error(f"Erro ao exportar logs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha ao gerar arquivo de exportação.",
        )


from pydantic import BaseModel, Field


class SuspendUserRequest(BaseModel):
    suspended: bool
    reason: Optional[str] = Field(default="Conta suspensa pelo administrador.", max_length=250)
    email: Optional[str] = None


class UpdateUserQuotaRequest(BaseModel):
    daily_token_limit: int = Field(default=250000, ge=1000, le=50000000)
    daily_request_limit: int = Field(default=300, ge=1, le=50000)
    monthly_cost_limit_usd: float = Field(default=10.0, ge=0.01, le=10000.0)


class UpdateGlobalLimitsRequest(BaseModel):
    default_daily_token_limit: Optional[int] = Field(default=None, ge=1000, le=50000000)
    default_daily_request_limit: Optional[int] = Field(default=None, ge=1, le=50000)
    default_monthly_cost_limit_usd: Optional[float] = Field(default=None, ge=0.01, le=10000.0)
    chat_rate_limit_per_min: Optional[int] = Field(default=None, ge=1, le=600)


@router.post("/users/{user_id}/suspend")
async def toggle_user_suspension(
    user_id: str,
    data: SuspendUserRequest,
    admin: dict = Depends(verify_admin_user),
):
    """Suspende ou reativa uma conta de usuário no sistema, bloqueando novas interações se suspensa."""
    from api.db import get_or_init_db_pool
    from api.security.rate_limiter import set_user_suspended_in_memory

    clean_uid = user_id.strip()
    clean_email = (data.email or "").strip().lower()
    reason = (data.reason or "Conta suspensa pelo administrador.").strip() if data.suspended else ""

    set_user_suspended_in_memory(clean_uid, data.suspended, reason)
    if clean_email:
        set_user_suspended_in_memory(clean_email, data.suspended, reason)

    pool = await get_or_init_db_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO public.user_profiles (user_id, email, is_suspended, suspended_at, suspended_reason, updated_at)
                    VALUES ($1, $2, $3, CASE WHEN $3 THEN NOW() ELSE NULL END, $4, NOW())
                    ON CONFLICT (user_id) DO UPDATE
                    SET is_suspended = EXCLUDED.is_suspended,
                        suspended_at = EXCLUDED.suspended_at,
                        suspended_reason = EXCLUDED.suspended_reason,
                        updated_at = NOW();
                    """,
                    clean_uid,
                    clean_email or None,
                    bool(data.suspended),
                    reason or None,
                )
        except Exception as e:
            logger.debug(f"Fallback em memória para toggle_user_suspension: {e}")

    logger.info(
        f"[Admin Action] Usuário {clean_uid} ({clean_email}) {'SUSPENSO' if data.suspended else 'REATIVADO'} por {admin.get('email')}"
    )
    return {
        "ok": True,
        "user_id": clean_uid,
        "is_suspended": bool(data.suspended),
        "suspended_reason": reason or None,
    }


@router.post("/users/{user_id}/quotas")
async def update_user_quota(
    user_id: str,
    data: UpdateUserQuotaRequest,
    admin: dict = Depends(verify_admin_user),
):
    """Atualiza os limites operacionais e financeiros individuais de um usuário."""
    from api.db import get_or_init_db_pool
    from api.security.rate_limiter import set_user_quota_in_memory

    clean_uid = user_id.strip()
    quota_dict = {
        "daily_token_limit": int(data.daily_token_limit),
        "daily_request_limit": int(data.daily_request_limit),
        "monthly_cost_limit_usd": float(data.monthly_cost_limit_usd),
    }
    set_user_quota_in_memory(clean_uid, quota_dict)

    pool = await get_or_init_db_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO public.user_quotas (user_id, daily_token_limit, daily_request_limit, monthly_cost_limit_usd, updated_at)
                    VALUES ($1, $2, $3, $4, NOW())
                    ON CONFLICT (user_id) DO UPDATE
                    SET daily_token_limit = EXCLUDED.daily_token_limit,
                        daily_request_limit = EXCLUDED.daily_request_limit,
                        monthly_cost_limit_usd = EXCLUDED.monthly_cost_limit_usd,
                        updated_at = NOW();
                    """,
                    clean_uid,
                    int(data.daily_token_limit),
                    int(data.daily_request_limit),
                    float(data.monthly_cost_limit_usd),
                )
        except Exception as e:
            logger.debug(f"Fallback em memória para update_user_quota: {e}")

    logger.info(f"[Admin Action] Cota atualizada para {clean_uid} por {admin.get('email')}: {quota_dict}")
    return {"ok": True, "user_id": clean_uid, "quotas": quota_dict}


@router.get("/limits")
async def get_operational_limits(
    admin: dict = Depends(verify_admin_user),
):
    """Retorna os limites operacionais globais ativos."""
    from api.security.rate_limiter import get_global_operational_limits

    return get_global_operational_limits()


@router.put("/limits")
async def set_operational_limits(
    data: UpdateGlobalLimitsRequest,
    admin: dict = Depends(verify_admin_user),
):
    """Atualiza os limites operacionais globais de mensagens, tokens e orçamento padrão."""
    from api.security.rate_limiter import update_global_operational_limits

    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    updated = update_global_operational_limits(updates)
    logger.info(f"[Admin Action] Limites operacionais globais atualizados por {admin.get('email')}: {updated}")
    return {"ok": True, "limits": updated}


@router.get("/quality")
async def fetch_quality_metrics(
    admin: dict = Depends(verify_admin_user),
):
    """Retorna o resumo de avaliações de qualidade (👍 / 👎) e respostas mal avaliadas."""
    metrics = await get_audit_metrics()
    return metrics.get("quality_summary", {
        "positive_count": 0,
        "negative_count": 0,
        "total_feedback": 0,
        "approval_rate": 100.0,
        "recent_negative_feedback": [],
    })

