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
            detail=f"Falha ao consolidar métricas: {str(e)}",
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
            detail=f"Falha ao consultar amigos/usuários: {str(e)}",
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
            detail=f"Falha ao recuperar conversas: {str(e)}",
        )


@router.get("/logs")
async def fetch_audit_logs(
    page: int = Query(1, ge=1, description="Número da página"),
    limit: int = Query(30, ge=1, le=100, description="Itens por página"),
    search: Optional[str] = Query(None, description="Busca textual em prompts, respostas ou emails"),
    user_email: Optional[str] = Query(None, description="Filtrar por e-mail de usuário"),
    model_name: Optional[str] = Query(None, description="Filtrar por modelo de LLM"),
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
        )
        return data
    except Exception as e:
        logger.error(f"Erro ao buscar logs de auditoria: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Falha ao consultar logs: {str(e)}",
        )


@router.get("/export")
async def export_audit_logs(
    format_type: str = Query("csv", pattern="^(csv|json)$"),
    user_email: Optional[str] = Query(None, description="Filtrar exportação para usuário específico"),
    admin: dict = Depends(verify_admin_user),
):
    """Exporta os registros de auditoria em CSV ou JSON para relatórios externos."""
    try:
        data = await get_audit_logs(page=1, limit=5000, user_email=user_email)
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
