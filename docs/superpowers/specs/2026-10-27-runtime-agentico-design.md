# Design — Runtime Agêntico Unificado (Charlie AI)

**Data:** 2026-10-27 (rev. 2026-10-28 pós builder-check) · **Branch:** `feat/agentic-runtime` · **Status:** APROVADO pelo dono (2026-10-28) — pronto para o plano de implementação

**Decisões de produto (donas: Lucas, já fechadas em conversa):**
1. **Chat com agência inline** — tools executam dentro da conversa comum, com resultados renderizados em cards; tarefas de múltiplos passos acontecem ali mesmo.
2. **Aba Agente = cockpit de missões longas/autônomas** — timeline do grafo de tarefas, permissões pendentes, terminais reais, artefatos e evidências.
3. **Abordagem A1** — runtime agêntico único com "transporte" de executor (opções A2/A3 descartadas, ver §6).
4. **Padrões inspirados no Hermes Agent** (MIT, `NousResearch/hermes-agent`), **reimplementados no código do Charlie** — sem dependência de runtime externo.
5. Ordem de trabalho: **runtime primeiro, redesign da aba depois** (a aba só pode mostrar o que o runtime expõe).

---

## 1. Intenção e porquê

O Charlie não consegue **agir**. Sintomas relatados pelo dono e confirmados em código:

1. **"Executa na máquina errada"** — com backend na Vercel, tools de sistema agem (ou fingem agir) no contêiner da nuvem, não no PC do usuário nem nas máquinas remotas.
2. **"Não consegue nem tarefas simples"** — o loop de chat encerra o turno ao despachar uma tool de dispositivo; o resultado nunca volta ao modelo, então ele não pode encadear passos.
3. **"Se confunde com a própria hospedagem"** — fallbacks fabricam resultados de sucesso (inclusive inventando saúde do "PC do usuário"), e o modelo raciocina sobre mentiras.
4. **"Instável até na minha máquina"** — cinco caminhos de execução divergentes, quatro deles apenas parciais.
5. **"Aba Agente disfuncional"** — dupla execução, permissão que trava a missão, sessão fantasma, dead code, UI teatral.

O objetivo deste projeto é **unificar a execução agêntica do Charlie em um runtime só, honesto e multi-host**, fechando o loop de raciocínio (plan → tool → resultado → próximo passo) nos dois modos de deploy (API local no Windows e API na nuvem/Vercel), e reconstruir a aba Agente como cockpit real em cima disso.

---

## 2. Diagnóstico fiel (estado atual, com file:line)

### 2.1 Backend — caminhos de execução fragmentados

| # | Caminho | Onde | Problema |
|---|---------|------|----------|
| 1 | Helpers Windows diretos nas rotas da API | `api/routes/device.py:35-110` (`_capture_windows_screen_base64`, `_open_target_windows`, `_press_windows_key`), ramo "execução nativa" em `device.py:612-709` | Só funciona quando a API roda no Windows local (`run_desktop.bat`, porta 8005). Na Vercel, não roda. |
| 2 | `client_tool_request` via SSE | `core/pipeline.py:528-551` | **Fire-and-forget dominante do chat**: emite evento pro cliente conectado, responde "Comando enviado..." e **encerra o turno**. O resultado nunca volta ao modelo. Se o desktop não estiver ouvindo, o comando evapora. |
| 3 | `device_broker` via WebSocket | `brain/broker/device_broker.py` (dispatch com Future + timeout, registro em `api/routes/chat.py:715-775`) | O único caminho que espera resultado — mas é **in-memory** (singleton, morre a cada restart/cold start) e a Vercel **não suporta WebSocket**, então no modo nuvem nunca funcionou de verdade. |
| 4 | Fila Postgres de comandos | `api/routes/device.py:572-610` → `device_pending_commands` | Caminho do controle remoto do mobile, **separado do chat**. Hoje é o único canal WAN que funciona (o desktop faz polling via heartbeat). |
| 5 | `RouteMode.AGENTIC` (sequestro de turno) | `brain/router/router.py:60-96` (classificação por keywords: "execute o plano", "modo agente"...) + `core/pipeline.py:243-305` | Desvia o TURNO inteiro do chat para o `agent_runtime` singleton e streama eventos do DAG por até **600s** — o sequestro de conversa em outra forma. Removido no v1 (decisão do dono, §8.1-Q2). |

