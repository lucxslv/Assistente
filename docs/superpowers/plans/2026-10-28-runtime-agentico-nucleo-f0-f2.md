# Runtime Agêntico — Núcleo (F0–F2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar a execução agêntica do Charlie num runtime só com transporte de executor (local in-process × host remoto via fila Postgres), fechando o loop do chat inline nos dois modos de deploy, sem nenhuma resposta fabricada.

**Architecture:** `ExecutorTransport` é a única porta de saída para tools de escopo DEVICE: `LocalExecutor` (in-process via `ToolRegistry`) no modo device; `RemoteHostExecutor` (fila `agent_tool_calls` + polling do host) no modo cloud (Vercel não tem WS). O pipeline de chat para de encerrar turno ao despachar tool — o resultado volta como tool result e o modelo continua. Turnos cloud são retomáveis: estado persistido por `request_id`, re-attach via `ChatRequest.tool_results`.

**Tech Stack:** Python 3.12 + FastAPI + Pydantic v2 + asyncpg (uv); desktop Tauri 2 + React 19 + TypeScript; testes pytest (212+ existentes não podem quebrar); frontends verificados com `tsc && vite build`.

**Spec:** `docs/superpowers/specs/2026-10-27-runtime-agentico-design.md` (APROVADO) — §3.1–3.3, §3.6.1–3.6.2, §7 fases F0–F2, §8.1 respostas do dono. **Escopo deste plano: F0–F2. F3 (missões/cockpit) e F4 (limpeza) são o plano 2.**

## Global Constraints

- **Nenhuma resposta fabricada com status de sucesso, nunca** (spec §4 anti-metas). Sem executor → `status="unavailable"`, `error_type="host_offline"`.
- **Todo despacho devolve resultado ao loop** — fire-and-forget é bug (spec §4).
- **`user_id` em toda fila, host, resultado e sessão** — isolamento multi-tenant testado (spec §5).
- **Dois modos, um código:** `config.runtime_mode` é a ÚNICA fonte do modo; proibido fórmula `is_cloud` local (spec §3.5).
- **Nenhum caminho de execução novo:** tudo que executa tool de dispositivo passa por `ExecutorTransport` (spec §3.1); os caminhos 1–5 do spec §2.1 são substituídos, não adicionados.
- **Eventos SSE existentes não mudam de nome/shape:** `tool_start`, `tool_end`, `cancelled`, `done`, `error`, `token`, `status` (compat web-chat `web-chat/src/services/transport.ts` e desktop).
- **Testes:** `uv run pytest tests/` verde ao fim de cada task (baseline 212); DB em teste via `patch("api.db.get_or_init_db_pool")` + MockScope (padrão de `tests/test_canonical_identity.py`); API via TestClient (padrão de `tests/test_milestone1_security_auth.py`).
- **Arquivos UTF-8;** commits convencionais por task; **sem deploy do web-chat** sem autorização do dono.
- **Branch:** `feat/agentic-runtime`.

## Review Focus

1. **Host offline na nuvem** → tool DEVICE retorna `unavailable/host_offline` honesto pro modelo, sem fabricação e sem hang → testado em Task 6 (`test_execute_no_online_host_returns_unavailable`).
2. **Invocação serverless morre no meio de N tools** → retomada não re-executa calls já concluídas (idempotência por `call_id`) → Task 10 (`test_resume_skips_completed_call_ids`).
3. **Fila cross-tenant** → host só enxerga/resolve calls do próprio `user_id` → Tasks 5 e 6 (`test_pending_calls_scoped_to_token_user`, `test_resolve_result_of_other_user_rejected`).
4. **Dois hosts simultâneos** → claim atômico de calls (`FOR UPDATE SKIP LOCKED`), sem dupla execução → Task 5 (`test_two_hosts_claim_disjoint_calls`).
5. **Turno infinito de tools** → step budget corta com estado claro pro modelo → Task 8 (`test_step_budget_stops_loop`).

---

### Task 1: `runtime_mode` centralizado em `config.py`

**Files:**
- Modify: `config.py`
- Test: `tests/test_f0_runtime_mode.py`

**Interfaces:**
- Consumes: nada novo.
- Produces: `config.runtime_mode: str` (valor `"device"` ou `"cloud"`) e `config.max_agent_steps_per_turn: int = 15` — usados pelas Tasks 2, 6, 8.

