"""Tool de exemplo: controle de luzes/dispositivos via Home Assistant."""

import httpx

from config import config


async def control_device(entity_id: str, action: str) -> str:
    if not config.home_assistant_url or not config.home_assistant_token:
        return (
            "Home Assistant não configurado. "
            "Defina HOME_ASSISTANT_URL e HOME_ASSISTANT_TOKEN no .env."
        )

    domain = entity_id.split(".")[0]
    service_map = {
        "turn_on": f"{domain}/turn_on",
        "turn_off": f"{domain}/turn_off",
        "toggle": f"{domain}/toggle",
    }

    service = service_map.get(action)
    if not service:
        return f"Ação '{action}' não suportada."

    url = f"{config.home_assistant_url.rstrip('/')}/api/services/{service}"
    headers = {
        "Authorization": f"Bearer {config.home_assistant_token}",
        "Content-Type": "application/json",
    }
    payload = {"entity_id": entity_id}

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()

    action_labels = {
        "turn_on": "ligado",
        "turn_off": "desligado",
        "toggle": "alternado",
    }
    return f"Dispositivo {entity_id} {action_labels[action]}."
