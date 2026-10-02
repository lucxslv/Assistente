# Auditoria Técnica de Segurança — Produto "Charlie"

**Alvo:** `C:\Users\lucas\OneDrive\Documentos\assistente`
**Data:** 2026-10-02
**Método:** Revisão estática de código (source review). Nenhum ataque foi disparado contra serviços em produção; todas as conclusões são baseadas em leitura de código-fonte e artefatos do próprio repositório.
**Escopo:** Backend Python/FastAPI (Charlie Cloud Brain), app desktop Tauri (React/TS), memória (SQLite/Supabase/Postgres), ferramentas locais (PowerShell, filesystem, automação), provedores LLM, artefatos de deploy (Vercel/Render/Railway/Docker).

> **Classificação de evidência:** cada achado indica se está **Observado** (consta literalmente no código/artefato lido), **Inferido** (deduzido a partir do observado) ou **Não verificado**.

---

## 1. Sumário Executivo

O Charlie é um assistente pessoal que combina um backend FastAPI (roteador de IA e memória multi-tenant) com um app desktop Tauri que executa ferramentas físicas na máquina do usuário (PowerShell, arquivos, apps, screenshot, energia). A arquitetura separa corretamente "nuvem" (roteamento/LLM) de "dispositivo" (execução local via WebSocket), mas a **camada de autenticação e a separação de confiança entre nuvem, desktop e dispositivo estão quebradas**.

| # | Severidade | Achado |
|---|-----------|--------|
| C-1 | **Crítico** | Bypass total de autenticação JWT — assinatura nunca é verificada |
| C-2 | **Crítico** | RCE remoto não autenticado via `POST /api/tools/execute` → `execute_command` (PowerShell) |
| C-3 | **Crítico** | RCE equivalente no desktop Tauri exposto a comando de backend não autenticado |
| A-1 | **Alto** | WebSocket `/api/chat/ws` sem autenticação — registro de dispositivo e spoofing de resultados de tool |
| A-2 | **Alto** | CORS `allow_origins=["*"]` com `allow_credentials=True` |
| A-3 | **Alto** | Auto-confirmação de e-mail via SQL direto no login (bypass do Supabase Auth) |
| A-4 | **Alto** | Credenciais administrativas padrão (`admin`/`admin`) |
| A-5 | **Alto** | Command injection em `app_launcher` (`os.system`) |
| A-6 | **Alto** | Endpoints sensíveis sem autenticação (tools/system/agent) e vazamento de telemetria |
| M-1 | **Médio** | Allowlist do `file_explorer` frágil (bloqueio por nome; read/write arbitrário fora da allowlist) |
| M-2 | **Médio** | Usurpação de `user_id` via contextvar com fallback `"default"` |
| M-3 | **Médio** | Guardrails de prompt brandos / prompt injection via `{context}` e `{memory_summary}` |
| M-4 | **Médio** | SSRF leve em `read_page` (segue redirects) e `home_assistant` |
| M-5 | **Médio** | Exposição de tela via `take_screenshot` para quem controla a API |
| B-1 | **Baixo** | CSP nulo no Tauri (`"csp": null`) |
| B-2 | **Baixo** | Contêiner Docker roda como root; healthcheck vaza detalhe de erro de DB |
| B-3 | **Baixo** | Dependências sem pin (floors `>=`); `.env.example` incompleto; testes de guard desatualizados |

**Impacto agregado (cadeia completa):** um atacante sem credenciais pode forjar um JWT (C-1), autenticar-se como qualquer usuário e invocar `POST /api/tools/execute` com a tool `execute_command` (C-2) para executar comandos arbitrários no Windows do usuário (quando o backend local está ativo) ou fazer o desktop da vítima executá-los via WebSocket (C-3/A-1). Trata-se de **comprometimento total da máquina do usuário a partir de rede**, sem autenticação válida.

---

## 2. Achados Detalhados

### C-1 — Crítico: Bypass de autenticação JWT (assinatura nunca verificada)

**Observado.** `api/routes/auth.py` (função `verify_supabase_token`, ~linhas 88–107):

```python
    except Exception as e:
        logger.warning(f"Falha ao validar token na rede do Supabase ({e}), tentando decodificação segura local...")

    # 3. Fallback rápido: decodifica payload do JWT não expirado emitido pelo Supabase
    try:
        parts = clean_token.split(".")
        if len(parts) == 3:
            padded = parts[1] + "=" * ((4 - len(parts[1]) % 4) % 4)
            payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
            exp = payload.get("exp", 0)
            sub = payload.get("sub")
            if exp > now and sub:
                user_info = {"id": str(sub), "email": payload.get("email") or "", ...}
                _TOKEN_CACHE[clean_token] = (now, user_info)
                return user_info
```