Além dos cinco: o chat no **modo local** executa tools DEVICE direto no processo da API (caminho 1 disfarçado), e a **aba Agente** executa tudo no próprio desktop via `deviceExecutor.ts`, sem devolver resultado ao backend (ver §2.5). São, na prática, **sete produtores de execução**.

### 2.2 O fallback que mente

`tools/registry.py:179-216`: quando está na nuvem sem device conectado, o registry **fabrica resultado com `status: "success"`**. Exemplo — `get_system_status` retorna texto hardcoded: *"Sistema: Microsoft Windows 11 x64 (...) CPU, memória e disco em níveis ideais"*. O modelo recebe mentira com cara de sucesso e segue raciocinando. A mesma doença se repete em `tools/file_explorer.py:220-346` (5 blocos `is_cloud`) e `brain/agent/verifier.py:258-259`.

### 2.3 `brain/agent/` — um runtime adormecido

Já existe um runtime agêntico quase completo (3.609 linhas), **parcialmente conectado às tools** — já usa o `ToolRegistry` (`runtime.py:32`, `runtime.py:333`), porém sem `user_id`/`prefer_remote` (nunca despacha pro host) — e **desconectado do chat**:
- `planner.py` (779) — `parse_goal`/`create_plan` → `TaskGraph`;
- `task_graph.py` (303) — DAG com dependências, retry, subtasks, validação acíclica, evidências, progresso;
- `runtime.py` (507) — `start_session` → `_execution_loop` → `_execute_task`, pause/resume/cancel, event stream SSE;
- `governance.py` (252) — permission gate com pending/resolve;
- `verifier.py`, `reflector.py`, `working_memory.py`, `experience_memory.py`, `failure_memory.py`, `multi_agent.py`.

Defeitos: `agent_runtime` é **singleton global com UM grafo ativo** (sem escopo por usuário — `api/routes/agent.py:47-58`), persistência em **SQLite local** (`persistence.py:17` já detecta Vercel e desiste), e nenhum vínculo com o pipeline de chat.

### 2.4 Modo de execução espalhado

`is_cloud` é recalculado em 7+ lugares com fórmulas diferentes: `tools/registry.py:153-157`, `core/pipeline.py:113-116`, `api/routes/device.py:483,573`, `tools/file_explorer.py` (×5), `tools/system_control.py:174`, `brain/context/manager.py:86`, `brain/agent/verifier.py:258`, `api/routes/auth.py:310,445,772`. Alguns checam só `VERCEL`, outros somam `AWS_LAMBDA`, `CHARLIE_RUNTIME_MODE`, plataforma ou writability. Modo inconsistente = comportamento inconsistente.

### 2.5 Desktop (recon dedicado)

