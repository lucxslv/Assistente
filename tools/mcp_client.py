"""Cliente MCP (Model Context Protocol) nativo para integração universal de ferramentas."""

from __future__ import annotations
import asyncio
import json
import logging
import os
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("charlie.tools.mcp")


@dataclass
class MCPServerConfig:
    name: str
    transport: str  # "stdio" | "sse"
    command: Optional[str] = None
    args: List[str] = field(default_factory=list)
    env: Dict[str, str] = field(default_factory=dict)
    url: Optional[str] = None


class MCPClient:
    """Cliente para conexão com servidores MCP externos (Model Context Protocol)."""

    def __init__(self, config_path: Optional[Path] = None) -> None:
        self.config_path = config_path or (Path(__file__).resolve().parent.parent / "mcp_servers.json")
        self.servers: Dict[str, MCPServerConfig] = {}
        self._discovered_tools: Dict[str, Dict[str, Any]] = {}
        self._load_config()

    def _load_config(self):
        """Carrega configurações de servidores a partir do arquivo mcp_servers.json ou ambiente."""
        if self.config_path.exists():
            try:
                with open(self.config_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    mcp_servers = data.get("mcpServers", data)
                    for name, s_cfg in mcp_servers.items():
                        self.servers[name] = MCPServerConfig(
                            name=name,
                            transport=s_cfg.get("transport", "stdio"),
                            command=s_cfg.get("command"),
                            args=s_cfg.get("args", []),
                            env=s_cfg.get("env", {}),
                            url=s_cfg.get("url"),
                        )
                logger.info(f"MCPClient: {len(self.servers)} servidores carregados de {self.config_path}")
            except Exception as e:
                logger.warning(f"MCPClient: Erro ao ler {self.config_path}: {e}")

    async def list_tools_for_server(self, server_name: str) -> List[Dict[str, Any]]:
        """Descobre ferramentas expostas por um servidor MCP específico."""
        server = self.servers.get(server_name)
        if not server:
            return []

        if server.transport == "stdio" and server.command:
            # Envia requisição JSON-RPC inicial para listar tools
            req = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/list",
                "params": {},
            }
            try:
                env = os.environ.copy()
                env.update(server.env)

                cmd = [server.command] + server.args
                # Verifica executável
                executable = shutil.which(server.command)
                if not executable:
                    return []

                proc = await asyncio.create_subprocess_exec(
                    executable,
                    *server.args,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                    env=env,
                )

                input_data = (json.dumps(req) + "\n").encode("utf-8")
                stdout, _ = await asyncio.wait_for(proc.communicate(input_data), timeout=5.0)

                if stdout:
                    for line in stdout.decode("utf-8", errors="replace").splitlines():
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            resp = json.loads(line)
                            if resp.get("id") == 1 and "result" in resp:
                                tools = resp["result"].get("tools", [])
                                for t in tools:
                                    t["server"] = server_name
                                    self._discovered_tools[f"mcp_{server_name}_{t['name']}"] = t
                                return tools
                        except json.JSONDecodeError:
                            continue
            except Exception as e:
                logger.debug(f"MCPClient: Servidor '{server_name}' não respondeu a tools/list: {e}")

        return []

    async def discover_all_tools(self) -> Dict[str, Dict[str, Any]]:
        """Varre todos os servidores MCP configurados e compila as ferramentas disponíveis."""
        for server_name in self.servers.keys():
            await self.list_tools_for_server(server_name)
        return self._discovered_tools

    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> str:
        """Invoca uma ferramenta em um servidor MCP via JSON-RPC."""
        tool_info = self._discovered_tools.get(tool_name)
        if not tool_info:
            return f"Ferramenta MCP '{tool_name}' não encontrada ou servidor desconectado."

        server_name = tool_info.get("server")
        server = self.servers.get(server_name)
        if not server:
            return f"Servidor MCP '{server_name}' não configurado."

        actual_tool_name = tool_info.get("name", tool_name)
        req = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": actual_tool_name,
                "arguments": arguments,
            },
        }

        try:
            env = os.environ.copy()
            env.update(server.env)
            executable = shutil.which(server.command)
            if not executable:
                return f"Executável '{server.command}' não encontrado no PATH."

            proc = await asyncio.create_subprocess_exec(
                executable,
                *server.args,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
                env=env,
            )

            input_data = (json.dumps(req) + "\n").encode("utf-8")
            stdout, _ = await asyncio.wait_for(proc.communicate(input_data), timeout=60.0)

            if stdout:
                for line in stdout.decode("utf-8", errors="replace").splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        resp = json.loads(line)
                        if resp.get("id") == 2 and "result" in resp:
                            content = resp["result"].get("content", [])
                            text_parts = [c.get("text", "") for c in content if c.get("type") == "text"]
                            return "\n".join(text_parts) if text_parts else json.dumps(resp["result"])
                    except json.JSONDecodeError:
                        continue

            return f"Servidor MCP '{server_name}' concluiu sem retorno textual."
        except Exception as e:
            logger.exception(f"Erro ao executar ferramenta MCP '{tool_name}': {e}")
            return f"Erro ao executar ferramenta MCP '{tool_name}': {e}"


# Instância global singleton do cliente MCP
mcp_client = MCPClient()
