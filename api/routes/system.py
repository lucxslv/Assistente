"""Rotas de monitoramento e status do sistema operacional, presença e telemetria do Charlie."""

try:
    import psutil
except ImportError:
    psutil = None
from fastapi import APIRouter
from api.db import get_db_pool
from api.state import state
from brain.context.presence import presence_manager
from config import config

router = APIRouter(prefix="/system", tags=["System"])


@router.get("/status")
async def system_status():
    """Retorna a telemetria ao vivo do Charlie e do computador."""
    pool = get_db_pool()
    host_info = {
        "cpu_percent": 0.0,
        "memory_used_mb": 0,
        "memory_total_mb": 0,
        "memory_percent": 0.0,
    }
    if psutil:
        try:
            mem = psutil.virtual_memory()
            host_info = {
                "cpu_percent": psutil.cpu_percent(interval=None),
                "memory_used_mb": int(mem.used / (1024 * 1024)),
                "memory_total_mb": int(mem.total / (1024 * 1024)),
                "memory_percent": mem.percent,
            }
        except Exception:
            pass

    active_devices = presence_manager.get_active_clients()

    return {
        "assistant_name": config.assistant_name,
        "is_online": state.is_online,
        "status": state.status.value,
        "is_speaking": state.is_speaking,
        "is_listening": state.is_listening,
        "active_thread_id": state.active_thread_id,
        "active_tool": state.active_tool,
        "current_process": state.current_process,
        "uptime_seconds": state.to_dict()["uptime_seconds"],
        "database_connected": pool is not None,
        "connected_devices_count": len(active_devices),
        "host": host_info,
    }


@router.get("/presence")
async def system_presence():
    """Retorna a lista de clientes e dispositivos conectados em tempo real."""
    return [
        {
            "client_id": c.client_id,
            "client_type": c.client_type,
            "name": c.name,
            "platform": c.platform,
            "ip_address": c.ip_address,
            "connected_at": c.connected_at.isoformat(),
            "last_seen": c.last_seen.isoformat(),
            "active_thread_id": c.active_thread_id,
        }
        for c in presence_manager.get_active_clients()
    ]
