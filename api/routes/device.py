"""Rotas de gerenciamento de dispositivos, presença e controle remoto de PC físico."""

import ctypes
import json
import logging
import os
import platform
import subprocess
import time
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Header, status

try:
    import psutil
except ImportError:
    psutil = None

from api.db import get_or_init_db_pool
from tools.system_control import set_system_volume, system_power_action, execute_system_command
from .pair import get_authorized_device_by_token, get_authorized_device_async

logger = logging.getLogger("charlie.device")

router = APIRouter(prefix="/device", tags=["DeviceBroker"])

# Virtual-Key codes para controle de mídia no Windows
VK_MEDIA_NEXT_TRACK = 0xB0
VK_MEDIA_PREV_TRACK = 0xB1
VK_MEDIA_STOP = 0xB2
VK_MEDIA_PLAY_PAUSE = 0xB3
VK_VOLUME_MUTE = 0xAD


def _press_windows_key(vk_code: int) -> bool:
    """Envia evento de tecla para o sistema Windows."""
    if platform.system() == "Windows":
        try:
            ctypes.windll.user32.keybd_event(vk_code, 0, 0, 0)
            ctypes.windll.user32.keybd_event(vk_code, 0, 2, 0)
            return True
        except Exception as e:
            logger.error(f"Erro ao pressionar tecla VK {vk_code}: {e}")
            return False
    return False


def _capture_windows_screen_base64() -> Optional[str]:
    """Captura a tela principal do Windows via Win32 GDI em base64 PNG."""
    if platform.system() != "Windows":
        return None
    try:
        script = r'''
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$s = @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Windows.Forms;
using System.Runtime.InteropServices;
public class Win32Cap {
    [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);
    [DllImport("gdi32.dll")] public static extern bool BitBlt(IntPtr hdcDest, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hdcSrc, int nXSrc, int nYSrc, int dwRop);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr hdc);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleBitmap(IntPtr hdc, int nWidth, int nHeight);
    [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr hdc, IntPtr hgdiobj);
    [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr hdc);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr hObject);
    public static string Capture() {
        IntPtr hdcSrc = GetDC(IntPtr.Zero);
        int w = Screen.PrimaryScreen.Bounds.Width;
        int h = Screen.PrimaryScreen.Bounds.Height;
        IntPtr hdcDest = CreateCompatibleDC(hdcSrc);
        IntPtr hBitmap = CreateCompatibleBitmap(hdcSrc, w, h);
        IntPtr hOld = SelectObject(hdcDest, hBitmap);
        BitBlt(hdcDest, 0, 0, w, h, hdcSrc, 0, 0, 0x00CC0020 | 0x40000000);
        SelectObject(hdcDest, hOld);
        DeleteDC(hdcDest);
        ReleaseDC(IntPtr.Zero, hdcSrc);
        Bitmap bmp = Image.FromHbitmap(hBitmap);
        DeleteObject(hBitmap);
        using (System.IO.MemoryStream ms = new System.IO.MemoryStream()) {
            bmp.Save(ms, ImageFormat.Png);
            bmp.Dispose();
            return Convert.ToBase64String(ms.ToArray());
        }
    }
}
"@
Add-Type -TypeDefinition $s -ReferencedAssemblies System.Windows.Forms,System.Drawing
[Console]::Out.Write([Win32Cap]::Capture())
'''
        creation_flags = 0x08000000
        res = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script],
            capture_output=True,
            text=True,
            creationflags=creation_flags,
            timeout=5,
        )
        if res.returncode == 0 and res.stdout.strip():
            b64 = res.stdout.strip()
            return f"data:image/png;base64,{b64}"
    except Exception as e:
        logger.error(f"Erro ao capturar screenshot via Win32: {e}")
    return None


def _open_target_windows(target: str) -> str:
    """Abre pasta, aplicativo ou URL com segurança no Windows."""
    if platform.system() != "Windows":
        return "Abertura não suportada neste OS."
    try:
        creation_flags = 0x08000000
        subprocess.Popen(
            ["cmd.exe", "/c", "start", "", target.strip()],
            creationflags=creation_flags,
        )
        return f"Alvo '{target}' aberto com sucesso."
    except Exception as e:
        return f"Erro ao abrir '{target}': {e}"