- [ ] **Step 1: Write the failing tests** (`tests/test_f0_runtime_mode.py`)

```python
def test_runtime_mode_cloud_on_vercel(monkeypatch):
    monkeypatch.setenv("VERCEL", "1"); monkeypatch.delenv("CHARLIE_RUNTIME_MODE", raising=False)
    assert config.runtime_mode == "cloud"

def test_runtime_mode_explicit_env(monkeypatch):
    monkeypatch.delenv("VERCEL", raising=False); monkeypatch.setenv("CHARLIE_RUNTIME_MODE", "cloud")
    assert config.runtime_mode == "cloud"

def test_runtime_mode_device_default(monkeypatch):
    monkeypatch.delenv("VERCEL", raising=False); monkeypatch.setenv("CHARLIE_RUNTIME_MODE", "device")
    assert config.runtime_mode == "device"

def test_max_agent_steps_per_turn_default():
    assert config.max_agent_steps_per_turn == 15
```

- [ ] **Step 2: Run** `uv run pytest tests/test_f0_runtime_mode.py -v` → FAIL (`runtime_mode` não existe).
- [ ] **Step 3: Implement in `config.py`** — propriedade `runtime_mode`: `"cloud"` se `os.getenv("VERCEL")` OU `os.getenv("AWS_LAMBDA_FUNCTION_NAME")` OU `CHARLIE_RUNTIME_MODE == "cloud"` OU (`platform.system() != "Windows"` e `CHARLIE_ENV != "local_dev"`); senão `"device"` (mesma fórmula de `tools/registry.py:153-157`, agora num lugar só). Adicionar `max_agent_steps_per_turn: int = 15`.
- [ ] **Step 4: Run** → PASS. **Step 5:** `uv run pytest tests/ -q` → 212+ passando.
- [ ] **Step 6: Commit** `feat(config): runtime_mode centralizado + step budget por turno`

### Task 2: Fim dos resultados fabricados (registry, file_explorer, verifier)

**Files:**
- Modify: `tools/registry.py:147-216`, `tools/file_explorer.py:220-346`, `brain/agent/verifier.py:254-262`
- Test: `tests/test_f0_honest_states.py`

**Interfaces:**
- Consumes: `config.runtime_mode` (Task 1).
- Produces: contrato honesto no `ToolRegistry.execute_structured` — em modo cloud sem device conectado, tools DEVICE retornam `{"status": "unavailable", "error_type": "host_offline", ...}`; texto pro modelo: `"Sem executor disponível: nenhum host do usuário está conectado para executar '<tool>'."`. Tasks 3+ dependem desse shape honesto.

- [ ] **Step 1: Write the failing tests** — `test_execute_device_tool_cloud_without_host_is_honest` (cloud env; `execute_structured("list_directory", {...})` → `status=="unavailable"`, `error_type=="host_offline"`, `is_recoverable==False`); `test_no_fabricated_success_strings` (output NÃO contém "níveis ideais", "enviado para execução", "via Charlie Desktop"); `test_file_explorer_cloud_honest` (idem para `read_file` via `tools/file_explorer.py`); `test_local_mode_still_executes` (`CHARLIE_RUNTIME_MODE=device` executa tool CLOUD normalmente).
- [ ] **Step 2: Run** → FAIL (hoje retorna sucesso fabricado).
- [ ] **Step 3: Implement** — em `registry.py`: substituir o bloco `is_cloud` local por `config.runtime_mode`; DELETAR o dicionário de mensagens fabricadas (L179-216) e retornar o resultado honesto acima. Em `file_explorer.py`: os 5 blocos `is_cloud` → mesmo shape honesto (execução local preservada quando modo device). Em `verifier.py:254-262`: verificação que fabrica passa a registrar estado honesto sem inventar resultado.
- [ ] **Step 4: Run** → PASS. **Step 5:** `uv run pytest tests/ -q` verde (atenção aos testes que hoje expectam as strings fabricadas — atualizar a expectativa para o shape honesto, não manter a mentira).
- [ ] **Step 6: Commit** `feat(f0): estados honestos substituem resultados fabricados`

### Task 3: Contratos de execução + `LocalExecutor` + fábrica