- **`agentRuntimeStore.ts` (1.702 linhas)** — singleton global mutável que concentra a ÚNICA sessão, permissões, logs, eventos e todas as coleções do workspace. Persiste em localStorage; **cada `notify()` grava no localStorage E dispara `POST /agent/sessions` inteiro, sem debounce** (`agentRuntimeStore.ts:58-70` + `agentHistoryStore.ts:80`).
- **Dupla execução na aba Agente** — cada mensagem dispara o chat (`/chat/stream`) **e** o loop autônomo local em paralelo (`AgentEnvironment.tsx:184`, L628), passando `session.id` como `thread_id` do chat.
- **Sessão fantasma (o sequestro histórico ainda vivo)** — `App.tsx:526-544` chama `recordFile` em todo `tool_start` de chat comum com `args.path`; `agentRuntimeStore.ts:1470-1473` auto-cria sessão de agente se não houver uma.
- **Permissão trava a missão** — tarefa vai a `waiting_permission` (`agentRuntimeStore.ts:790-809`), mas `resolvePermission` nunca a reativa (o loop só seleciona pending/running, L730).
- **Dois Permission Engines sem integração** — engine local do store (`L1332-1374`) × `permission_gate` do backend (`agent.py:159-175`); os endpoints `/agent/permissions/*` **não são consumidos** pelo desktop.
- **Execução local real existe e funciona**: `deviceExecutor.ts:91-224` invoca 13 comandos Tauri/Rust espelhados em `src-tauri/src/lib.rs:95-539` e `src-tauri/src/system.rs:188-379` (arquivos, `execute_system_command`, screenshot, volume, mídia, lock, processos). Resultados do loop **não voltam ao backend** — ficam no store/localStorage.
- **Heartbeat WAN** — `deviceHeartbeat.ts` posta telemetria a cada 4s **só pra URL da Vercel hardcoded, sem headers de auth** (L36-38, L102-107); a resposta traz `pending_commands` que o desktop executa localmente (L40-69) — na prática, o canal WAN que funciona hoje.
- **Dead code / UI teatral** — `AgentCommandCenter.tsx` (520 linhas, zero imports), `WorkspaceSubagents/BackgroundTasks/UploadsMedia` sem importador; subagentes Planner/Executor/Verifier/Reviewer são objetos estáticos que "atuam"; PIDs exibidos são inventados (`AgentSidePanel.tsx:782,958`); plano local por regex com conclusões pré-escritas (`agentRuntimeStore.ts:193-537`, ex.: L336-338).
- **Duplicações** — dois parsers SSE (`api.ts:576-632` × `agentRuntimeStore.ts:1143-1171`), dois CodeBlocks, badges triplicados, transporte inconsistente (`/agent/*` com fetch cru sem fallback × histórico com `apiFetch`).

### 2.6 Gaps de ferramenta no host (levantados na revisão)

O escopo `ToolScope.DEVICE` inclui tools **sem contraparte Rust** no desktop: `press_key`/`type_text` (`tools/automation.py`), `play_music`/`pause_music`/`resume_music`/`stop_music` (`media_player.py`), `manage_application` action `close`, e toda a família `background_process` (`tools/background_process.py` — `Popen` no processo da API, PIDs reais em memória; na nuvem isso executa no contêiner errado). Não há PTY/automação de teclado no `src-tauri` hoje. O escopo v1 do host é pergunta aberta (§8.1-Q4).

---

## 3. Alvo de arquitetura (A1)

```
┌──────────────┐  SSE/WS    ┌────────────────────────────┐        ┌────────────────┐
│   Clientes    │◄─────────►│  CÉREBRO — Charlie Brain    │◄──────►│   Supabase      │
│ desktop/web-  │           │  (FastAPI, api/ + core/)    │  SQL   │   (Postgres)    │
│ chat/mobile   │           │                             │        └───────▲────────┘
└──────────────┘           │  ┌───────────────────────┐  │                │
                            │  │ Loop agêntico único   │  │        fila de tool calls
                            │  │ (chat inline + missões)│  │        + heartbeats
                            │  └──────────┬────────────┘  │                │
                            │    ExecutorTransport          │                │
                            │  ┌─────────┴──────────┐     │        ┌───────┴────────┐
                            │  │ Local (in-process)  │     │        │  Charlie Hosts   │
                            │  │ (API no Windows)     │     │        │ desktop · VMs... │
                            │  └─────────────────────┘     │        │  (executor real)  │
                            └────────────────────────────┘        └──────────────────┘
```

### 3.1 ExecutorTransport — uma interface, dois transportes

```python
class ToolResult(StructuredResult): ...   # status, output, duration_ms, error_type, is_recoverable + host_id

class ExecutorTransport(Protocol):
    def hosts_for(self, user_id: str) -> list[HostInfo]          # capacidade + status por host
    async def execute(self, call: ToolCall, user_id: str) -> ToolResult
```

- **LocalExecutor** — usado quando `runtime_mode == "device"`: executa in-process via `ToolRegistry` (o que hoje o caminho 1 faz de forma espalhada, agora com o MESMO contrato). Mantém o Windows-helper de `tools/` como implementação, mas o executor é o mesmo ponto de entrada.
- **RemoteHostExecutor** — usado quando `runtime_mode == "cloud"`: despacha para um **Charlie Host** e aguarda o resultado. Dois mecanismos, mesma interface:
  - **WS broker** (evolução do `device_broker`) — quando há conexão ativa (modo local em rede, ou servidor persistente futuro);
  - **Fila Postgres + polling** (evolução de `device_pending_commands` → `agent_tool_calls`) — o transporte que funciona na Vercel (serverless sem WS). O host faz long-polling curto; o resultado volta pela fila e resolve a chamada.