class HostRegistration(BaseModel):
    pin: str
    local_ip: str
    port: Optional[int] = 8005
    device_name: Optional[str] = "Meu PC"
    auth_secret: Optional[str] = None
    tunnel_url: Optional[str] = None


class VerifyPinRequest(BaseModel):
    pin: str
    device_info: Optional[Dict[str, Any]] = None


class DeviceHeartbeatRequest(BaseModel):
    device_name: Optional[str] = "Meu PC"
    cpu_percent: float
    memory_used_mb: float
    memory_total_mb: float
    memory_percent: float
    battery: Optional[Dict[str, Any]] = None
    active_tasks: Optional[List[Dict[str, Any]]] = None
    runner_status: Optional[str] = "idle"


class DeviceCommandRequest(BaseModel):
    action: str  # 'set_volume', 'volume', 'media', 'send_media_key', 'lock', 'minimize_all', 'screenshot', 'open', 'command'
    params: Optional[Dict[str, Any]] = None
    level: Optional[int] = None
    key: Optional[str] = None
    target: Optional[str] = None
    command: Optional[str] = None


# Armazenamento em memória para hosts e presença
_registered_hosts: Dict[str, Dict[str, Any]] = {}  # pin -> host data
_latest_host_state: Optional[Dict[str, Any]] = None
_pending_commands: List[Dict[str, Any]] = []  # Fila de comandos para relay quando em nuvem


def _cleanup_old_pins():
    now = time.time()
    expired = [pin for pin, data in _registered_hosts.items() if now - data.get("registered_at", 0) > 300]
    for pin in expired:
        _registered_hosts.pop(pin, None)


@router.post("/register-host")
async def register_host(req: HostRegistration):
    """Armazena temporariamente o PIN e metadados de rede do Desktop para pareamento."""
    _cleanup_old_pins()
    clean_pin = req.pin.replace("-", "").replace(" ", "").strip()

    host_data = {
        "pin": clean_pin,
        "formatted_pin": req.pin,
        "local_ip": req.local_ip,
        "port": req.port or 8005,
        "device_name": req.device_name or "Meu PC",
        "auth_secret": req.auth_secret,
        "tunnel_url": req.tunnel_url,
        "registered_at": time.time(),
        "paired": False,
    }

    _registered_hosts[clean_pin] = host_data
    global _latest_host_state
    if not _latest_host_state:
        _latest_host_state = {
            "device_name": host_data["device_name"],
            "local_ip": host_data["local_ip"],
            "port": host_data["port"],
            "last_heartbeat": time.time(),
            "telemetry": {
                "cpu_percent": 0.0,
                "memory_used_mb": 0.0,
                "memory_total_mb": 0.0,
                "memory_percent": 0.0,
            },
        }

    logger.info(f"[DEVICE] Host registrado para pareamento: {host_data['device_name']} (PIN: {clean_pin}, IP: {req.local_ip})")

    return {
        "status": "ok",
        "pin": clean_pin,
        "formatted_pin": req.pin,
        "expires_in": 300,
        "message": "Host registrado com sucesso. Aguardando pareamento.",
    }


@router.post("/verify-pin")
async def verify_pin(req: VerifyPinRequest):
    """Valida o código de 6 dígitos enviado pelo celular e retorna os dados de conexão do PC."""
    _cleanup_old_pins()
    clean_pin = req.pin.replace("-", "").replace(" ", "").strip()
    host = _registered_hosts.get(clean_pin)

    if not host:
        raise HTTPException(
            status_code=404,
            detail="Código PIN inválido ou expirado. Gere um novo no Desktop.",
        )

    host["paired"] = True
    host["paired_at"] = time.time()
    host["paired_device"] = req.device_info

    lan_url = f"http://{host['local_ip']}:{host['port']}/api"

    logger.info(f"[DEVICE] Mobile pareou com sucesso com {host['device_name']} via PIN {clean_pin}!")

    return {
        "status": "ok",
        "device_name": host["device_name"],
        "local_ip": host["local_ip"],
        "port": host["port"],
        "lan_url": lan_url,
        "tunnel_url": host.get("tunnel_url"),
        "auth_secret": host.get("auth_secret"),
        "paired": True,
    }