O token é dividido em 3 partes, o **payload (parte do meio) é apenas decodificado** e o usuário é aceito se `exp > now` **e** `sub` existir. **A assinatura (terceira parte) nunca é verificada** — não há checagem HMAC nem consulta a JWKS. Um JWT com header, payload e uma assinatura qualquer ("x") é aceito.

Além disso, qualquer `HTTPError` retornado pelo Supabase (token inválido/adulterado rejeitado pelo provedor) cai no bloco `except Exception` genérico e **também segue para o fallback local**, de modo que tokens que o Supabase rejeitou são aceitos localmente.

**Confirmado pelo próprio repositório.** `scripts/test_isolation.py` (linhas 21–28) constrói um JWT com assinatura falsa e o usa para autenticar:

```python
    header  = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps({
        "sub": user_id, ..., "exp": int(time.time()) + 3600,
    }).encode()).decode().rstrip("=")
    sig = "mock_sig_1234567890abcdef"
    ...
    res1 = await ac.get("/api/threads", headers={"Authorization": f"Bearer {token_u1}"})
```

O teste espera **HTTP 200** em `/api/threads` com `sig = "mock_sig_1234567890abcdef"`. Ou seja, a aceitação de assinatura forjada é comportamento **pretendido pelo autor** — um test harness de isolamento que só funciona porque a assinatura é ignorada.

**Prova de conceito (reprodução).**

```python
# poc forja_jwt.py — gera um token aceito pelo backend
import base64, json, time, sys
b64 = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
header  = b64({"alg": "HS256", "typ": "JWT"})
payload = b64({"sub": sys.argv[1], "email": "alvo@exemplo.com", "exp": int(time.time()) + 86400})
print(f"{header}.{payload}.assinatura_nao_verificada")
```

```
$ TOKEN=$(python forja_jwt.py 11111111-1111-1111-1111-111111111111)
$ curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8005/api/threads
```

**Impacto:** quebra de todo o modelo de isolamento multi-tenant. Como as rotas de threads/messages/settings usam o `id` do token como identidade (`Depends(get_current_user)`), o atacante lê, cria, altera e **apaga dados de qualquer usuário** (ex.: `DELETE /api/settings/memory`), além de destravar C-2.

**Remediação:** validar a assinatura de verdade — buscar as chaves públicas do projeto Supabase em `/.well-known/jwks.json` e verificar RS256/ES256, ou usar o endpoint `/auth/v1/user` do Supabase com o token e **falhar fechado** (nunca cair em decodificação local). Remover o fallback e o `except Exception` que o alimenta. Ajustar `scripts/test_isolation.py` para usar tokens assinados válidos de um projeto de teste.

---

### C-2 — Crítico: RCE remoto não autenticado via `/api/tools/execute`

**Observado.** `api/routes/tools.py` (linhas ~25–29) — a rota **não tem `Depends(get_current_user)`**:

```python
@router.post("/execute")
async def execute_tool(req: ToolExecuteRequest):
    """Executa uma ferramenta diretamente na máquina local."""
    result = await _tools.execute(req.name, req.arguments, prefer_remote=False)
    return {"status": "ok", "name": req.name, "result": result}
```

A tool `execute_command` em `tools/system_control.py` (linhas ~107–123) executa PowerShell arbitrário:

```python
    res = subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
        capture_output=True, text=True, timeout=30, cwd=cwd or None,
    )
```

O comando e o `cwd` vêm diretamente do corpo JSON. Na nuvem (Vercel/Lambda) a função apenas devolve a string "despachado...", mas **no backend local (porta 8005, `0.0.0.0`) executa de verdade**. O desktop é instruído a preferir o backend local quando ativo (`desktop/src/services/api.ts`, `detectApiBase()` → `LOCAL_API = "http://127.0.0.1:8005/api"`), e o próprio Tauri sobe o backend local em background no `setup` (`lib.rs`).

**Prova de conceito (reprodução).** Combinado com C-1 (token forjado):

```
$ curl -s -X POST http://127.0.0.1:8005/api/tools/execute \
  -H "Authorization: Bearer $(python forja_jwt.py 11111111-...)" \
  -H "Content-Type: application/json" \
  -d '{"name":"execute_command","arguments":{"command":"whoami; ipconfig; dir C:\\Users"}}'
```