**Sempre que não houver host apto, o resultado é honesto**: `status: "unavailable", error_type: "host_offline"` — o modelo sabe e decide (avisar, sugerir ligar o host, tentar outra rota). **Nenhuma resposta fabricada, nunca** (anti-meta §4).

### 3.2 Protocolo Charlie Host

- Cada host (desktop, VM pareada, máquina futura) registra: `host_id`, `user_id`, nome, **capacidades** (lista de tools que sabe executar), heartbeat. Tabela `agent_hosts` no Postgres.
- Execução assíncrona com contrato único: `agent_tool_calls` (call_id, host_id, tool, args, status queued/delivered/running/done/failed/timeout/unavailable, result, timestamps). Todos os produtores (chat, missões, mobile) usam **a mesma fila**.
- V1 entrega **um** host oficial: o **desktop Tauri**, substituindo o papel de `deviceExecutor.ts` por um "host service" formal (mesmos comandos Rust). O pareamento de **outras máquinas** reusa o fluxo existente de `pair.py` + auth de device — novos hosts plugam no mesmo protocolo.
- Heartbeat unificado e **autenticado** (o heartbeat atual manda telemetria pra URL hardcoded sem auth — vira bug de segurança na refatoração).
- Resolvido na revisão: auth do host **reusa os tokens de device existentes** (`verify_supabase_token` já os valida — `api/routes/auth.py:272-279` + `pair.py`); a fila evolui `device_pending_commands` sobre o pool asyncpg existente (`api/db.py`); o mobile segue funcionando via adaptador em `/device/command`.

### 3.3 Loop fechado — chat inline

- `core/pipeline.py` remove o ramo fire-and-forget (L528-551): tool DEVICE no modo cloud passa pelo `ExecutorTransport`; o resultado volta como **tool result do turno** (já existe `req_memory.add_tool_result`, L578) e **o modelo continua** — com **limite de passos por turno** (padrão ~15, configurável) e cancelamento cooperativo já existente.
- No modo device, o mesmo caminho via `LocalExecutor` — **um loop, dois transportes, zero código especial por modo**.
- **Gancho de retomabilidade já existe**: `ChatRequest.tool_results` (`api/routes/chat.py:61` + `core/pipeline.py:163-169`) é o mecanismo usado hoje pelo caminho de devolução via cliente — vira a base da retomada de turno na nuvem (ver §8.1-Q1).
- Desktop renderiza tool calls/resultados em cards no chat (paridade com o tratamento de eventos de tool do web-chat — parser em `web-chat/src/services/transport.ts`; o card é construído no handler de eventos, não existe componente `ToolCallCard` por esse nome).

### 3.4 Missões — evoluir `brain/agent/`, não reinventar

- `planner.py`, `task_graph.py`, `verifier.py`, `reflector.py` e `governance.py` **ficam** (modelo de dados e DAG são bons).
- `runtime.py` deixa de ser singleton: **uma instância de execução por sessão**, com sessões **multi-tenant** em Postgres (`agent_sessions`: grafo serializado, eventos, permissões, status) — substitui o SQLite local.
- **Permissão unificada**: `permission_gate` (backend) vira o engine ÚNICO; a aba consome `/agent/permissions/*`; o engine local do store morre. Permissão resolvida **reativa** a tarefa (corrige a trava de `waiting_permission`).
- A aba Agente deixa de rodar loop autônomo local: envia missão ao backend (`/agent/goal` evoluído) e vira **cockpit**: timeline do DAG real, terminais com PIDs reais, evidências do verifier, artefatos, permissões pendentes com aprovação inline.
- Hoje o chat executa `execute_command`/`start_background_process` (risco HIGH/CRITICAL no mapa de `governance.py:59-127`) **sem aprovação** — só blocklist (`tools/registry.py:131-145`, `system_control.py:34+`). **Decisão do dono (2026-10-28): o gate vale também no chat inline** — unificado com o das missões, auto-aprovar por nível de risco configurável (baixo = auto, alto = card de aprovação).

### 3.5 Runtime mode centralizado

