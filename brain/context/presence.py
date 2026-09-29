"""Gerenciador de Presença Multi-Dispositivo (Desktop, Mobile, Home Assistant)."""

import datetime
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class ConnectedClient:
    client_id: str
    client_type: str  # "desktop" | "mobile" | "web" | "home_assistant" | "cli"
    name: str
    platform: str
    ip_address: Optional[str] = None
    connected_at: datetime.datetime = field(
        default_factory=lambda: datetime.datetime.now(datetime.timezone.utc)
    )
    last_seen: datetime.datetime = field(
        default_factory=lambda: datetime.datetime.now(datetime.timezone.utc)
    )
    active_thread_id: Optional[str] = None

    def is_active(self, timeout_seconds: int = 300) -> bool:
        now = datetime.datetime.now(datetime.timezone.utc)
        return (now - self.last_seen).total_seconds() < timeout_seconds


class DevicePresenceManager:
    """Rastreia dispositivos e clientes conectados ao ecossistema Charlie."""

    def __init__(self):
        self._clients: Dict[str, ConnectedClient] = {}

    def register_or_heartbeat(
        self,
        client_id: str,
        client_type: str = "desktop",
        name: str = "Charlie Desktop",
        platform: str = "Windows",
        ip_address: Optional[str] = None,
        active_thread_id: Optional[str] = None,
    ) -> ConnectedClient:
        now = datetime.datetime.now(datetime.timezone.utc)
        if client_id in self._clients:
            client = self._clients[client_id]
            client.last_seen = now
            if active_thread_id:
                client.active_thread_id = active_thread_id
            return client

        client = ConnectedClient(
            client_id=client_id,
            client_type=client_type,
            name=name,
            platform=platform,
            ip_address=ip_address,
            connected_at=now,
            last_seen=now,
            active_thread_id=active_thread_id,
        )
        self._clients[client_id] = client
        return client

    def unregister(self, client_id: str):
        self._clients.pop(client_id, None)

    def get_active_clients(self, timeout_seconds: int = 300) -> List[ConnectedClient]:
        self.cleanup_stale(timeout_seconds)
        return list(self._clients.values())

    def cleanup_stale(self, timeout_seconds: int = 300):
        stale_keys = [k for k, c in self._clients.items() if not c.is_active(timeout_seconds)]
        for k in stale_keys:
            del self._clients[k]

    def summary(self) -> str:
        active = self.get_active_clients()
        if not active:
            return "   - Nenhum cliente registrado explicitamente (Desktop padrão ativo)."
        lines = []
        for c in active:
            lines.append(f"   - {c.name} ({c.client_type.upper()} em {c.platform})")
        return "\n".join(lines)


# Instância global compartilhada
presence_manager = DevicePresenceManager()