Como a rota sequer exige o header `Authorization`, o `curl` acima funciona **sem token nenhum**.

**Impacto:** execução remota de código no computador Windows do usuário com os privilégios do processo — leitura/exfiltração de arquivos, instalação de persistência, movimentação lateral na rede local.

**Remediação:** exigir `Depends(get_current_user)` em `/tools/*`; restringir `/execute` a um conjunto mínimo de tools seguras; remover `execute_command` do caminho HTTP direto (só permitir via pipeline com mediação de escopo/o usuário); preferir allowlist de comandos/parâmetros em vez de string livre para o PowerShell.

---

### C-3 — Crítico: RCE no desktop Tauri comandado pelo backend

**Observado.** `desktop/src-tauri/src/lib.rs`:
- `execute_system_command` (linha 408) roda `powershell.exe ... -Command <comando>` (ou `sh -c` fora do Windows) e retorna stdout/stderr/exit code.
- `read_local_file` (linha 462) e `resolve_local_user_path` (linha 208) permitem leitura/escrita/listagem de caminho arbitrário.
- Todos estão registrados em `generate_handler!` (linha 575), logo são invocáveis do frontend.

`desktop/src/services/deviceExecutor.ts`: `executeDeviceTool()` executa `execute_command`/`run_command`/`shell_exec`/`powershell`/`cmd` diretamente via `executeSystemCommand`, sem qualquer verificação de autorização por usuário ou confirmação do usuário.

`desktop/src/services/api.ts` (linhas ~503–520, 558): o cliente recebe eventos `client_tool_request`/`client_tool_call` do backend e **executa a ferramenta no dispositivo automaticamente**, devolvendo o resultado ao backend:

```javascript
    if (clientToolCalls.length > 0) {
      for (const call of clientToolCalls) {
        const output = await executeDeviceTool(call.name, call.args || {});
        results.push({ call_id: call.call_id, name: call.name, result: output });
      }
      return await sendChatMessageStream("", returnedThreadId, onEvent, skipTts, results);
    }
```

**Observado.** O backend que originou o pedido (`/api/chat/ws` ou o pipeline) não autentica o dispositivo nem o usuário (ver A-1); e a tool `execute_command` local (`tools/system_control.py`) roda o comando no backend.

**Impacto:** qualquer parte que consiga entregar um evento `client_tool_call` ao desktop — ou invocar `/api/tools/execute` no backend local — obtém RCE no Windows do usuário. É a variante "desktop" do C-2.

**Remediação:** exigir confirmação explícita do usuário para comandos nativos; autenticar e autorizar o canal de despacho de tools; validar que o pedido vem do próprio usuário (não de qualquer cliente WS); aplicar allowlist de comandos e caminhos no lado Rust.

---

### A-1 — Alto: WebSocket `/api/chat/ws` sem autenticação

**Observado.** `api/routes/chat.py` (linhas 207–278): o handler faz `await websocket.accept()`, gera `client_id`, chama `presence_manager.register_or_heartbeat(...)` e `device_broker.register_device_connection(websocket)` **sem exigir token**. No loop, aceita `device_tool_result` de qualquer cliente e chama `device_broker.resolve_tool_result(call_id, res)` — permitindo **falsificar o resultado de uma tool** ou sequestrar uma chamada de outro dispositivo. O branch `chat` chama `_prepare_thread_and_store_user_message(text, thread_id_in)` **sem passar `user`**, então lança 401 (funcionalmente quebrado), mas o registro de dispositivo/presença ocorre **antes** e permanece.

**Impacto:** spoofing de dispositivo, injeção de resultados de ferramenta, poluição/sequestro do broker e exposição de telemetria de estado.

**Remediação:** autenticar o WS (token no handshake/primeira mensagem), amarrar o dispositivo ao `user_id`, rejeitar `device_tool_result` de `call_id` que não pertença ao próprio dispositivo, e passar o usuário ao `_prepare_thread_and_store_user_message`.

---

### A-2 — Alto: CORS permissivo com credenciais

**Observado.** `api/main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

`allow_origins=["*"]` com `allow_credentials=True` faz o Starlette refletir a origem da requisição com credenciais — qualquer site pode chamar a API com cookies/Authorization do usuário autenticado (se houver sessão baseada em cookie) e ler a resposta. Combinado com C-1, amplia o vetor para CSRF/drive-by.

**Remediação:** listar explicitamente as origens (`https://assistente-xi.vercel.app`, `http://localhost:1420`, `tauri://localhost`); nunca `*` com credenciais.

