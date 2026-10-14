# MISSION STATE — Missão Charlie (Auditoria, Correções, Redesign, Integrações e QA Integral)

**Branch de Trabalho Isolada:** `feat/charlie-dev`
**Worktree Isolada:** `C:\Users\lucas\OneDrive\Documentos\assistente\.worktrees\charlie-dev`
**Última Atualização:** 2026-10-11T13:24:00-03:00
**Milestone Atual:** Milestone 8 (Concluído — Todos os 8 Milestones Validados e Integrados)

---

## 1. Status dos Milestones

| Milestone | Descrição | Status | Commit / Evidência |
| :--- | :--- | :--- | :--- |
| **Milestone 0** | Diagnóstico Obrigatório, Inventário Técnico, Baseline de Testes e Mapa de Riscos | ✅ Concluído | `aa3e145` (`189 passed` baseline) |
| **Milestone 1** | Segurança Crítica, Autenticação Própria, Rate Limiting, IDOR e Isolamento | ✅ Concluído | `4ddc76c` (`tests/test_milestone1_security_auth.py` — `10 passed`) |
| **Milestone 2** | Confiabilidade do Chat, Streaming, Cancelamento Ponta a Ponta e Recuperação | ✅ Concluído | `f61e61e` (`tests/test_milestone2_chat_reliability.py` — `5 passed`, `204 passed` total) |
| **Milestone 3** | Web Chat — Redesign, Anexos, Edição/Regeneração, Feedback 👍/👎, Busca/Pin/Archive e Perfil | ✅ Concluído | `73bb509` (`tsc && vite build` — `✓ built in 1.57s`, 0 erros TS) |
| **Milestone 4** | Ferramentas, Contratos de Resultado, Cards Dinâmicos e Roteamento de Modelos (`LLMRouter`) | ✅ Concluído | `069554d` (`tests/test_milestone4_tools_router.py` — `7 passed, 0 warnings`) |
| **Milestone 5** | Aplicativo Desktop Tauri — Recuperação Funcional, Configurações, Pareamento e Redesign | ✅ Concluído | `b1c38c8` (`tsc && vite build` — `✓ built in 1.87s`, 0 erros TS) |
| **Milestone 6** | Painel Administrativo, Observabilidade (p50/p95, Custos Reais vs Estimados), Qualidade e Controles | ✅ Concluído | `c497fb9` (`tests/test_milestone6_admin_observability.py` — `2 passed`) |
| **Milestone 7** | QA Integrado, Testes End-to-End, Segurança, Concorrência e Regressão | ✅ Concluído | `pytest tests/ -v` (`212 passed in 175.83s`) + builds `web-chat` e `desktop` |
| **Milestone 8** | Documentação Técnica Atualizada e Relatório Final Obrigatório | ✅ Concluído | `docs/architecture/MODULOS.md` + `docs/MISSION_STATE.md` + Relatório Final Seção 18 |

---

## 2. Condição Inicial do Repositório e Baseline de Testes (Milestone 0)

### 2.1. Preservação do Trabalho Preexistente
- O checkout principal (`C:\Users\lucas\OneDrive\Documentos\assistente`) possuía modificações locais em `agent_experience_lessons.json`, `web-chat/src/App.tsx`, `web-chat/tailwind.config.js` e o arquivo novo `web-chat/src/components/ui/sign-in-flo.tsx`.
- Todos esses arquivos foram preservados intactos no diretório raiz e sincronizados no commit `40ec18c` da branch isolada `feat/charlie-dev`.

### 2.2. Baseline Inicial de Testes e Builds (Executados)
1. **Suíte Automatizada Backend (`pytest`):**
   - **Comando:** `C:\Users\lucas\OneDrive\Documentos\assistente\.venv\Scripts\pytest.exe tests/ -v`
   - **Resultado:** `189 passed, 2 warnings in 49.80s` (Status: **Teste automatizado executado**).
   - **Warnings observados:** `FutureWarning` em `brain/memory/extractor.py:14` pelo uso do pacote depreciado `google.generativeai`.
2. **Build Inicial Web Chat (`web-chat/`):**
   - **Comando:** `npm --prefix .worktrees\charlie-dev\web-chat run build` (`tsc && vite build`)
   - **Resultado:** `✓ built in 8.92s` — `0 erros de compilação TypeScript` (Status: **Teste automatizado executado**).
3. **Build Inicial Desktop Frontend (`desktop/`):**
   - **Comando:** `npm --prefix .worktrees\charlie-dev\desktop run build` (`tsc && vite build`)
   - **Resultado:** `✓ built in 5.16s` — `0 erros de compilação TypeScript` (Status: **Teste automatizado executado**).

---

## 3. Inventário Técnico e Mapa de Riscos / Bugs Confirmados

