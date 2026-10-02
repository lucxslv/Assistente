from typing import Any, Dict
from pydantic import BaseModel
from fastapi import APIRouter, Depends
from api.state import state
from api.routes.auth import get_current_user
from tools.registry import ToolRegistry

router = APIRouter(prefix="/tools", tags=["Tools"])
_tools = ToolRegistry()


class ToolExecuteRequest(BaseModel):
    name: str
    arguments: Dict[str, Any] = {}


@router.get("")
async def list_tools():
    """Lista todas as ferramentas disponíveis no Charlie com seus schemas."""
    return {
        "total": len(_tools.list_tools()),
        "tools": _tools.get_schemas(),
    }


@router.post("/execute")
async def execute_tool(req: ToolExecuteRequest, user: dict = Depends(get_current_user)):
    """Executa uma ferramenta diretamente na máquina local com autenticação obrigatória."""
    result = await _tools.execute(req.name, req.arguments, prefer_remote=False)
    return {"status": "ok", "name": req.name, "result": result}


@router.get("/status")
async def tools_status():
    """Retorna se alguma ferramenta está em execução no momento e seus detalhes."""
    return {
        "is_executing": state.status == "executing_tool",
        "active_tool": state.active_tool,
        "active_args": state.active_tool_args,
        "current_process": state.current_process,
    }
