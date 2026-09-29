"""Rotas de inspeção e status das ferramentas do Charlie."""

from fastapi import APIRouter
from api.state import state
from tools.registry import ToolRegistry

router = APIRouter(prefix="/tools", tags=["Tools"])
_tools = ToolRegistry()


@router.get("")
async def list_tools():
    """Lista todas as ferramentas disponíveis no Charlie com seus schemas."""
    return {
        "total": len(_tools.list_tools()),
        "tools": _tools.get_schemas(),
    }


@router.get("/status")
async def tools_status():
    """Retorna se alguma ferramenta está em execução no momento e seus detalhes."""
    return {
        "is_executing": state.status == "executing_tool",
        "active_tool": state.active_tool,
        "active_args": state.active_tool_args,
        "current_process": state.current_process,
    }
