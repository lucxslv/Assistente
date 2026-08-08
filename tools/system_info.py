"""Tool de exemplo: hora, data e status do PC."""

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
    try:
        import psutil
    except ImportError:
        return (
            f"Sistema: {platform.system()} {platform.release()}. "
            "Instale 'psutil' para métricas detalhadas."
        )

    cpu = psutil.cpu_percent(interval=0.5)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")

    return (
        f"Sistema {platform.system()} {platform.release()}. "
        f"CPU em {cpu:.0f}%, "
        f"memória em {memory.percent:.0f}%, "
        f"disco em {disk.percent:.0f}%."
    )
