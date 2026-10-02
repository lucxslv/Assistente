"""Rotas administrativas para visualização de auditoria, telemetria e controle de custos USD."""

import csv
import io
import logging
from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from api.routes.auth import get_current_user
from api.services.audit_service import get_audit_logs, get_audit_metrics

logger = logging.getLogger("charlie.api.admin")
router = APIRouter(prefix="/admin/audit", tags=["Admin & Audit"])


@router.get("/metrics")
async def fetch_audit_metrics(
    user: dict = Depends(get_current_user),
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


@router.get("/logs")
async def fetch_audit_logs(
    page: int = Query(1, ge=1, description="Número da página"),
    limit: int = Query(30, ge=1, le=100, description="Itens por página"),
    search: Optional[str] = Query(None, description="Busca textual em prompts, respostas ou emails"),
    user_email: Optional[str] = Query(None, description="Filtrar por e-mail de usuário"),
    model_name: Optional[str] = Query(None, description="Filtrar por modelo de LLM"),
    user: dict = Depends(get_current_user),
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
async def export_audit_logs_csv(
    user: dict = Depends(get_current_user),
    format_type: str = Query("csv", regex="^(csv|json)$"),
):
    """Exporta os registros de auditoria em CSV ou JSON para relatórios externos."""
    try:
        data = await get_audit_logs(page=1, limit=1000)
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
                item["user_prompt"].replace("\n", " ")[:200],
                item["model_response"].replace("\n", " ")[:200],
            ])

        output.seek(0)
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=charlie_audit_logs.csv"},
        )
    except Exception as e:
        logger.error(f"Erro ao exportar logs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha ao gerar arquivo de exportação.",
        )