@router.post("/heartbeat")
async def device_heartbeat(req: DeviceHeartbeatRequest):
    """Recebe o heartbeat a cada 10s do desktop com os dados reais de CPU/RAM e tarefas."""
    global _latest_host_state, _pending_commands
    now = time.time()

    telemetry = {
        "cpu_percent": req.cpu_percent,
        "memory_used_mb": req.memory_used_mb,
        "memory_total_mb": req.memory_total_mb,
        "memory_percent": req.memory_percent,
        "battery": req.battery,
        "active_tasks": req.active_tasks or [],
        "runner_status": req.runner_status or "idle",
    }

    _latest_host_state = {
        "device_name": req.device_name or "Meu PC",
        "last_heartbeat": now,
        "telemetry": telemetry,
    }

    commands = []

    # 1. Sincronização persistente com Supabase (compartilhada entre instâncias serverless na nuvem)
    pool = await get_or_init_db_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                # Upsert da telemetria do host
                await conn.execute("""
                    INSERT INTO device_host_state (device_name, last_heartbeat, telemetry, updated_at)
                    VALUES ($1, $2, $3::jsonb, NOW())
                    ON CONFLICT (device_name) DO UPDATE
                    SET last_heartbeat = EXCLUDED.last_heartbeat,
                        telemetry = EXCLUDED.telemetry,
                        updated_at = NOW();
                """, req.device_name or "Meu PC", now, json.dumps(telemetry))

                # Busca comandos pendentes enviados via nuvem
                rows = await conn.fetch("""
                    SELECT id, action, level, key, target, command, params
                    FROM device_pending_commands
                    WHERE executed = FALSE
                    ORDER BY created_at ASC
                    LIMIT 10;
                """)
                if rows:
                    ids = [r["id"] for r in rows]
                    await conn.execute("""
                        UPDATE device_pending_commands
                        SET executed = TRUE
                        WHERE id = ANY($1::text[]);
                    """, ids)
                    for r in rows:
                        p_dict = json.loads(r["params"]) if isinstance(r["params"], str) else (r["params"] or {})
                        commands.append({
                            "id": r["id"],
                            "action": r["action"],
                            "level": r["level"],
                            "key": r["key"],
                            "target": r["target"],
                            "command": r["command"],
                            "params": p_dict,
                        })
        except Exception as e:
            logger.error(f"Erro ao sincronizar heartbeat do dispositivo com Supabase: {e}")

    # 2. Fallback de comandos em memória local
    if not commands and _pending_commands:
        commands = list(_pending_commands)
        _pending_commands.clear()

    return {
        "status": "ok",
        "acknowledged": True,
        "timestamp": now,
        "pending_commands": commands,
    }


