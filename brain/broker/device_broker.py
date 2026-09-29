"""Despachante de Ferramentas Remotas (Device Broker via WebSocket)."""

import asyncio
import logging
from typing import Any, Dict, Optional

logger = logging.getLogger("charlie.broker")


class RemoteDeviceBroker:
    """Gerencia despacho assíncrono de ferramentas que requerem o computador local do usuário."""

    def __init__(self):
        self._pending_calls: Dict[str, asyncio.Future] = {}
        self._active_device_ws = None

    def register_device_connection(self, ws):
        self._active_device_ws = ws
        logger.info("Device Broker: Conexão de dispositivo registrada para execução remota.")

    def unregister_device_connection(self, ws):
        if self._active_device_ws == ws:
            self._active_device_ws = None
            logger.info("Device Broker: Conexão de dispositivo desconectada.")

    def has_active_device(self) -> bool:
        return self._active_device_ws is not None

    async def dispatch_device_tool(
        self,
        call_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
        timeout: float = 15.0,
    ) -> str:
        """Envia comando de execução para o desktop conectado e aguarda a resposta."""
        if not self._active_device_ws:
            return f"Aviso: Nenhum dispositivo desktop está conectado no momento para executar '{tool_name}'."

        loop = asyncio.get_running_loop()
        future: asyncio.Future = loop.create_future()
        self._pending_calls[call_id] = future

        try:
            payload = {
                "type": "device_tool_call",
                "call_id": call_id,
                "tool": tool_name,
                "args": arguments,
            }
            await self._active_device_ws.send_json(payload)
            logger.info(f"Device Broker: Despachada ferramenta '{tool_name}' (call_id: {call_id})")

            # Aguarda a resposta do dispositivo com timeout
            result = await asyncio.wait_for(future, timeout=timeout)
            return str(result)
        except asyncio.TimeoutError:
            logger.error(f"Device Broker: Timeout ao executar '{tool_name}' no dispositivo.")
            return f"Timeout: O dispositivo demorou mais de {timeout}s para responder a '{tool_name}'."
        except Exception as e:
            logger.exception(f"Device Broker: Erro no despacho de '{tool_name}': {e}")
            return f"Erro ao despachar '{tool_name}' para o dispositivo: {e}"
        finally:
            self._pending_calls.pop(call_id, None)

    def resolve_tool_result(self, call_id: str, result: Any):
        """Recebe o resultado retornado pelo dispositivo e resolve a Future pendente."""
        future = self._pending_calls.get(call_id)
        if future and not future.done():
            future.set_result(result)
            logger.info(f"Device Broker: Resultado recebido para call_id {call_id}: {result}")
        else:
            logger.warning(f"Device Broker: Nenhum future pendente para call_id {call_id}")


# Instância global compartilhada
device_broker = RemoteDeviceBroker()
