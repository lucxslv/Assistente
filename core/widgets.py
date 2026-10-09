"""Contrato canônico e construtores de widgets com fallback determinístico obrigatório.

Garante que nenhuma interface (mobile, desktop ou web) fique dependente exclusivamente
de renderização visual para comunicar dados essenciais. Se um widget quebrar ou for
desconhecido, o fallbackText garante a continuidade da conversa.
"""

from __future__ import annotations
import uuid
from typing import Any, Dict, Optional


def build_server_health_widget_payload(
    cpu_percent: float,
    ram_percent: float,
    database: str | bool,
    websocket: str | bool,
    sse: Optional[str | bool] = "connected",
    title: str = "Saúde do Sistema",
    action_label: Optional[str] = "Ver Detalhes",
    widget_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Gera payload versionado do ServerHealthWidget com fallback textual determinístico."""
    w_id = widget_id or f"w_{uuid.uuid4().hex[:8]}"
    db_status = "saudável" if database in (True, "healthy") else str(database)
    ws_status = "conectado" if websocket in (True, "connected") else str(websocket)

    fallback = (
        f"🖥️ **{title}**: CPU: {cpu_percent:.1f}% | RAM: {ram_percent:.1f}% | "
        f"Banco: {db_status} | WebSocket: {ws_status}"
    )

    return {
        "id": w_id,
        "type": "server_health",
        "version": 1,
        "data": {
            "title": title,
            "cpuPercent": cpu_percent,
            "ramPercent": ram_percent,
            "database": database,
            "webSocket": websocket,
            "sse": sse,
            "actionLabel": action_label,
        },
        "fallbackText": fallback,
    }


def build_storage_widget_payload(
    title: str,
    used_percent: float,
    used_label: str,
    total_label: str,
    widget_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Gera payload versionado de StorageUsage com fallback textual determinístico."""
    w_id = widget_id or f"w_{uuid.uuid4().hex[:8]}"
    fallback = f"💾 **{title}**: {used_label} utilizados de {total_label} ({used_percent:.0f}% em uso)."

    return {
        "id": w_id,
        "type": "storage_usage",
        "version": 1,
        "data": {
            "title": title,
            "usedPercent": used_percent,
            "usedLabel": used_label,
            "totalLabel": total_label,
        },
        "fallbackText": fallback,
    }


def build_unavailable_widget_payload(
    original_kind: str,
    reason: str,
    fallback_text: str,
    widget_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Gera o payload explícito para o estado embedded_widget_unavailable."""
    w_id = widget_id or f"w_{uuid.uuid4().hex[:8]}"
    return {
        "id": w_id,
        "type": "embedded_widget_unavailable",
        "version": 1,
        "data": {
            "originalKind": original_kind,
            "reason": reason,
        },
        "fallbackText": fallback_text or f"Visualização interativa '{original_kind}' indisponível no momento.",
    }


def validate_and_normalize_widget(widget: Dict[str, Any]) -> Dict[str, Any]:
    """Valida a estrutura do widget, gera fallback se ausente e degrada tipos desconhecidos com segurança."""
    if not isinstance(widget, dict):
        return build_unavailable_widget_payload(
            original_kind="unknown",
            reason="Payload de widget inválido ou não-objeto",
            fallback_text="Conteúdo interativo indisponível.",
        )

    w_type = widget.get("type", "unknown")
    w_data = widget.get("data", {})
    fallback = widget.get("fallbackText", "")

    if w_type == "server_health":
        if not fallback:
            cpu = w_data.get("cpuPercent", 0)
            ram = w_data.get("ramPercent", 0)
            fallback = f"Status do Servidor: CPU: {cpu}% | RAM: {ram}%"
        return {
            "id": widget.get("id") or f"w_{uuid.uuid4().hex[:8]}",
            "type": "server_health",
            "version": widget.get("version", 1),
            "data": w_data,
            "fallbackText": fallback,
        }

    if w_type == "storage_usage":
        if not fallback:
            u_lbl = w_data.get("usedLabel", "N/A")
            t_lbl = w_data.get("totalLabel", "N/A")
            fallback = f"Armazenamento: {u_lbl} de {t_lbl}"
        return {
            "id": widget.get("id") or f"w_{uuid.uuid4().hex[:8]}",
            "type": "storage_usage",
            "version": widget.get("version", 1),
            "data": w_data,
            "fallbackText": fallback,
        }

    if w_type == "embedded_widget_unavailable":
        return {
            "id": widget.get("id") or f"w_{uuid.uuid4().hex[:8]}",
            "type": "embedded_widget_unavailable",
            "version": widget.get("version", 1),
            "data": w_data,
            "fallbackText": fallback or "Visualização interativa indisponível no momento.",
        }

    # Tipo desconhecido (versão futura ou componente não suportado pelo cliente)
    return build_unavailable_widget_payload(
        original_kind=w_type,
        reason=f"Widget do tipo '{w_type}' não suportado nesta versão",
        fallback_text=fallback or f"Dados estruturados '{w_type}' recebidos com sucesso.",
        widget_id=widget.get("id"),
    )