@router.get("/status")
async def device_status():
    """Retorna se o PC físico do usuário está online (se houve heartbeat nos últimos 30s) e sua telemetria real."""
    now = time.time()

    # 1. Primeiro verifica estado recente no Supabase (robusto para ambiente serverless na Nuvem)
    pool = await get_or_init_db_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                row = await conn.fetchrow("""
                    SELECT device_name, last_heartbeat, telemetry
                    FROM device_host_state
                    ORDER BY updated_at DESC
                    LIMIT 1;
                """)
                if row:
                    dev_last = row["last_heartbeat"]
                    if (now - dev_last) <= 30.0:
                        telem = json.loads(row["telemetry"]) if isinstance(row["telemetry"], str) else (row["telemetry"] or {})
                        return {
                            "is_online": True,
                            "device_name": row["device_name"],
                            "last_seen_seconds_ago": round(now - dev_last, 1),
                            "telemetry": telem,
                        }
                    else:
                        return {
                            "is_online": False,
                            "device_name": row["device_name"],
                            "message": "Computador Offline ou Suspenso",
                            "last_seen_seconds_ago": round(now - dev_last, 1),
                            "telemetry": None,
                        }
        except Exception as e:
            logger.error(f"Erro ao consultar status no Supabase: {e}")

    # 2. Se recebemos heartbeat recente em memória do Desktop Tauri
    if _latest_host_state and (now - _latest_host_state.get("last_heartbeat", 0) <= 25.0):
        seconds_ago = round(now - _latest_host_state["last_heartbeat"], 1)
        return {
            "is_online": True,
            "device_name": _latest_host_state.get("device_name", "Meu PC"),
            "last_seen_seconds_ago": seconds_ago,
            "telemetry": _latest_host_state.get("telemetry", {}),
        }

    # 3. Se estiver rodando no host físico local direto com psutil
    if psutil and not (os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME")):
        try:
            mem = psutil.virtual_memory()
            cpu = psutil.cpu_percent(interval=None)
            battery_info = None
            if hasattr(psutil, "sensors_battery"):
                bat = psutil.sensors_battery()
                if bat:
                    battery_info = {
                        "percent": bat.percent,
                        "power_plugged": bat.power_plugged,
                    }

            telemetry = {
                "cpu_percent": cpu,
                "memory_used_mb": int(mem.used / (1024 * 1024)),
                "memory_total_mb": int(mem.total / (1024 * 1024)),
                "memory_percent": mem.percent,
                "battery": battery_info,
                "active_tasks": [],
                "runner_status": "idle",
            }

            return {
                "is_online": True,
                "device_name": platform.node() or "Desktop Host",
                "last_seen_seconds_ago": 0.0,
                "telemetry": telemetry,
            }
        except Exception:
            pass

    return {
        "is_online": False,
        "device_name": _latest_host_state.get("device_name", "Meu PC") if _latest_host_state else "Meu PC",
        "message": "Computador Offline ou Suspenso",
        "last_seen_seconds_ago": round(now - _latest_host_state["last_heartbeat"], 1) if _latest_host_state else None,
        "telemetry": None,
    }


@router.post("/command")
async def device_command(
    req: DeviceCommandRequest,
    authorization: Optional[str] = Header(None),
):
    """Executa ações remotas enviadas pelo app mobile (volume, media, lock, screenshot, open, git_pull)."""
    global _pending_commands

    # 1. Validação estrita de autenticação obrigatória (Zero Trust)
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação obrigatória. Forneça o token de pareamento do dispositivo ou credencial de usuário.",
        )

    clean_token = authorization.replace("Bearer ", "").strip()
    device = await get_authorized_device_async(clean_token)
    if not device:
        from api.routes.auth import verify_supabase_token
        user = await verify_supabase_token(clean_token)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token de dispositivo ou usuário inválido ou revogado. Pareie novamente.",
            )

    action = req.action.lower()
    params = req.params or {}

    level = req.level if req.level is not None else params.get("level")
    key = req.key or params.get("key")
    target = req.target or params.get("target") or params.get("path")
    command = req.command or params.get("command") or params.get("cmd")

    # Se estiver rodando na nuvem (Vercel / Linux), persiste para execução no PC físico via Desktop Tauri
    if platform.system() != "Windows" or os.getenv("VERCEL"):
        cmd_id = f"cmd_{int(time.time() * 1000)}"
        cmd_obj = {
            "id": cmd_id,
            "action": action,
            "level": level,
            "key": key,
            "target": target,
            "command": command,
            "params": params,
            "created_at": time.time(),
        }

        pool = await get_or_init_db_pool()
        if pool:
            try:
                async with pool.acquire() as conn:
                    await conn.execute("""
                        INSERT INTO device_pending_commands (id, action, level, key, target, command, params, executed, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, FALSE, $8);
                    """, cmd_id, action, level, key, target, command, json.dumps(params), time.time())
            except Exception as e:
                logger.error(f"Erro ao persistir comando no Supabase: {e}")
                _pending_commands.append(cmd_obj)
        else:
            _pending_commands.append(cmd_obj)

        if len(_pending_commands) > 30:
            _pending_commands.pop(0)

        return {
            "success": True,
            "status": "queued",
            "action": action,
            "message": f"Comando '{action}' despachado para execução no PC físico via relay na nuvem.",
            "command_id": cmd_id,
        }

    # Execução nativa direta no Windows
    if action in ("volume", "set_volume"):
        if level is None:
            raise HTTPException(status_code=400, detail="Parâmetro 'level' (0-100) obrigatório.")
        msg = set_system_volume(level=int(level))
        return {"success": True, "status": "ok", "action": "set_volume", "level": level, "message": msg}

    elif action in ("mute", "toggle_mute"):
        success = _press_windows_key(VK_VOLUME_MUTE)
        return {"success": success, "status": "ok", "action": "toggle_mute", "message": "Mudo alternado com sucesso."}

    elif action in ("media", "send_media_key"):
        k = (key or "play_pause").lower()
        key_map = {
            "play_pause": VK_MEDIA_PLAY_PAUSE,
            "play": VK_MEDIA_PLAY_PAUSE,
            "pause": VK_MEDIA_PLAY_PAUSE,
            "next": VK_MEDIA_NEXT_TRACK,
            "prev": VK_MEDIA_PREV_TRACK,
            "previous": VK_MEDIA_PREV_TRACK,
            "mute": VK_VOLUME_MUTE,
            "volume_up": 0xAF,
            "volume_down": 0xAE,
        }
        vk = key_map.get(k, VK_MEDIA_PLAY_PAUSE)
        success = _press_windows_key(vk)
        return {"success": success, "status": "ok", "action": "media", "key": k, "message": f"Comando de mídia '{k}' executado."}

    elif action in ("lock", "lock_workstation"):
        msg = system_power_action("lock")
        return {"success": True, "status": "ok", "action": "lock", "message": msg}

    elif action in ("minimize_all", "minimize_all_windows"):
        creation_flags = 0x08000000
        subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", "(New-Object -ComObject Shell.Application).MinimizeAll()"],
            check=False,
            creationflags=creation_flags,
        )
        return {"success": True, "status": "ok", "action": "minimize_all", "message": "Janelas minimizadas com sucesso."}

    elif action in ("screenshot", "take_screenshot"):
        b64 = _capture_windows_screen_base64()
        if b64:
            return {
                "success": True,
                "status": "ok",
                "action": "screenshot",
                "image_base64": b64,
                "message": "Captura de tela realizada com sucesso.",
            }
        else:
            return {
                "success": False,
                "status": "error",
                "action": "screenshot",
                "message": "Falha ao capturar tela do Windows.",
            }

    elif action in ("open", "open_path_or_app"):
        if not target:
            raise HTTPException(status_code=400, detail="Parâmetro 'target' obrigatório.")
        # Sanitização: bloqueia caracteres perigosos de interpolação no Windows
        if any(c in target for c in ["&", "|", ";", "`", "$", "\n", "\r"]):
            raise HTTPException(status_code=400, detail="Parâmetro 'target' contém caracteres inválidos.")
        msg = _open_target_windows(target)
        return {"success": True, "status": "ok", "action": "open", "target": target, "message": msg}

    elif action in ("command", "run_command", "quick_command", "git_pull", "sync_git"):
        # Allowlist restrita de comandos de manutenção aprovados (C-05 Hardening)
        SAFE_COMMANDS_ALLOWLIST = {
            "git pull": "git pull",
            "git status": "git status",
            "git_pull": "git pull",
            "sync_git": "git pull",
        }
        cmd_key = (command or action).strip().lower()
        if cmd_key not in SAFE_COMMANDS_ALLOWLIST and action != "git_pull":
            logger.warning(f"[SECURITY] Tentativa de comando arbitrário bloqueada: {command}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Comando não autorizado. Apenas ações pré-aprovadas da allowlist são permitidas no host.",
            )
        resolved_cmd = SAFE_COMMANDS_ALLOWLIST.get(cmd_key, "git pull")
        result = execute_system_command(resolved_cmd)
        return {
            "success": True,
            "status": "ok",
            "action": "git_pull",
            "command": resolved_cmd,
            "result": result,
            "message": "Comando de sincronização executado com sucesso.",
        }

    raise HTTPException(status_code=400, detail=f"Ação desconhecida: {req.action}")
