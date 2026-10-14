"""Testes Automatizados do Milestone 4 — Ferramentas, Contratos de Resultado, Cards Dinâmicos e LLMRouter."""

import asyncio
import time
from core.pipeline import AssistantPipeline
from providers.base import StreamChunk, ToolCall
from providers.gemini import GeminiProvider
from brain.router.router import LLMRouter, RouteMode
from tools.registry import ToolRegistry


def test_tool_registry_friendly_names_and_structured_contract():
    """Valida nomes amigáveis e contrato estruturado (success, timeout, blocked, invalid_arguments)."""
    reg = ToolRegistry()

    assert reg.get_friendly_name("search_web") == "Pesquisando na Web"
    assert reg.get_friendly_name("get_weather") == "Consultando previsão do tempo"

    # 1. Tool síncrona rápida rodando via asyncio.to_thread sem bloquear event loop
    def sync_fast_tool(x: int = 2) -> str:
        return f"resultado={x * 3}"

    reg.register("sync_fast_tool", sync_fast_tool, "Tool síncrona de teste")
    res_ok = asyncio.run(reg.execute_structured("sync_fast_tool", {"x": 7}))
    assert res_ok["status"] == "success"
    assert res_ok["output"] == "resultado=21"
    assert res_ok["error_type"] is None
    assert res_ok["is_recoverable"] is False

    # 2. Tool síncrona lenta deve sofrer timeout sem congelar o event loop
    def sync_slow_tool() -> str:
        time.sleep(1.5)
        return "demorou"

    reg.register("sync_slow_tool", sync_slow_tool, "Tool lenta de teste")
    res_timeout = asyncio.run(reg.execute_structured("sync_slow_tool", {}, timeout=0.15))
    assert res_timeout["status"] == "timeout"
    assert res_timeout["error_type"] == "timeout"
    assert res_timeout["is_recoverable"] is True

    # 3. Bloqueio de comando destrutivo no sandbox
    res_blocked = asyncio.run(
        reg.execute_structured("execute_command", {"command": "Remove-Item -Recurse -Force C:\\Windows"})
    )
    assert res_blocked["status"] == "blocked"
    assert res_blocked["error_type"] == "security_blocked"
    assert res_blocked["is_recoverable"] is False


def test_router_valid_model_names_and_fallback_chain():
    """Garante que o LLMRouter usa nomes de modelos reais e gera cadeia de fallback ordenada."""
    r = LLMRouter()
    assert r.FAST_GEMINI_MODEL == "gemini-2.5-flash-lite"
    assert r.REASONING_GEMINI_MODEL == "gemini-2.5-flash"
    assert r.REASONING_GROQ_MODEL == "llama-3.3-70b-versatile"

    dec_fast = r.route("Oi, tudo bem?", preferred_provider="gemini")
    assert dec_fast.mode == RouteMode.FAST
    assert dec_fast.model_name == "gemini-2.5-flash-lite"

    dec_reasoning = r.route("Explique detalhadamente a arquitetura de um compilador passo a passo", preferred_provider="gemini")
    assert dec_reasoning.mode == RouteMode.REASONING
    assert dec_reasoning.model_name == "gemini-2.5-flash"

    chain = r.get_fallback_chain(dec_reasoning)
    assert len(chain) >= 1
    assert ("gemini", "gemini-2.5-flash-lite") in chain


def test_gemini_provider_alias_resolution():
    """Garante que aliases antigos ou inexistentes são resolvidos para modelos Gemini válidos."""
    models = GeminiProvider._resolve_models_to_try("gemini-3.8-flash")
    assert models[0] == "gemini-2.5-flash"
    assert "gemini-2.5-flash-lite" in models

    models_lite = GeminiProvider._resolve_models_to_try("gemini-3.5-flash-lite")
    assert models_lite[0] == "gemini-2.5-flash-lite"


def test_pipeline_stream_fallback_and_structured_tool_events():
    """Verifica fallback automático no pipeline e emissão de eventos tool_start/tool_end com friendly_name e status."""
    pipeline = AssistantPipeline(init_audio=False)

    calls_made = []

    async def fake_stream(system_prompt, messages, tools=None, model_override=None, cancel_event=None):
        calls_made.append(model_override)
        if len(calls_made) == 1:
            raise RuntimeError("Simulated 503 Service Unavailable on primary model")
        if len(calls_made) == 2:
            yield StreamChunk(
                tool_calls=[ToolCall(id="call_dt_1", name="get_datetime", arguments={})],
                is_done=True,
            )
            return
        yield StreamChunk(text="A hora foi consultada com sucesso.", is_done=False)
        yield StreamChunk(is_done=True)

    pipeline.llm.chat_stream = fake_stream

    async def _collect():
        evs = []
        async for ev in pipeline.run_pipeline_stream("Que horas são agora?", thread_id="thr-m4", user_id="user-m4"):
            evs.append(ev)
        return evs

    events = asyncio.run(_collect())
    assert pipeline.last_fallback_used is True
    assert len(calls_made) >= 3

    tool_starts = [e for e in events if e.type == "tool_start"]
    tool_ends = [e for e in events if e.type == "tool_end"]
    assert len(tool_starts) == 1
    assert tool_starts[0].data["friendly_name"] == "Consultando data e hora"
    assert len(tool_ends) == 1
    assert tool_ends[0].data["friendly_name"] == "Consultando data e hora"
    assert tool_ends[0].data["status"] == "success"
