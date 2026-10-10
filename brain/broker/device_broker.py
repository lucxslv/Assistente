"""Despachante de Ferramentas Remotas (Device Broker via WebSocket)."""

import asyncio
import logging
from typing import Any, Dict, Optional

logger = logging.getLogger("charlie.broker")


class RemoteDeviceBroker:
    """Gerencia despacho assíncrono de ferramentas que requerem o computador local do usuário com isolamento multi-tenant."""

    def __init__(self):
        self._pending_calls: Dict[str, asyncio.Future] = {}
        self._active_device_ws = None
        self._user_devices: Dict[str, Any] = {}

    def register_device_connection(self, ws, user_id: Optional[str] = None):
        self._active_device_ws = ws
        if user_id:
            self._user_devices[str(user_id)] = ws
        logger.info(f"Device Broker: Conexão de dispositivo registrada para execução remota (user={user_id or 'default'}).")

    def unregister_device_connection(self, ws, user_id: Optional[str] = None):
        if self._active_device_ws == ws:
            self._active_device_ws = None
        if user_id and str(user_id) in self._user_devices and self._user_devices[str(user_id)] == ws:
            del self._user_devices[str(user_id)]
        else:
            for u, s in list(self._user_devices.items()):
                if s == ws:
                    del self._user_devices[u]
        logger.info(f"Device Broker: Conexão de dispositivo desconectada (user={user_id or 'default'}).")

    def has_active_device(self, user_id: Optional[str] = None) -> bool:
        if user_id:
            return str(user_id) in self._user_devices
        return self._active_device_ws is not None

    async def dispatch_device_tool(
        self,
        call_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
        user_id: Optional[str] = None,
        timeout: float = 15.0,
    ) -> str:
        """Envia comando de execução para o desktop conectado do usuário e aguarda a resposta."""
        target_ws = None
        if user_id and str(user_id) in self._user_devices:
            target_ws = self._user_devices[str(user_id)]
        elif not user_id:
            target_ws = self._active_device_ws

        if not target_ws:
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
            await target_ws.send_json(payload)
            logger.info(f"Device Broker: Despachada ferramenta '{tool_name}' (call_id: {call_id}, user: {user_id or 'default'})")

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
