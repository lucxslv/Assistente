"""Tool de exemplo: previsão do tempo."""

import httpx

from config import config


async def get_weather(city: str) -> str:
    if not config.openweather_api_key:
        return "A API de clima não está configurada. Adicione OPENWEATHER_API_KEY no .env."

    url = "https://api.openweathermap.org/data/2.5/weather"
    params = {
        "q": city,
        "appid": config.openweather_api_key,
        "units": "metric",
        "lang": "pt_br",
    }

    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()

    description = data["weather"][0]["description"]
    temp = data["main"]["temp"]
    feels_like = data["main"]["feels_like"]
    humidity = data["main"]["humidity"]

    return (
        f"Em {city}: {description}, "
        f"{temp:.0f}°C (sensação de {feels_like:.0f}°C), "
        f"umidade {humidity}%."
    )