`config.py` ganha `runtime_mode` ("device" | "cloud") com **uma fórmula** (env + plataforma); todos os 7+ pontos de `is_cloud` migram pra cá (fase 0).

### 3.6 Chamadas do builder pós-revisão (minhas decisões — conferíveis, alteráveis)

1. **Driver de missões no modo nuvem = event-driven.** Cada resultado de tool postado pelo host (`POST` acorda a sessão) ou resolução de permissão avança o DAG **um passo por invocação**, até o próximo ponto de espera. Pause/cancel/permissões viram **flags no Postgres** (fim dos `asyncio.Event` in-memory — `runtime.py:483-496`, `governance.py:160-180`). Nenhum "tick" por cron; nenhum cliente precisa estar conectado pra missão andar. Cockpit recebe eventos por polling de sessão (SSE de vida curta quando há cliente).
2. **Identidade canônica única.** Hosts, fila, sessões e missões exigem **identidade autenticada** (UUID Supabase). Loopback local (`lucas-local`) fica restrito ao chat do modo device; os atalhos `"default"`/`"lucas-local"` do broker (`device_broker.py:53`) e das queries (`device.py:367,409`) são removidos. Consequência: missões exigem login mesmo offline (chat local continua funcionando sem).
3. **Terminal do cockpit = família `background_process` movida pro host** (`Popen` no host, PIDs reais, polling de logs). PTY interativo fica fora do v1.
4. **Escopo de tools do host v1 (confirmado pelo dono, 2026-10-28):** os 13 comandos Rust existentes + port da família `background_process` + media keys; `press_key`/`type_text` e `manage_application:close` ficam `unavailable` no v1 (capacidade declarada — o modelo sabe o que o host sabe fazer).

---

## 4. Metas, não-metas e anti-metas

**Metas (v1):**
- Loop agêntico fechado ponta a ponta no chat (qualquer cliente), com resultado real voltando ao modelo.
- Um protocolo de executor (Charlie Host), multi-host por design, host de referência = desktop.
- Modo nuvem funcional de verdade (fila Postgres no lugar do WS impossível na Vercel).
- Missões multi-tenant persistentes com pause/resume/cancel reais.
- Aba Agente como cockpit funcional; permissões unificadas; sem dupla execução, sem sessão fantasma.
- Estados honestos em toda falha de execução.

**Não-metas (v1 — fases futuras):**
- Sistema de skills (`skills/` fica reservado), subagentes reais (`multi_agent.py`), integração com pipeline de voz, app mobile, mudanças no web-chat além de herdar o backend, hosts não-Windows, PTY interativo, spawn de missão a partir do chat (fase futura).

**Anti-metas (o que caracteriza fracasso mesmo funcionando "na aparência"):**
- Qualquer resposta fabricada com status de sucesso.
- Fire-and-forget (despacho sem resultado de volta).
- Estado global singleton sem escopo de usuário.
- Caminhos de execução paralelos/duplicados (parsers, engines de permissão, filas).

---

## 5. Restrições

- **Vercel serverless**: sem WebSocket, runtime limitado (`vercel.json` hoje não define `maxDuration` — orçamento real do plano em uso desconhecido) → transporte nuvem obrigatoriamente por fila + polling; turnos longos e missões precisam de execução retomável (estado no Postgres, não preso a uma conexão SSE aberta; `_active_streams` é in-memory hoje — `api/routes/chat.py:42`).
- **Multi-tenant**: `user_id` em toda fila, todo host, toda sessão, todo resultado (isolamento verificado em teste).
- **Sem quebrar o que funciona**: 212 testes passando hoje; o `ToolRegistry` com contrato estruturado, a máquina de estados de mensagens (milestone 2) e o cancelamento cooperativo são **base a reaproveitar**, não a reescrever.
- **Executor de referência**: os 13 comandos Tauri/Rust existentes (`deviceExecutor.ts` + `lib.rs`) continuam sendo a implementação local de verdade.
- **Convenções do repo** (`AGENTS.md`): UTF-8, `uv`/pytest, async I/O com Pydantic v2, TDD (teste antes de finalizar).

---

## 6. Abordagens consideradas