### 3.1. Segurança Crítica, Autenticação e Isolamento Multi-Tenant (Prioridade P0)
1. **Tokens Estáticos Hardcoded com Bypass de Autenticação e Admin (`api/routes/auth.py:117-138, 343-413`):**
   - Qualquer requisição com `Bearer charlie_guest_token` ou `Bearer charlie_local_token` autentica como `lucas-local` (`is_admin: True`).
   - Qualquer requisição com `Bearer charlie_admin_local_token` autentica como `admin-lucas` com `email = config.admin_email`, contornando `verify_admin_user` em `api/routes/admin.py:22-62`.
   - `config.py:74-75` define credenciais default `admin` / `admin`.
2. **Backdoor Não Autenticado no Pareamento (`api/routes/pair.py:659-691`):**
   - `POST /api/pair/auto-link` emite um `device_token = "charlie_dev_..."` válido sem exigir autenticação, PIN ou segredo.
   - `GET /api/pair/devices` (`L621`) e `DELETE /api/pair/devices/{id}` (`L636`) não exigem autenticação e não sincronizam exclusão com `device_authorized_devices` no Postgres.
3. **Rotas Desprotegidas e Vazamento Cross-Tenant (`api/routes/agent.py`, `device.py`, `settings.py`, `system.py`, `voice.py`, `tools.py`, `state.py`):**
   - `api/routes/agent.py`: 9 rotas sem autenticação; `POST /api/agent/permissions/{id}/resolve` (`L142-157`) usa `get_current_user_optional` e não repassa `user_id` para `permission_gate.resolve_permission()`.
   - `api/routes/device.py`: fila `device_pending_commands` e `device_host_state` sem `user_id`; `POST /api/device/heartbeat` (`L292`) sem autenticação; `POST /api/device/command` (`L465`) permite que qualquer usuário autenticado enfileire comandos para o host Desktop.
   - `WS /api/chat/ws` (`api/routes/chat.py:361-405`) + `api/state.py`: aceita conexões sem autenticação e transmite estado singleton global (`active_thread_id`, `active_tool`, `active_tool_args`) para todos os clientes conectados.
   - `api/services/chat_persistence.py:181-187`: condição booleana usa `and` em vez de `or` ao verificar `t_uid` e `t_uident`, permitindo colisão cross-tenant se `userIdentifier` for `NULL`.
   - `api/routes/settings.py:21-44`, `api/routes/voice.py:28-80`, `api/routes/system.py:54-114`, `api/routes/tools.py:17-41`: rotas sem autenticação e/ou sem verificação administrativa.
4. **Ausência de Rate Limiting e Quotas Pré-Execução:**
   - Sem rate limiting em `/api/auth/login`, `/api/auth/register`, recuperação de senha, `/api/chat/stream`, `/api/chat`, `/api/device/verify-pin`, `/api/tools/execute`.
   - Em `api/routes/pair.py:341, 381, 502`, o contador `session.attempts` só é incrementado em memória (`_active_sessions`), sem atualizar a coluna `attempts` em `device_pairing_sessions` no PostgreSQL.
5. **Ausência de Recuperação de Senha, Auto-Confirmação Insegura e Enumeração de Contas:**
   - Não existem endpoints `/api/auth/forgot-password` e `/api/auth/reset-password` com tokens de uso único e expiração.
   - `api/routes/auth.py:491-500` auto-confirma e-mails diretamente no banco durante tentativa de login falha.
   - `api/routes/auth.py:265-266` permite enumeração explícita de contas no registro; `POST /api/auth/logout` (`L530-534`) não limpa `_token_cache` nem invalida a sessão.
6. **Exposição de Detalhes Internos (`str(e)`):**
   - Respostas HTTP 500 e eventos SSE/WS em `api/main.py`, `auth.py`, `admin.py`, `chat.py`, `core/pipeline.py`, `voice.py` e `device.py` retornam `str(e)` cru ao cliente.

### 3.2. Confiabilidade do Chat, Streaming, Cancelamento e Persistência (Prioridade P0)
1. **Cancelamento Ineficaz Ponta a Ponta:**
   - Web Chat apenas aborta o `fetch` local (`useChat.ts:189-211`); `GeminiProvider` continua executando a thread `worker_modern` (`providers/gemini.py:253`) sem `threading.Event` de cancelamento; `api/routes/chat.py:312-348` salva a resposta truncada como concluída normal.
   - Desktop (`desktop/src/services/api.ts:489-512, 586-600` e `desktop/src/App.tsx:622-640`) não possui `AbortController` e, quando o stream falha/interrompe, faz fallback automático para `POST /api/chat` síncrono, **reenviando a mensagem do usuário e gerando resposta duplicada**.
2. **Persistência Tardia e Falta de Máquina de Estados de Mensagens:**
   - Em `api/routes/chat.py:127-134, 357`, a mensagem do usuário é agendada em `BackgroundTasks` do `StreamingResponse`, que só executa após o fim do stream — se a conexão cair durante a geração, a mensagem pode se perder.
   - `public.chat_messages` não possui colunas `status` (`in_progress`, `completed`, `cancelled`, `interrupted`, `failed`, `unknown`), `request_id`, `parent_message_id`, `version`, `is_edited`, `attachments` ou `error_detail`.
