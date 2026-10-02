"""Gerenciador Inteligente de Contexto do Charlie."""

import asyncio
import datetime
import logging
import platform
import socket
from typing import Optional

from brain.context.presence import presence_manager
from config import config

logger = logging.getLogger("charlie.context")

DIAS_SEMANA = [
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
    "Domingo",
]

MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
]


class ContextManager:
    """Gerencia e compila todo o contexto do ambiente em tempo real para o system prompt."""

    def __init__(self):
        self._cached_weather: Optional[str] = None
        self._last_weather_fetch: Optional[datetime.datetime] = None
        self._weather_ttl_seconds = 1800  # 30 minutos

    def _get_time_of_day(self, hour: int) -> str:
        if 0 <= hour < 6:
            return "Madrugada"
        elif 6 <= hour < 12:
            return "Manhã"
        elif 12 <= hour < 18:
            return "Tarde"
        else:
            return "Noite"

    def _get_formatted_datetime(self) -> tuple[str, str]:
        now = datetime.datetime.now()
        dia_semana = DIAS_SEMANA[now.weekday()]
        mes = MESES[now.month - 1]
        periodo = self._get_time_of_day(now.hour)

        formatted_date = (
            f"{dia_semana}, {now.day:02d} de {mes} de {now.year} às "
            f"{now.hour:02d}:{now.minute:02d}:{now.second:02d}"
        )
        return formatted_date, periodo

    async def refresh_weather_if_needed(self, city: str = "São Paulo") -> Optional[str]:
        """Atualiza a previsão do tempo em segundo plano mantendo cache."""
        if not config.openweather_api_key:
            return None

        now = datetime.datetime.now()
        if self._cached_weather and self._last_weather_fetch:
            if (now - self._last_weather_fetch).total_seconds() < self._weather_ttl_seconds:
                return self._cached_weather

        try:
            from tools.weather import get_weather
            weather_text = await get_weather(city)
            if "Em " in weather_text:
                self._cached_weather = weather_text
                self._last_weather_fetch = now
                return self._cached_weather
        except Exception as e:
            logger.debug(f"Aviso ao consultar clima em segundo plano: {e}")

        return self._cached_weather

    def build_context(self, active_thread_id: Optional[str] = None, user_name: Optional[str] = None) -> str:
        """Constrói uma string rica de contexto em tempo real para injeção no system prompt."""
        import os
        is_cloud = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))
        formatted_date, periodo = self._get_formatted_datetime()

        sections = [
            f"1. Temporalidade:\n"
            f"   - Data e Hora: {formatted_date}\n"
            f"   - Período do Dia: {periodo}\n"
            f"   - Fuso Horário Local: America/Sao_Paulo (UTC-3)",
            f"2. Plataforma e Ambiente Operacional:\n"
            f"   - Computador do Usuário: Microsoft Windows 11 / Windows NT x64 (Desktop Local)\n"
            f"   - Terminal do Usuário: PowerShell e CMD no Windows\n"
            f"   - Pastas Pessoais: C:\\Users\\... (Área de Trabalho/Desktop, Documentos, Downloads)\n"
            f"   - Papel do Servidor Nuvem: O cérebro em nuvem ({'Vercel Serverless' if is_cloud else 'Local'}) é apenas o motor de IA/API. "
            f"O servidor NÃO possui arquivos do usuário, NÃO possui terminal do usuário e JAMAIS deve ser inspecionado. "
            f"Todas as ações no disco, arquivos, processos e comandos pertencem exclusivamente ao Windows do usuário.",
        ]

        if user_name:
            sections.append(f"3. Usuário Conectado:\n   - Nome / Tratamento: {user_name}")

        # Clima se disponível em cache
        if self._cached_weather:
            sections.append(f"4. Clima no Ambiente:\n   - {self._cached_weather}")

        # Presença de Dispositivos Conectados
        presence_summary = presence_manager.summary()
        sections.append(f"5. Dispositivos e Clientes Conectados:\n{presence_summary}")

        if active_thread_id:
            sections.append(f"6. Conversa Atual:\n   - Thread ID Ativa: {active_thread_id}")

        return "\n\n".join(sections)