---

### A-3 — Alto: Auto-confirmação de e-mail via SQL direto

**Observado.** `api/routes/auth.py` (login, ~linhas 311–330): quando o Supabase retorna "not confirmed", o backend executa SQL direto para confirmar o e-mail:

```python
            elif "not confirmed" in msg.lower():
                pool = await get_or_init_db_pool()
                if pool:
                    async with pool.acquire() as conn:
                        await conn.execute(
                            "UPDATE auth.users SET email_confirmed_at = now() WHERE email = $1",
                            data.email,
                        )
```

**Impacto:** bypass da verificação de e-mail do Supabase Auth — conta criada com e-mail alheio nunca é confirmada pelo titular; o servidor confirma automaticamente. Viola o modelo de confiança do provedor de identidade.

**Remediação:** remover o UPDATE; devolver a mensagem "confirme seu e-mail" e orientar o fluxo legítimo. Não escrever na tabela `auth.users` fora do GoTrue.

---

### A-4 — Alto: Credenciais administrativas padrão

**Observado.** `config.py` (linhas ~67–68):

```python
    admin_username: str = os.getenv("ADMIN_USERNAME", "admin")
    admin_password: str = os.getenv("ADMIN_PASSWORD", "admin")
```

Sem `ADMIN_USERNAME`/`ADMIN_PASSWORD` no ambiente, o padrão é `admin`/`admin`. O `.env` real (lido mascarado) usa uma senha curta/fraca.

**Remediação:** remover defaults; falhar a inicialização se as credenciais admin não estiverem definidas com força adequada; segregar o admin do app principal.

---

### A-5 — Alto: Command injection em `app_launcher`

**Observado.** `tools/app_launcher.py` (linhas ~44 e ~53):

```python
            result = os.system(f"start {app_info['cmd']}")
            ...
            process_name = app_info['process']
            result = os.system(f"taskkill /IM {process_name} /F")
```

`app_name`/`app_info['cmd']` derivam de entrada do usuário/LLM. Apps não mapeados geram `cmd` a partir da chave do input, injetando metacaractere (`&`, `|`, `>`), resultando em execução de comando arbitrário via `os.system`.

**Remediação:** nunca montar shell com `os.system`/`shell=True`; usar `subprocess.run([...])` com allowlist fechada de apps e validação estrita.

---

### A-6 — Alto: Endpoints sensíveis sem autenticação

**Observado.** Ausência de `Depends(get_current_user)` em:
- `/api/tools` (list), `/api/tools/execute`, `/api/tools/status`;
- `/api/system/status`, `/api/system/presence` — `/presence` vaza `client_id`, `ip_address`, `platform`, `client_type`, `connected_at`, `active_thread_id` de **todos** os dispositivos conectados;
- `/api/agent/*` (`/goal` usa `get_current_user_optional`, e `save_session_snapshot`/`/session`/pause/resume/cancel/metrics persistem/leem estado com dict arbitrário via SQLite);
- `/api/settings` GET/PUT (config, sem auth);
- `/health` e `/api/health` — expõem `database_error` com detalhe do erro de conexão ao Supabase.

**Prova (observado no código):** `grep` de `Depends(` em `api/routes/` mostra auth apenas em `threads`, `messages`, `settings/memory`, `settings/user-model` e `chat` (POST/SSE). Todo o restante está aberto.

**Remediação:** autenticar todas as rotas; em `/presence`, filtrar por `user_id` e nunca expor IP; em `/health`, devolver status booleano sem detalhe do erro.

---

### M-1 — Médio: Allowlist do `file_explorer` frágil

**Observado.** `tools/file_explorer.py`: `SENSITIVE_PATTERNS` (linhas 11–21) bloqueia por **nome** (`.env`, `id_rsa`, `config.py`, `token`, `secrets`, ...) e `is_blocked_path` (linha 22) faz checagem por substring do nome + proteção do repo-root via `Path.cwd()`. `resolve_friendly_path` (linha 45) aceita **caminhos absolutos** diretamente. Operações `read_file`/`write_file`/`replace_in_file`/`create_folder`/`list_directory` só passam por essa allowlist por nome.

