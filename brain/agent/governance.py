"""Sistema de Governança, Níveis de Risco e Human-in-the-Loop (HITL) para o Charlie Agent Runtime."""

from __future__ import annotations
import asyncio
import enum
import logging
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("charlie.agent.governance")


class RiskLevel(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class PermissionRequest:
    id: str
    task_id: str
    tool: str
    arguments: Dict[str, Any]
    risk_level: RiskLevel
    description: str
    user_id: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    resolved: bool = False
    approved: Optional[bool] = None
    resolved_by: Optional[str] = None
    reason: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "taskId": self.task_id,
            "tool": self.tool,
            "arguments": self.arguments,
            "riskLevel": self.risk_level.value,
            "description": self.description,
            "userId": self.user_id,
            "createdAt": self.created_at,
            "resolved": self.resolved,
            "approved": self.approved,
            "resolvedBy": self.resolved_by,
            "reason": self.reason,
        }


class PermissionGate:
    """Controlador assíncrono de permissões e bloqueios para ações com risco de modificação do sistema."""

    # Mapeamento padrão de ferramentas para níveis de risco
    TOOL_RISK_MAP = {
        # LOW: leitura, status, buscas silenciosas
        "read_file": RiskLevel.LOW,
        "read_local_file": RiskLevel.LOW,
        "list_directory": RiskLevel.LOW,
        "list_local_directory": RiskLevel.LOW,
        "get_process_list": RiskLevel.LOW,
        "get_weather": RiskLevel.LOW,
        "search_web": RiskLevel.LOW,
        "get_system_status": RiskLevel.LOW,
        "get_system_metrics": RiskLevel.LOW,
        "get_local_ip": RiskLevel.LOW,
        "read_resource": RiskLevel.LOW,
        "get_background_process_logs": RiskLevel.LOW,

        # MEDIUM: escrita de arquivos, pastas, visualização de janelas
        "write_file": RiskLevel.MEDIUM,
        "write_local_file": RiskLevel.MEDIUM,
        "create_folder": RiskLevel.MEDIUM,
        "create_local_directory": RiskLevel.MEDIUM,
        "manage_application": RiskLevel.MEDIUM,
        "send_media_key": RiskLevel.MEDIUM,
        "set_system_volume": RiskLevel.MEDIUM,
        "set_system_volume_native": RiskLevel.MEDIUM,

        # HIGH / CRITICAL: execução de comandos de terminal, processos em background, energia
        "execute_command": RiskLevel.HIGH,
        "execute_system_command": RiskLevel.HIGH,
        "start_background_process": RiskLevel.HIGH,
        "kill_background_process": RiskLevel.HIGH,
        "system_power_action_native": RiskLevel.CRITICAL,
        "lock_workstation": RiskLevel.MEDIUM,
        "minimize_all_windows": RiskLevel.LOW,
    }

    # Padrões perigosos em comandos executáveis que elevam automaticamente para CRITICAL
    CRITICAL_COMMAND_PATTERNS = [
        "rmdir /s", "rm -rf", "del /f", "format ", "diskpart",
        "reg delete", "shutdown", "stop-computer", "restart-computer",
        "drop table", "truncate table", "drop database"
    ]

    def __init__(self, require_medium_approval: bool = False) -> None:
        self.require_medium_approval = require_medium_approval
        self._pending: Dict[str, PermissionRequest] = {}
        self._events: Dict[str, asyncio.Event] = {}

    def assess_risk(self, tool: str, arguments: Dict[str, Any]) -> RiskLevel:
        """Avalia dinamicamente o nível de risco de uma chamada de ferramenta."""
        base_risk = self.TOOL_RISK_MAP.get(tool, RiskLevel.MEDIUM)

        # Se for comando de terminal, verifica padrões de alto risco
        if tool in ("execute_command", "execute_system_command"):
            cmd = str(arguments.get("command", "")).lower()
            if any(pattern in cmd for pattern in self.CRITICAL_COMMAND_PATTERNS):
                return RiskLevel.CRITICAL
            return RiskLevel.HIGH

        return base_risk

    def needs_approval(self, risk: RiskLevel) -> bool:
        """Determina se o risco avaliado exige aprovação explícita do usuário."""
        if risk == RiskLevel.CRITICAL:
            return True
        if risk == RiskLevel.HIGH:
            return True
        if risk == RiskLevel.MEDIUM and self.require_medium_approval:
            return True
        return False

    async def request_permission(
        self,
        task_id: str,
        tool: str,
        arguments: Dict[str, Any],
        description: str,
        timeout_seconds: float = 300.0,
        permission_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> tuple[bool, str]:
        """
        Registra uma requisição de permissão e bloqueia assincronamente até resposta do usuário ou timeout.
        Retorna (approved: bool, reason: str).
        """
        risk = self.assess_risk(tool, arguments)
        if os.getenv("CHARLIE_AUTO_APPROVE") == "1":
            logger.info(f"PermissionGate: Auto-aprovado ({tool}) via CHARLIE_AUTO_APPROVE.")
            return True, "Auto-aprovado para ambiente de teste / automação."

        perm_id = permission_id or f"perm_{uuid.uuid4().hex[:8]}"

        req = PermissionRequest(
            id=perm_id,
            task_id=task_id,
            tool=tool,
            arguments=arguments,
            risk_level=risk,
            description=description or f"Execução de ferramenta '{tool}' requer autorização.",
            user_id=user_id,
        )

        event = asyncio.Event()
        self._pending[perm_id] = req
        self._events[perm_id] = event

        logger.info(f"PermissionGate: Bloqueio ativado para permissão {perm_id} ({tool}, risco {risk.value})")

        try:
            # Aguarda aprovação do usuário com timeout seguro
            await asyncio.wait_for(event.wait(), timeout=timeout_seconds)
            approved = bool(req.approved)
            reason = req.reason or ("Aprovado pelo usuário" if approved else "Rejeitado pelo usuário")
            return approved, reason
        except asyncio.TimeoutError:
            req.resolved = True
            req.approved = False
            req.reason = "Tempo limite de autorização esgotado (timeout)."
            logger.warning(f"PermissionGate: Permissão {perm_id} expirou por timeout.")
            return False, req.reason
        finally:
            self._pending.pop(perm_id, None)
            self._events.pop(perm_id, None)

    def resolve_permission(
        self,
        permission_id: str,
        approved: bool,
        user_name: Optional[str] = None,
        user_id: Optional[str] = None,
        reason: Optional[str] = None,
    ) -> bool:
        """Resolve uma permissão pendente, liberando a trava do asyncio.Event."""
        req = self._pending.get(permission_id)
        event = self._events.get(permission_id)

        if not req or not event:
            logger.warning(f"PermissionGate: Tentativa de resolver permissão inexistente ou expirada: {permission_id}")
            return False

        # Proteção contra dupla aprovação (Double Approval Race Condition)
        if req.resolved:
            logger.warning(f"PermissionGate: Permissão {permission_id} já resolvida previamente.")
            return False

        # Proteção contra aprovação cross-user
        if req.user_id and user_id and req.user_id != user_id:
            logger.warning(f"PermissionGate: Bloqueio de segurança: Usuário '{user_id}' tentou autorizar ação de '{req.user_id}'.")
            return False

        req.resolved = True
        req.approved = approved
        req.resolved_by = user_name or user_id or "user"
        req.reason = reason or ("Aprovado pelo usuário" if approved else "Rejeitado pelo usuário")

        event.set()
        logger.info(f"PermissionGate: Permissão {permission_id} resolvida como {approved} por {req.resolved_by}")
        return True

    def cancel_permission(self, permission_id: str, reason: str = "Operação cancelada pelo usuário") -> bool:
        """Cancela uma requisição pendente de permissão imediatamente."""
        req = self._pending.get(permission_id)
        event = self._events.get(permission_id)
        if not req or not event:
            return False
        req.resolved = True
        req.approved = False
        req.reason = reason
        event.set()
        return True

    def clear(self) -> None:
        """Limpa todas as permissões pendentes (útil para teardown de testes)."""
        for event in self._events.values():
            event.set()
        self._pending.clear()
        self._events.clear()

    def get_pending_requests(self) -> List[Dict[str, Any]]:
        """Retorna lista de permissões aguardando resposta."""
        return [r.to_dict() for r in self._pending.values() if not r.resolved]

    def get_request(self, permission_id: str) -> Optional[PermissionRequest]:
        return self._pending.get(permission_id)


# Instância global singleton do Permission Gate
permission_gate = PermissionGate()
