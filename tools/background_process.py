"""Gerenciador de Processos em Segundo Plano para o Charlie Agent Runtime."""

from __future__ import annotations
import logging
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger("charlie.tools.background_process")

# Diretório padrão para logs de processos em background
LOGS_DIR = Path(os.getenv("TEMP", "/tmp")) / "charlie_process_logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

# Dicionário em memória de processos ativos
_ACTIVE_PROCESSES: Dict[str, Dict[str, Any]] = {}


def start_background_process(command: str, working_dir: Optional[str] = None, name: Optional[str] = None) -> str:
    """
    Inicia um processo ou serviço em segundo plano sem bloquear o assistente (ex: servidores web, testes longos).
    Redireciona stdout e stderr para arquivo de log dedicado.
    """
    cmd = command.strip()
    if not cmd:
        return "Erro: Comando não pode ser vazio."

    # Validação contra comandos perigosos e destrutivos
    from tools.system_control import validate_system_command
    is_valid, reason = validate_system_command(cmd)
    if not is_valid:
        logger.warning(f"[SEGURANÇA] Bloqueado processo em background potencialmente destrutivo: {cmd} ({reason})")
        return f"Segurança: O comando em segundo plano '{cmd}' foi bloqueado pelas políticas de proteção ({reason})."

    proc_id = f"proc_{uuid.uuid4().hex[:8]}"
    proc_name = name or (cmd[:30] + "..." if len(cmd) > 30 else cmd)
    log_file_path = LOGS_DIR / f"{proc_id}.log"

    cwd = working_dir if (working_dir and os.path.exists(working_dir)) else None

    # Flags do Windows para criação silenciosa sem console
    creation_flags = 0
    if sys.platform == "win32":
        creation_flags = 0x08000000 | 0x00000200  # CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP

    try:
        log_file = open(log_file_path, "w", encoding="utf-8", buffering=1)

        # Inicia processo desacoplado
        proc = subprocess.Popen(
            cmd,
            shell=True,
            cwd=cwd,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            creationflags=creation_flags,
        )

        _ACTIVE_PROCESSES[proc_id] = {
            "id": proc_id,
            "pid": proc.pid,
            "name": proc_name,
            "command": cmd,
            "cwd": cwd or str(Path.cwd()),
            "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "log_path": str(log_file_path),
            "popen": proc,
            "log_file": log_file,
        }

        # Dá 300ms para verificar se o processo não falhou imediatamente
        time.sleep(0.3)
        poll = proc.poll()
        if poll is not None:
            # Processo já encerrou
            try:
                log_file.flush()
                with open(log_file_path, "r", encoding="utf-8", errors="replace") as f:
                    output = f.read()
            except Exception:
                output = ""
            return f"Processo encerrou imediatamente com código {poll}. Log:\n{output[:1000]}"

        return (
            f"Processo em segundo plano iniciado com sucesso!\n"
            f"ID: {proc_id}\n"
            f"PID: {proc.pid}\n"
            f"Nome: {proc_name}\n"
            f"Log: {log_file_path}"
        )
    except Exception as e:
        logger.exception("Falha ao iniciar processo em background: %s", e)
        return f"Erro ao iniciar processo em background: {e}"


def get_background_process_logs(process_id: str, max_lines: int = 40) -> str:
    """Recupera as últimas linhas de log de um processo em segundo plano."""
    proc_info = _ACTIVE_PROCESSES.get(process_id)
    if not proc_info:
        log_file_path = LOGS_DIR / f"{process_id}.log"
        if not log_file_path.exists():
            return f"Processo com ID '{process_id}' não encontrado."
    else:
        log_file_path = Path(proc_info["log_path"])

    try:
        if not log_file_path.exists():
            return "Arquivo de log ainda não gerou saídas."

        with open(log_file_path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()

        tail = lines[-max_lines:] if len(lines) > max_lines else lines
        status = "Em execução"
        if proc_info:
            p = proc_info.get("popen")
            if p and p.poll() is not None:
                status = f"Finalizado (código {p.poll()})"

        return f"=== Logs de {process_id} [{status}] ===\n" + "".join(tail)
    except Exception as e:
        return f"Erro ao ler logs do processo: {e}"


def list_background_processes() -> str:
    """Lista todos os processos em segundo plano gerenciados pelo Charlie."""
    if not _ACTIVE_PROCESSES:
        return "Nenhum processo em segundo plano ativo no momento."

    lines = ["Processos em segundo plano:"]
    for pid, info in list(_ACTIVE_PROCESSES.items()):
        p = info.get("popen")
        alive = p.poll() is None if p else False
        status = "RODANDO" if alive else f"FINALIZADO (exit {p.poll()})"
        lines.append(f"- ID: {pid} | PID: {info['pid']} | {info['name']} | Status: {status}")

    return "\n".join(lines)


def kill_background_process(process_id: str) -> str:
    """Encerra um processo em segundo plano pelo seu ID."""
    proc_info = _ACTIVE_PROCESSES.get(process_id)
    if not proc_info:
        return f"Processo '{process_id}' não encontrado na lista de ativos."

    proc: subprocess.Popen = proc_info.get("popen")
    if not proc:
        return "Instância do processo não encontrada."

    if proc.poll() is not None:
        return f"O processo {process_id} já havia sido finalizado anteriormente."

    try:
        import psutil
        parent = psutil.Process(proc.pid)
        for child in parent.children(recursive=True):
            try:
                child.kill()
            except Exception:
                pass
        parent.kill()
    except Exception:
        proc.kill()

    # Fecha arquivo de log
    try:
        proc_info.get("log_file").close()
    except Exception:
        pass

    _ACTIVE_PROCESSES.pop(process_id, None)
    return f"Processo {process_id} (PID {proc.pid}) e seus subprocessos foram encerrados com sucesso."