**Impacto (Inferido):** bloqueio por nome é trivialmente contornável — renomear/copiar o segredo, usar caminhos absolutos fora do repo (por exemplo `C:\Windows\System32\drivers\etc\hosts`, arquivos em `%APPDATA%`), ou gravar/alterar conteúdo arbitrário em qualquer caminho não bloqueado. `replace_in_file` (linhas 285–316) escreve conteúdo controlado.

**Remediação:** allowlist positiva de diretórios permitidos, canonicalização + checagem de contenção (`resolved.is_relative_to(allowed_root)`), deny por conteúdo/extensão e não apenas por nome, e bloquear acesso a diretórios de sistema.

---

### M-2 — Médio: Usurpação de `user_id` via fallback `"default"`

**Observado.** `tools/registry.py` (linhas ~561–573): `_wrap_memorize_fact`/`_wrap_memorize_pref` leem `current_user_id_var.get()` e caem em `"default"` quando não há usuário no contexto. Chamadas sem usuário (ex.: via `/api/tools/execute`, que não autentica) gravam memória no usuário `"default"`, misturando/atribuindo dados indevidamente.

**Remediação:** exigir contexto de usuário para tools de memória; falhar se ausente em vez de usar `"default"`.

---

### M-3 — Médio: Guardrails de prompt brandos / prompt injection

**Observado.** `brain/prompts/prompts.py` (346 linhas). O system prompt contém instruções de recusa "brandas" (linhas ~320–324: recusar inspeção do servidor com uma frase fixa, "NUNCA mencione .bat/scripts legados") e injeta `{context}` e `{memory_summary}` no template, além de `{tools_list}`. O texto do usuário e o conteúdo recuperado da memória entram no prompt sem sanitização forte. `scripts/test_security_guards.py` valida apenas **strings presentes no prompt** (ex.: procura "Operação restrita" e "SEGURANÇA, PRIVACIDADE..."), não o **comportamento** — não há sandboxing real para `execute_command`.

**Impacto (Inferido):** defesas de prompt não impedem que conteúdo de usuário/memória redirecione o modelo para chamar `execute_command`/`read_file`/`write_file` — e como a execução não tem confinamento (C-2/C-3), o guardrail textual é a única barreira, insuficiente.

**Remediação:** tratar defesa em profundidade — allowlist de tools por contexto, validação de parâmetros no backend (não confiar no LLM), sanitização/escapes, e testes comportamentais que exercitem tentativas de injeção.

---

### M-4 — Médio: SSRF leve

**Observado.** `tools/web_search.py`: `read_page(url)` busca URL arbitrária com `follow_redirects=True` (controlada pelo LLM). `tools/home_assistant.py` monta a URL a partir de `entity_id` contra `HOME_ASSISTANT_URL` (path injection parcial).

**Remediação:** validar esquema/host (bloquear `file://`, `169.254.169.254`, faixas privadas), desativar/limitar redirects, validar `entity_id`.

---

### M-5 — Médio: Exposição de tela

**Observado.** `tools/automation.py` `take_screenshot` captura a tela; no desktop, `deviceExecutor` aciona `ms-screenclip:`. Para quem controla a API (via C-1/C-2), isso materializa vigilância/exfiltração visual da máquina.

**Remediação:** exigir confirmação explícita do usuário; nunca acionar screenshot remotamente sem consentimento por sessão.

---

### B-1 — Baixo: CSP nulo no Tauri

**Observado.** `desktop/src-tauri/tauri.conf.json` linha 39: `"csp": null`. Sem Content-Security-Policy, qualquer XSS no frontend (ex.: renderização de Markdown/KaTeX de conteúdo do LLM) tem caminho livre para invocar `invoke()` e alcançar os comandos nativos (C-3).

**Remediação:** definir uma CSP restritiva (sem `unsafe-inline`/`unsafe-eval`; `connect-src` apenas nos endpoints legítimos).

---

### B-2 — Baixo: Contêiner Docker sem non-root; health vaza erro de DB

**Observado.** `Dockerfile`: `CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8005}"]` sem `USER` non-root. `/api/health` retorna detalhe do erro de conexão ao banco.

**Remediação:** criar usuário não privilegiado e `USER app`; health sem detalhe sensível.

---

### B-3 — Baixo: Dependências, exemplo incompleto e testes desatualizados