- **A1 — Runtime único com transporte de executor (ESCOLHIDA)**: cobre os dois modos de deploy com um só coração; absorve endpoints `/agent/*` e o `brain/agent/` existente; as 4+ vias viram 1. *Custo:* é a opção com mais trabalho.
- **A2 — Loop sempre na nuvem, desktop só executor**: descartada — modo local ficaria refem da nuvem e missões longas esbarram nos limites do serverless Vercel.
- **A3 — Loop no desktop, nuvem fina**: descartada — quebra o uso "Charlie pelo celular/web com desktop desligado" e órfã a identidade de cérebro-em-nuvem (memória Supabase, multi-tenant) já construída.

---

## 7. Fases (para o plano de implementação detalhar)

- **F0 — Verdade e fundação**: `runtime_mode` centralizado; remoção de TODOS os fallbacks fabricados (registry, file_explorer, verifier) com estados honestos; testes de regressão cobrindo os dois modos.
- **F1 — Protocolo Charlie Host**: tabelas `agent_hosts` + `agent_tool_calls` (evoluindo `device_pending_commands`), heartbeat autenticado, host service no desktop aderindo ao protocolo (reusando `deviceExecutor`), WS broker mantido como transporte rápido do modo local.
- **F2 — Loop fechado no chat**: pipeline usa `ExecutorTransport`, resultado vira tool result, step budget, fim do `client_tool_request` fire-and-forget; cards de tool no chat do desktop. *Turno **retomável** confirmado pelo dono: estado do turno persistido no Postgres, re-attach no próximo request via `ChatRequest.tool_results`.*
- **F3 — Missões e cockpit**: sessões multi-tenant em Postgres, runtime por sessão com avanço event-driven (§3.6.1), unificação de permissões (backend único), aba Agente redesignada como cockpit (timeline real, permissões inline, terminais reais, artefatos), remoção da dupla execução, da sessão fantasma e do ramo AGENTIC (decisão do dono: remover no v1).
- **F4 — Limpeza e qualidade**: dead code (AgentCommandCenter + 3 componentes mortos), unificação de parsers SSE/CodeBlock/badges, debounce do sync de sessão, suíte E2E chat↔host nos dois modos.

---

## 8. Abertos

### 8.1 Perguntas pro DONO — RESPONDIDAS (2026-10-28, em conversa)

1. **Turno retomável na nuvem: SIM** (recomendação aceita) — estado do turno persistido no Postgres, re-attach no próximo request via `ChatRequest.tool_results`.
2. **Chat spawnando missão: NÃO no v1** (leitura (a) aceita) — ramo `RouteMode.AGENTIC` e triggers por keyword do router são removidos; spawn-from-chat registrado como fase futura em não-metas.
3. **Permission gate no chat inline: SIM** — unificado com o das missões, auto-aprovar por nível de risco configurável (baixo = auto, alto = card de aprovação).
4. **Escopo de tools do host v1: CONFIRMADO** — 13 comandos Rust + família `background_process` + media keys; `press_key`/`type_text` ficam `unavailable` no v1.

### 8.2 Deixado pro builder (plano de implementação)

- Schemas SQL exatos (`agent_hosts`, `agent_tool_calls`, `agent_sessions`) e migração não-destrutiva (padrão `scripts/db/migrate_*.py`).
- Formato fino dos eventos SSE por fase (chat inline × missões) e política de timeout/retry por ferramenta.
- Default do step budget e por onde é configurável.
- Estratégia de polling do host no modo nuvem (intervalo, long-poll vs polling simples, wake-up em heartbeat).
- Como o desktop negocia a troca de transporte (WS local ↔ fila nuvem) sem duplicar execução.
- Plano de testes por fase (unitários + integração + E2E dos dois modos).
- Detalhes de UI fina da aba cockpit (validar com Lucas via mockup antes de implementar).

## 9. Referências

- Código: diagnóstico completo em §2 (file:line verificados em inspeção direta + recon dedicado do desktop + builder check independente de 2026-10-28).
- Prior art: Hermes Agent (`github.com/NousResearch/hermes-agent`, MIT) — padrões de loop de inferência + terminal backends + skills + aprovação de comandos.
- História: `docs/MISSION_STATE.md` (milestones 0-8, 212 testes), `docs/architecture/MODULOS.md`.