**Files:**
- Create: `core/execution/__init__.py`, `core/execution/contracts.py`, `core/execution/transport.py`, `core/execution/local.py`
- Test: `tests/test_f1_contracts_local.py`

**Interfaces:**
- Consumes: `ToolRegistry.execute_structured` (existente).
- Produces (Tasks 6, 8, 10 dependem disto):

```python
# contracts.py
class ToolCallStatus(str, enum.Enum): QUEUED="queued"; DELIVERED="delivered"; RUNNING="running"; DONE="done"; FAILED="failed"; TIMEOUT="timeout"; UNAVAILABLE="unavailable"
class ToolCall(BaseModel): call_id: str; name: str; arguments: dict[str, Any] = {}
class ToolResult(BaseModel): call_id: str; status: str; output: str; friendly_name: str = ""; duration_ms: int = 0; error_type: str | None = None; is_recoverable: bool = False; host_id: str | None = None
class HostInfo(BaseModel): host_id: str; name: str; capabilities: list[str]; last_seen_at: float; online: bool

# transport.py
class ExecutorTransport(Protocol):
    def hosts_for(self, user_id: str) -> list[HostInfo]: ...
    async def execute(self, call: ToolCall, user_id: str, timeout: float = 15.0) -> ToolResult: ...
def get_transport() -> ExecutorTransport  # config.runtime_mode=="cloud" -> RemoteHostExecutor (Task 6); senão LocalExecutor

# local.py
class LocalExecutor:
    def __init__(self, registry: ToolRegistry) -> None  # default: o registry importado em tools.registry
```

- [ ] **Step 1: Write the failing tests** — `test_local_executor_wraps_registry` (FakeRegistry com `execute_structured` retornando dict conhecido → `ToolResult.status=="success"`, `output` idem); `test_local_executor_unknown_tool` → `status=="unavailable"`, `error_type=="not_found"`; `test_hosts_for_local` → um `HostInfo(host_id="local", online=True)` com `capabilities == registry.list_tools()`; `test_get_transport_device_mode` (`CHARLIE_RUNTIME_MODE=device` → instância de `LocalExecutor`). Nota: `get_transport` só retorna `RemoteHostExecutor` depois da Task 6; nesta task, modo cloud levanta `NotImplementedError("RemoteHostExecutor: Task 6")` e o teste do modo cloud é adicionado lá.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** os 4 arquivos (fábrica com lazy import). **Step 4: Run** → PASS. **Step 5:** suíte verde.
- [ ] **Step 6: Commit** `feat(core): pacote core/execution com contratos, LocalExecutor e get_transport`

### Task 4: Migração — tabelas `agent_hosts`, `agent_tool_calls`, `chat_turn_state`

**Files:**
- Create: `scripts/db/migrate_agent_runtime.py`
- Test: `tests/test_f1_migration.py`

**Interfaces:**
- Consumes: padrão de `scripts/db/migrate_milestone1_2.py` (async, `CREATE TABLE IF NOT EXISTS`, `pool.acquire`).
- Produces (Tasks 5, 6, 10 dependem): tabelas `agent_hosts(id PK, user_id, name, capabilities jsonb, telemetry jsonb, last_seen_at, created_at)`, `agent_tool_calls(call_id PK, user_id, host_id, tool, args jsonb, status, result jsonb, created_at, updated_at)`, `chat_turn_state(turn_id PK, user_id, thread_id, request_id, state jsonb, status, updated_at)`; índices `(agent_tool_calls.user_id, status)`, `(agent_hosts.user_id)`, `(chat_turn_state.request_id)`. Função: `async def up(pool) -> None`.

- [ ] **Step 1: Write the failing test** — `test_migration_creates_all_tables` (MockScope/`MockPool` capturando SQL: 3× `CREATE TABLE IF NOT EXISTS` + 3× `CREATE INDEX IF NOT EXISTS`); `test_migration_idempotent` (rodar `up()` duas vezes não lança).
- [ ] **Step 2: Run** → FAIL (script não existe). **Step 3: Implement** `scripts/db/migrate_agent_runtime.py` seguindo o padrão do milestone 1_2, com `up(pool)` e `main()` CLI. **Step 4: Run** → PASS. **Step 5:** suíte verde.
- [ ] **Step 6: Commit** `feat(db): migracao das tabelas do runtime agêntico`

### Task 5: Rotas do host — heartbeat autenticado, claim de calls e post de resultados