**Observado.**
- `requirements.txt` usa floors (`fastapi>=0.115.0`, `uvicorn>=0.30.0`, `google-generativeai>=0.8.0`, `openai>=1.40.0`, `supabase>=2.3.0`, `ddgs>=9.14.0`) — não fixa versões; risco de reprodutibilidade e de trazer versões vulneráveis futuras. CVEs específicas **não verificadas** nesta auditoria.
- `.env.example` não inclui `SUPABASE_URL`, `SUPABASE_KEY`, `DATABASE_URL`, `CHAINLIT_AUTH_SECRET` (incompleto para quem configura o produto).
- `scripts/test_security_guards.py` espera o retorno `"Operação restrita"` da tool na nuvem, mas o código real devolve `"...despachado..."` — **drift** entre teste e implementação (o teste falharia), evidência de que os guards não são exercitados.
- `.env` **não** está rastreado no git (`.gitignore` cobre; `git ls-files` só lista `.env.example`) — **bom**. Porém o `.env` real contém segredos em texto claro (`GROQ_API_KEY`, `SUPABASE_KEY` JWT, `DATABASE_URL` com senha, `CHAINLIT_AUTH_SECRET`, `ADMIN_PASSWORD` fraca) no OneDrive — superfície de vazamento.

**Remediação:** pinar versões e rodar scanner de dependências; completar `.env.example`; rotacionar segredos que já tenham passado por sincronização (OneDrive/nuvem); corrigir/reescrever os testes de guard para checar comportamento; mover segredos para um cofre (não em pasta sincronizada).

---

## 3. Cadeia de Ataque Completa (Observada + Inferida)

1. Atacante obtém (ou forja) um JWT — C-1 (ou simplesmente ignora a auth, pois `/tools/execute` não exige).
2. Chama `POST /api/tools/execute {name:"execute_command", arguments:{command:"<payload>"}}` — C-2.
3. Se o backend local estiver ativo (o desktop o sobe automaticamente): **RCE** no Windows do usuário.
4. Alternativamente, entrega um `client_tool_call`/evento ao desktop via o WS não autenticado (A-1) → `deviceExecutor` executa via Tauri (C-3) → **RCE** no desktop.
5. Exfiltração de arquivos (M-1), memória de qualquer usuário (C-1 + M-2), telemetria/dispositivos (A-6), tela (M-5).

---

## 4. Prioridades de Remediação

1. **C-1** — Verificar assinatura JWT (JWKS Supabase); falhar fechado. *Sem isso, todo o resto é irrelevante.*
2. **C-2** — Exigir autenticação em `/api/tools/*` e remover `execute_command` do caminho HTTP direto.
3. **C-3** — Confirmação do usuário + autorização por usuário para execução nativa no desktop.
4. **A-1/A-2/A-3/A-4/A-5/A-6** — Autenticar WS e todas as rotas, restringir CORS, remover auto-confirm e defaults admin, eliminar `os.system`.
5. **M-1…M-5** — Allowlist positiva de paths, remover fallback `"default"`, validar parâmetros de tools no backend, restringir SSRF, consentimento para screenshot.
6. **B-1…B-3** — CSP Tauri, non-root no Docker, pinar dependências, rotacionar segredos, reescrever testes.

---

## 5. Metodologia e Limitações

- **Escopo:** revisão **estática** de código e artefatos do repositório. Nenhum teste dinâmico/exploração foi executado; nenhum serviço em produção foi tocado.
- **Limitações:** (a) CVEs de dependências não foram verificadas contra bases de advisories — requer `pip-audit`/`npm audit`/`cargo audit`; (b) o `.env` real foi lido de forma mascarada, sem expor valores; (c) trechos de arquivos grandes podem ter sido lidos parcialmente — os achados citados foram reconfirmados por leitura direta das linhas relevantes; (d) a exploração efetiva da cadeia (C-1→C-2→RCE) foi demonstrada por leitura de código e pelo test harness do próprio projeto, **não** por execução.
- **Arquivos-chave:** `api/routes/auth.py`, `api/routes/tools.py`, `api/routes/chat.py`, `api/routes/system.py`, `api/routes/settings.py`, `api/main.py`, `tools/system_control.py`, `tools/file_explorer.py`, `tools/app_launcher.py`, `tools/registry.py`, `config.py`, `desktop/src-tauri/src/lib.rs`, `desktop/src-tauri/tauri.conf.json`, `desktop/src/services/deviceExecutor.ts`, `desktop/src/services/api.ts`, `brain/prompts/prompts.py`, `scripts/test_isolation.py`, `scripts/test_security_guards.py`, `Dockerfile`, `vercel.json`, `.gitignore`, `.env.example`.