3. **Criação Duplicada de Conversas ("Novo chat"):**
   - Ausência de lock de concorrência em `web-chat/src/hooks/useChat.ts:151-158`, ausência de reaproveitamento de conversa ativa vazia (`messages.length === 0`) e ausência de idempotência em `POST /api/threads`.

### 3.3. Web Chat — Bugs Confirmados e Funcionalidades Incompletas (Prioridade P1)
1. **Bug Confirmado — Texto de Arquivos Despejado no Chat:**
   - `PromptDock.tsx:104-112` lê até 15.000 caracteres em `textPreview` (inclusive lixo binário de PDFs), `useChat.ts:234-248` concatena `--- Conteúdo do Arquivo (...) ---` em `finalPrompt`, e `api/routes/chat.py` grava `finalPrompt` na coluna `content` de `chat_messages` sem separar `attachments`. Ao recarregar as mensagens (`GET /api/messages`), o conteúdo bruto aparece dentro do balão do usuário e estoura o layout (`MessageItem.tsx:83, 98` sem `min-w-0` / `overflow-hidden` / `break-words`).
2. **Edição de Mensagens, Regeneração e Ações (👍/👎):**
   - Não há edição inline de mensagem do usuário com truncamento/versionamento das mensagens posteriores no banco.
   - `regenerateLastMessage` em `useChat.ts:459-475` não está conectado ao `MessageItem.tsx` e duplica a mensagem do usuário ao chamar `sendMessage`.
   - Não há avaliação 👍/👎 persistida no banco (`message_feedback`).
3. **Busca, Fixação (`pin`), Arquivamento (`archive`), Títulos Automáticos, Atalho `Ctrl+Alt+Space`, Syntax Highlighting e Perfil:**
   - Falta suporte a `is_pinned` e `is_archived` em `chat_sessions` / `Sidebar.tsx`, busca por conteúdo de mensagens, atalho `Ctrl+Alt+Space`, modal de edição de perfil conectado ao backend (`PATCH /api/auth/profile`), destaque de sintaxe em `CodeBlock.tsx` e cards dinâmicos de ferramentas (`ToolCallCard`).

### 3.4. Ferramentas, Orquestração e Roteamento (`LLMRouter`) (Prioridade P1)
1. **Ferramentas:**
   - Funções síncronas bloqueantes (`search_web`, `execute_system_command`, `psutil.cpu_percent`, `pyautogui`) rodam diretamente no event loop assíncrono em `ToolRegistry.execute` (`tools/registry.py:146-149`) sem `asyncio.to_thread` nem `asyncio.wait_for`.
   - Retornos em string livre sem contrato estruturado (`status`, `error_type`, `friendly_name`, `is_recoverable`).
2. **Roteador de Modelos e Provedores:**
   - Nomes de modelos inexistentes hardcoded (`gemini-3.5-flash-lite`, `gemini-3.8-flash`, `qwen/qwen3.8-27b`) em `brain/router/router.py:32-41` e `providers/gemini.py:25-32`.
   - Uso do pacote depreciado `google.generativeai` em `brain/memory/extractor.py`, `providers/gemini.py` e `memory/embeddings.py`.
   - Ausência de telemetria real de latência (`latency_ms`, `ttft_ms`), `route_mode`, `fallback_used` e `usage_metadata` real da API.

### 3.5. Aplicativo Desktop Tauri e Painel Administrativo (Prioridade P1)
1. **Desktop Tauri:**
   - Remover login fantasma (`charlie_guest_token` / `lucas-local`) em `desktop/src/services/api.ts`.
   - Remover exposição da aba `"Servidor Oficial"` (`server`) em `SettingsModal.tsx` mantendo `detectApiBase()`.
   - Implementar persistência real em `PUT /api/settings`, corrigir falso positivo do Home Assistant, corrigir envio multimodal de imagens/arquivos em `ChatArea.tsx`, adicionar botão de Stop (`AbortController`), eliminar dupla execução de tools (`tool_start` vs `client_tool_request`), impedir que `agentRuntimeStore` sequestre conversas normais e redesenhar `PairingPanel.tsx` com IP LAN real e lista/revogação de dispositivos pareados.
2. **Painel Administrativo (`AuditDashboard.tsx` & `api/routes/admin.py`):**
   - Diferenciar tokens/custos registrados pela API vs estimados por heurística vs cota.
   - Adicionar métricas de latência (`p50`/`p95`), erros por categoria/provedor/ferramenta, aba de avaliação de qualidade (👍/👎), gestão de usuários (incluindo usuários sem mensagens, suspensão/reativação) e controles operacionais de limites/quotas.

---

## 4. Definição de Ownership e Plano de Execução por Milestone

- **Coordenador Principal (Agente Principal):** Orquestração de milestones, migrações de banco, integração entre camadas, execução de suítes de testes (`pytest` + `tsc && vite build`), atualização de `docs/MISSION_STATE.md` e commits atômicos.
- **Subagentes Especialistas e Auditor Independente:** Acionados por módulo com escopo isolado de arquivos para evitar conflitos de escrita.
