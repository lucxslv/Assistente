"""Regressões do loop real de DEVICE tools entre Vercel e o host Tauri."""

import importlib
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from core.execution.contracts import ToolResult
from providers.base import ToolCall as ProviderToolCall


class _Chunk:
    def __init__(self, text=None, tool_calls=None):
        self.text = text
        self.tool_calls = tool_calls or []


class _Stream:
    def __init__(self, chunks):
        self._chunks = iter(chunks)

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return next(self._chunks)
        except StopIteration:
            raise StopAsyncIteration


@pytest.mark.asyncio
async def test_cloud_device_tool_reaches_transport_once_and_emits_single_start(monkeypatch):
    """O print com dois cards e nenhum resultado não pode voltar a acontecer."""
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("CHARLIE_RUNTIME_MODE", raising=False)
    import config as config_module
    importlib.reload(config_module)
    import core.pipeline as pipeline_module
    importlib.reload(pipeline_module)
    import core.execution.transport as transport_module

    transport = MagicMock()
    transport.execute = AsyncMock(return_value=ToolResult(
        call_id="call-create-folder",
        status="success",
        output="Pasta criada com sucesso",
        host_id="host-windows",
        duration_ms=12,
    ))
    monkeypatch.setattr(transport_module, "get_transport", lambda: transport)

    provider = MagicMock()
    calls = {"count": 0}

    def chat_stream(*args, **kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            return _Stream([_Chunk(tool_calls=[ProviderToolCall(
                id="call-create-folder",
                name="create_folder",
                arguments={"path": "Documentos/ClinicaOdontologica"},
            )])])
        return _Stream([_Chunk(text="Pasta criada. Agora vou gerar os arquivos da landing page.")])

    provider.chat_stream = chat_stream
    pipeline = pipeline_module.AssistantPipeline()
    pipeline.llm = provider
    pipeline._persist_turn_state = AsyncMock()

    events = []
    async for event in pipeline.run_pipeline_stream(
        "Crie a pasta da clínica",
        thread_id="thread-host-loop",
        user_id="user-real-123",
    ):
        events.append(event)

    starts = [event for event in events if event.type == "tool_start"]
    ends = [event for event in events if event.type == "tool_end"]
    assert transport.execute.await_count == 1
    assert transport.execute.await_args.args[1] == "user-real-123"
    assert len(starts) == 1
    assert len(ends) == 1
    assert ends[0].data["status"] == "success"
    assert ends[0].data["host_id"] == "host-windows"
    assert "turn_suspended" not in {event.type for event in events}
    assert calls["count"] == 2


def test_tauri_host_service_matches_live_backend_routes_and_capabilities():
    """O host não pode usar rotas antigas nem omitir tools que ele já executa."""
    root = Path(__file__).resolve().parents[1]
    source = (root / "desktop/src/services/hostService.ts").read_text(encoding="utf-8")

    for route in ("/host/heartbeat", "/host/pending-calls", "/host/tool-results"):
        assert route in source
    for removed_route in ("/api/host/register", "/api/host/claim", "/api/host/result"):
        assert removed_route not in source
    assert "payload.calls" in source
    assert '"create_folder"' in source
    assert '"replace_in_file"' in source


def test_device_heartbeat_reuses_the_host_capability_list():
    """Uma segunda lista manual não pode voltar a divergir do executor."""
    root = Path(__file__).resolve().parents[1]
    source = (root / "desktop/src/services/deviceHeartbeat.ts").read_text(encoding="utf-8")

    assert "HOST_CAPABILITIES" in source
    assert "capabilities: [...HOST_CAPABILITIES]" in source


def test_host_heartbeat_stays_inside_the_online_window():
    """Heartbeat no limite exato da janela faz o host oscilar para offline."""
    root = Path(__file__).resolve().parents[1]
    source = (root / "desktop/src/services/hostService.ts").read_text(encoding="utf-8")

    assert "const HEARTBEAT_INTERVAL_MS = 15000" in source
    assert "}, HEARTBEAT_INTERVAL_MS);" in source


@pytest.mark.asyncio
async def test_pending_claim_uses_postgres_valid_atomic_cte(monkeypatch):
    """O claim não pode conter RETURNING dentro do subselect."""
    import api.routes.host as host_module

    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=[])

    class Scope:
        async def __aenter__(self):
            return conn

        async def __aexit__(self, *args):
            return None

    pool = MagicMock()
    pool.acquire.return_value = Scope()
    monkeypatch.setattr(host_module, "get_or_init_db_pool", AsyncMock(return_value=pool))
    monkeypatch.setattr(host_module, "get_authorized_device_async", AsyncMock(return_value={"user_id": "user-1"}))

    result = await host_module.pending_calls(limit=10, authorization="Bearer token")

    assert result == {"calls": []}
    query = " ".join(conn.fetch.await_args.args[0].split())
    assert query.startswith("WITH pending AS (")
    assert "FOR UPDATE SKIP LOCKED ) UPDATE agent_tool_calls AS calls" in query
    assert "FOR UPDATE SKIP LOCKED RETURNING call_id" not in query


def test_device_heartbeat_waits_for_api_detection_before_registering():
    """O registro inicial não pode ficar preso ao backend local que está desligado."""
    root = Path(__file__).resolve().parents[1]
    source = (root / "desktop/src/services/deviceHeartbeat.ts").read_text(encoding="utf-8")

    assert "detectApiBase()" in source
    assert "apiBaseUrl: resolvedApiBase" in source