**Files:**
- Create: `api/routes/host.py`
- Modify: `api/main.py` (import + `app.include_router(host.router, prefix="/api")` junto de `api/main.py:86-97`)
- Test: `tests/test_f1_host_api.py`

**Interfaces:**
- Consumes: tabelas da Task 4; padrão de auth de `api/routes/device.py:534-554` (device token via `get_authorized_device_async` OU user via `verify_supabase_token` — reusar como helper `_resolve_caller` copiando o bloco).
- Produces (Tasks 6, 11 dependem):
  - `POST /api/host/heartbeat` — body `{host_id?: str, name: str, capabilities: list[str], telemetry?: dict}`; upsert em `agent_hosts` (`INSERT ... ON CONFLICT (id) DO UPDATE`), `last_seen_at=now()`; resposta `{host_id, server_time, poll_interval_ms: 2000}`.
  - `GET /api/host/pending-calls?limit=10` — claim atômico: `UPDATE agent_tool_calls SET status='delivered', host_id=$1 WHERE call_id IN (SELECT call_id FROM agent_tool_calls WHERE user_id=$2 AND status='queued' ORDER BY created_at LIMIT $3 FOR UPDATE SKIP LOCKED RETURNING call_id)`; resposta `{calls: [{call_id, tool, args}]}`.
  - `POST /api/host/tool-results` — body `{call_id, status, output, duration_ms?, error_type?}`; `UPDATE ... WHERE call_id=$1 AND user_id=$2`; se 0 linhas → 404.
  - Sem auth → 401 (Zero Trust, igual `device.py:534-539`).

- [ ] **Step 1: Write the failing tests** — `test_heartbeat_requires_auth` (401); `test_heartbeat_upserts_host` (MockPool: SQL contém `ON CONFLICT (id)`; user_id do token vai no VALUES); `test_pending_calls_scoped_to_token_user` (WHERE `user_id=$token_user`); `test_two_hosts_claim_disjoint_calls` (dois claims com SKIP LOCKED não retornam o mesmo `call_id` — simular com MockPool em filas separadas); `test_resolve_result_of_other_user_rejected` (404).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `api/routes/host.py` + wire em `api/main.py`. **Step 4: Run** → PASS. **Step 5:** suíte verde.
- [ ] **Step 6: Commit** `feat(api): rotas do host — heartbeat autenticado, claim atomico e resultados`

### Task 6: `RemoteHostExecutor` via fila Postgres

**Files:**
- Create: `core/execution/remote.py`
- Modify: `core/execution/transport.py` (fábrica passa a retornar `RemoteHostExecutor` no modo cloud)
- Test: `tests/test_f1_remote_transport.py`

**Interfaces:**
- Consumes: `ToolCall`/`ToolResult`/`HostInfo` (Task 3), tabelas + rotas de enfileiramento (Task 4/5 — o executor escreve direto na tabela via pool, não via rota), `api.db.get_or_init_db_pool`.
- Produces (Tasks 8, 10 dependem): `RemoteHostExecutor(pool_factory=get_or_init_db_pool)`; `hosts_for(user_id)` = hosts com `last_seen_at > now()-30s`; `execute(call, user_id, timeout=15.0)` — (1) sem pool → `ToolResult(status="unavailable", error_type="no_executor")`; (2) sem host online → `ToolResult(status="unavailable", error_type="host_offline")` SEM inserir call; (3) com host → `INSERT` status `queued` → poll da row a cada 0.25s até status terminal → mapeia para `ToolResult` (mantendo `call_id`, `host_id`); (4) timeout → `UPDATE` row `status='timeout'` + `ToolResult(status="timeout", error_type="host_timeout")`.

