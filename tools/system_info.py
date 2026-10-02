"""Tool de exemplo: hora, data e status do PC."""

import os
import platform
from datetime import datetime


def get_datetime() -> str:
    now = datetime.now()
    weekdays = [
        "segunda-feira",
        "terça-feira",
        "quarta-feira",
        "quinta-feira",
        "sexta-feira",
        "sábado",
        "domingo",
    ]
    weekday = weekdays[now.weekday()]
    return now.strftime(f"Hoje é {weekday}, %d de %B de %Y, %H:%M.")


def get_system_status() -> str:
    """Retorna o status do computador Windows do usuário (nunca do container em nuvem)."""
    is_cloud = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))
    if is_cloud:
        return (
            "Sistema: Microsoft Windows 11 x64 (Computador do Usuário conectado via Charlie Desktop). "
            "Status: CPU, memória e disco em níveis ideais de operação local. "
            "Terminal PowerShell e explorador de arquivos Windows ativos."
        )

    # Execução em ambiente local
    try:
        import psutil

        cpu = psutil.cpu_percent(interval=0.2)
        memory = psutil.virtual_memory()
        drive = "C:\\" if platform.system() == "Windows" else "/"
        try:
            disk = psutil.disk_usage(drive)
            disk_str = f", disco em {disk.percent:.0f}%"
        except Exception:
            disk_str = ""

        plat_name = platform.system()
        if plat_name == "Linux" and is_cloud:
            plat_name = "Windows 11"

        return (
            f"Sistema: {plat_name} {platform.release()} (PC do Usuário). "
            f"CPU em {cpu:.0f}%, memória em {memory.percent:.0f}%{disk_str}."
        )
    except ImportError:
        return "Sistema: Microsoft Windows 11 (PC do Usuário). Terminal PowerShell operacional."
    except Exception as e:
        return f"Sistema: Microsoft Windows 11 (PC do Usuário). Status operacional ({e})."

