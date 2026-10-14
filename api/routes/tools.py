from typing import Any, Dict
from pydantic import BaseModel
from fastapi import APIRouter, Depends, Request
from api.state import state
from api.routes.auth import get_current_user, require_local_or_authenticated
from api.security.rate_limiter import rate_limiter, extract_client_ip, check_user_quota_and_status
from tools.registry import ToolRegistry

router = APIRouter(prefix="/tools", tags=["Tools"])
_tools = ToolRegistry()


class ToolExecuteRequest(BaseModel):
    name: str
    arguments: Dict[str, Any] = {}


@router.get("")
async def list_tools(user: dict = Depends(require_local_or_authenticated)):
    """Lista todas as ferramentas disponíveis no Charlie com seus schemas."""
    return {
        "total": len(_tools.list_tools()),
        "tools": _tools.get_schemas(),
    }


@router.post("/execute")
async def execute_tool(
    req: ToolExecuteRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Executa uma ferramenta diretamente na máquina local com autenticação obrigatória e rate limit."""
    uid = str(user["id"])
    client_ip = extract_client_ip(request)
    await check_user_quota_and_status(uid, user.get("email"))
    await rate_limiter.enforce(
        f"tools_exec:{uid}:{client_ip}",
        limit=30,
        window_seconds=60,
        detail="Muitas execuções de ferramentas em sequência. Aguarde alguns instantes.",
    )
    result = await _tools.execute(req.name, req.arguments, prefer_remote=False, user_id=uid)
    return {"status": "ok", "name": req.name, "result": result}


@router.get("/status")
async def tools_status(user: dict = Depends(require_local_or_authenticated)):
    """Retorna se alguma ferramenta está em execução no momento para o usuário atual."""
    uid = str(user.get("id")) if user and user.get("id") not in ("default", "local-loopback") else None
    s_dict = state.to_dict(user_id=uid)
    return {
        "is_executing": s_dict["status"] == "executing_tool",
        "active_tool": s_dict["active_tool"],
        "active_args": s_dict["active_tool_args"],
        "current_process": s_dict["current_process"],
    }