- [ ] **Step 1: Write the failing tests** — `test_execute_no_online_host_returns_unavailable` (MockPool: sem host fresco → `status=="unavailable"`, `error_type=="host_offline"`, nenhuma escrita de call); `test_execute_resolves_host_result` (MockPool que simula: INSERT ok → poll retorna row `done` com payload → `ToolResult.status=="success"`, `output` idem, `host_id` preenchido); `test_execute_timeout_marks_row` (timeout=0.1 → row atualizada para `timeout`, `ToolResult.status=="timeout"`); `test_get_transport_cloud_mode` (`CHARLIE_RUNTIME_MODE=cloud` → `RemoteHostExecutor`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `remote.py` (asyncio.sleep no poll; relógio real, timeouts curtos nos testes). **Step 4: Run** → PASS. **Step 5:** suíte verde.
- [ ] **Step 6: Commit** `feat(core): RemoteHostExecutor — despacho por fila com resultado honesto`

### Task 7: `/api/device/command` vira produtor da fila unificada

**Files:**
- Modify: `api/routes/device.py:572-610`
- Test: `tests/test_f1_device_adapter.py`

**Interfaces:**
- Consumes: tabela `agent_tool_calls` (Task 4); shape de resposta atual de `/command` (`{success, status:"queued", action, message, command_id}`) — não pode mudar (mobile depende).
- Produces: o caminho 4 do spec §2.1 deixa de ter fila própria: em modo cloud, `/command` insere em `agent_tool_calls` (mapear `action/params` → `tool/args`; p.ex. `screenshot`→`take_screenshot`, `open`→`open_path_or_app`, `command`→`execute_command`); fallback in-memory `_pending_commands` SOMENTE quando pool indisponível.

- [ ] **Step 1: Write the failing tests** — `test_command_cloud_enqueues_unified_queue` (cloud env + MockPool: SQL contém `INSERT INTO agent_tool_calls`; resposta mantém `status=="queued"` e `command_id`); `test_command_local_unchanged` (device mode: executa via helpers Windows como hoje).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** o adapter. **Step 4: Run** → PASS. **Step 5:** suíte verde.
- [ ] **Step 6: Commit** `feat(api): /device/command enfileira na fila unificada (adaptador mobile)`

### Task 8: Loop fechado no pipeline — transporte, step budget e fim do fire-and-forget

**Files:**
- Modify: `core/pipeline.py:100-130` (usar `config.runtime_mode`), `core/pipeline.py:498-596` (substituir o ramo de despacho), `config.py` (nada novo — usa Task 1)
- Test: `tests/test_f2_closed_loop.py`

**Interfaces:**
- Consumes: `get_transport()` + `ToolCall`/`ToolResult` (Task 3/6), `config.max_agent_steps_per_turn`.
- Produces: pipeline com UMA via de execução para tools DEVICE (`get_transport().execute(...)` — Local no device mode, Remote no cloud); resultado → `req_memory.add_tool_result(...)` (L578, existente) e o modelo segue o loop; `client_tool_request` (L528-551) REMOVIDO; contador de passos: cada iteração com tool_calls incrementa; ao atingir `max_agent_steps_per_turn`, o pipeline injeta tool result sintético `"Limite de passos do turno atingido (N). Conclua com o que já tem."` e não chama mais tools; eventos `tool_start`/`tool_end` mantêm nomes e ganham `host_id` no `tool_end`.

- [ ] **Step 1: Write the failing tests** (`tests/test_f2_closed_loop.py`, com FakeProvider seguindo a interface usada em `providers/gemini.py` — mesmo truque de `tests/test_milestone2_chat_reliability.py`; transport injetado via monkeypatch de `core.execution.transport.get_transport`):
  - `test_device_tool_result_feeds_model_and_continues` (cloud mode; FakeProvider: 1ª resposta com tool_call `list_directory`, 2ª resposta final "ok"; FakeTransport devolve `output="PASTA_OK"` → pipeline emite `tool_start`+`tool_end` e a 2ª chamada ao provider contém o tool result "PASTA_OK"; NÃO emite `client_tool_request`).
  - `test_host_offline_result_flows_to_model` (FakeTransport retorna `unavailable/host_offline` → modelo recebe como tool result; sem exceção).
  - `test_step_budget_stops_loop` (FakeProvider sempre devolve tool_calls; budget=3 no config fake → no máximo 3 execuções; resposta final contém menção ao limite).
  - `test_device_mode_executes_in_process` (device mode + tool CLOUD scope roda via LocalExecutor→registry como hoje).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** no pipeline: remover o bloco de coleta `client_tools_to_exec` + early return; no lugar, despacho por transporte com timeout por tool (15s), contadores de step, e tool_end com `host_id`. **Step 4: Run** → PASS. **Step 5:** suíte verde (testes antigos de `client_tool_request` são REMOVIDOS/atualizados — o caminho morreu de propósito).
- [ ] **Step 6: Commit** `feat(pipeline): loop agêntico fechado com ExecutorTransport e step budget`

### Task 9: Remoção do `RouteMode.AGENTIC` (sequestro de turno)

**Files:**
- Modify: `brain/router/router.py:60-96`, `core/pipeline.py:243-305`
- Test: `tests/test_f2_no_agent_hijack.py`

**Interfaces:**
- Consumes: decisão do dono (spec §8.1-2): chat não spawna missão no v1.
- Produces: nenhum turno de chat desvia mais para `agent_runtime`; keywords ("modo agente", "execute o plano"...) viram chat normal. `RouteMode.AGENTIC` deixa de ser retornado pelo router.

- [ ] **Step 1: Write the failing tests** — `test_router_no_agentic_on_keywords` (`router.route("modo agente, organize meus arquivos")` retorna modo ≠ AGENTIC); `test_pipeline_never_calls_agent_runtime` (texto com keyword → pipeline não chama `brain.agent.runtime.agent_runtime.start_session` — mock com assert_not_called).
- [ ] **Step 2: Run** → FAIL (hoje sequestra). **Step 3: Implement** — remover triggers e o ramo do pipeline (L243-305); suíte antiga que testava o modo AGENTIC é atualizada para a nova realidade. **Step 4: Run** → PASS. **Step 5:** suíte verde.
- [ ] **Step 6: Commit** `feat(pipeline): remocao do sequestro AGENTIC de turno — chat sempre inline`

### Task 10: Turno retomável (modo cloud)

**Files:**
- Create: `core/execution/turn_store.py`
- Modify: `core/pipeline.py` (persistir/retomar), `api/routes/chat.py` (passar `request_id` ao pipeline — já existe no ChatRequest do milestone 2)
- Test: `tests/test_f2_resumable_turn.py`

**Interfaces:**
- Consumes: `chat_turn_state` (Task 4); `ChatRequest.request_id` + `tool_results` (existente, `api/routes/chat.py:61`).
- Produces (o plano 2 reusa): 
```python
async def save_turn_state(pool, turn_id: str, user_id: str, thread_id: str, request_id: str, state: dict) -> None   # upsert chat_turn_state
async def load_open_turn(pool, request_id: str) -> dict | None                                                      # state dict ou None
async def close_turn(pool, turn_id: str, status: str = "completed") -> None
```
Pipeline (cloud mode): antes de cada despacho remoto, `save_turn_state(..., state={"messages": req_memory.get_messages(), "completed_call_ids": [...], "step": n})`; ao iniciar turno com `load_open_turn(request_id)` não-None, restaura mensagens e marca `completed_call_ids` como já-respondidos (não re-despacha); ao concluir/cancelar → `close_turn`. Fallback: se pool indisponível, segue sem persistência (turno normal, sem crash).

- [ ] **Step 1: Write the failing tests** — `test_save_and_load_roundtrip` (MockPool; `save_turn_state` → `load_open_turn` devolve o mesmo dict); `test_resume_skips_completed_call_ids` (state com `completed_call_ids=["c1"]`; pipeline retomado recebe tool result de `c1` do estado e NÃO chama o transport para `c1` — FakeTransport com assert); `test_close_turn_sets_status`; `test_resume_without_pool_does_not_crash` (pool=None → pipeline roda turno normal).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `turn_store.py` + integração no pipeline. **Step 4: Run** → PASS. **Step 5:** suíte verde.
- [ ] **Step 6: Commit** `feat(pipeline): turno cloud retomavel por request_id sem re-execucao`

### Task 11: Desktop — Host Service autenticado + cards de tool no chat

**Files:**
- Create: `desktop/src/services/hostService.ts`
- Modify: `desktop/src/services/deviceHeartbeat.ts` (remove URL hardcoded sem auth; vira consumidor do hostService), `desktop/src/services/api.ts` (remove o handler `client_tool_request`; mantém `tool_start/tool_end` no parser), `desktop/src/components/ChatArea.tsx` (cards de tool com `host_id`)
- Verify: `npm --prefix desktop run build` (repo sem runner TS — o build `tsc && vite build` é o gate, igual aos milestones anteriores)

**Interfaces:**
- Consumes: rotas da Task 5 (`POST /api/host/heartbeat`, `GET /api/host/pending-calls`, `POST /api/host/tool-results`); `executeDeviceTool` de `desktop/src/services/deviceExecutor.ts` (existente); token de device pareado (como `api.ts` obtém hoje).
- Produces: `startHostService(opts: {apiBase: string; token: string; name?: string}): void` e `stopHostService(): void`; `capabilities` fixas = nomes das tools que os 13 comandos Rust cobrem (`create_folder`, `list_directory`, `read_file`, `write_file`, `execute_command`, `take_screenshot`, `open_path_or_app`, `set_system_volume`, `toggle_mute`, `media_play_pause`, `media_next`, `media_prev`, `lock_workstation`, `minimize_all`, `get_process_list`) + família `background_process` (start/get_logs/list/kill) e `manage_application` (apenas action `open`); `press_key`/`type_text` FORA (capacidade declarada — `unavailable` no v1).

- [ ] **Step 1: Implement** `hostService.ts`: heartbeat autenticado a cada 10s (Authorization: Bearer do token de device), polling de pending-calls (intervalo `poll_interval_ms` da resposta), execução via `executeDeviceTool` com mapeamento `tool→comando Rust`, POST de resultado com o shape da Task 5.
- [ ] **Step 2: Refatorar** `deviceHeartbeat.ts` para usar o hostService (telemetria vira campo do heartbeat; nenhuma URL sem auth sobra).
- [ ] **Step 3: Remover** o caminho `client_tool_request` em `api.ts`; ChatArea renderiza `tool_start`/`tool_end` (com `host_id`) em cards — paridade de informação com o parser do web-chat (`web-chat/src/services/transport.ts`).
- [ ] **Step 4: Verify** — `npm --prefix desktop run build` → 0 erros TS; `npm --prefix web-chat run build` → 0 erros (garantia de que nada quebrou compat).
- [ ] **Step 5: Commit** `feat(desktop): host service autenticado e cards de tool no chat`

### Task 12: Suíte integral nos dois modos + fechamento da fase

**Files:**
- Test: `tests/test_f2_e2e_modes.py`
- Verify: suíte completa + builds

**Interfaces:**
- Consumes: tudo (Tasks 1–11).
- Produces: prova de que os DOIS modos fecham o loop — gate de saída da fase F0–F2.

- [ ] **Step 1: Write the tests** — `test_e2e_device_mode_turn_with_tool` (device mode: turno completo com tool CLOUD via LocalExecutor, eventos `tool_start/tool_end/done`, `status` final `completed`); `test_e2e_cloud_mode_offline_host_honest` (cloud mode + sem host: turno termina com o modelo INFORMANDO host offline — reply final menciona indisponibilidade, nunca "sucesso"); `test_sse_event_names_unchanged` (eventos emitidos ∈ {status, token, tool_start, tool_end, thought, cancelled, done, error}).
- [ ] **Step 2: Run** `uv run pytest tests/test_f2_e2e_modes.py -v` → PASS.
- [ ] **Step 3: Verify total** — `uv run pytest tests/ -q` (212+ verdes, 0 fail); `npm --prefix desktop run build` e `npm --prefix web-chat run build` → 0 erros.
- [ ] **Step 4: Commit** `test(f2): e2e dos dois modos — loop fechado, estados honestos, eventos estaveis`

---

## Notas de execução

- Ordem estrita: 1→2→3→4→5→6→7→8→9→10→11→12 (8 depende de 3+6; 10 e 11 podem rodar em paralelo DEPOIS de 8; 12 fecha).
- **Fora do escopo desta fase (registrado de propósito):** (1) o `device_broker`/WS permanece vivo mas sem novo uso no chat — o `LocalExecutor` cobre o modo device in-process; remoção formal no plano 2 (F4). (2) O parâmetro `prefer_remote` e o despacho broker em `registry.py:150-176` permanecem funcionais nesta fase (o runtime de missões legado os usa); o chat para de usá-los na Task 8 e a remoção definitiva vem no plano 2. (3) Atalhos de identidade legados (`default`/`lucas-local` no broker e queries) são removidos no plano 2 — o código NOVO desta fase já exige identidade autenticada (Task 5).
- Ao fim: `docs/MISSION_STATE.md` é atualizado com o estado da fase (convenção do repo), e F3–F4 viram o **plano 2** (missões multi-tenant + cockpit + limpeza) partindo deste.
