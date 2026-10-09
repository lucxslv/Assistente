# Plano de Implementação: Charlie — Auditoria e Correções

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o isolamento multi-tenant de ponta a ponta, o módulo de calibração situacional de tom (eliminando hostilidade gratuita e sarcasmo inadequado), a validação determinística de código via AST com pivot de estratégia no agente, e a suíte de testes de regressão comportamental.

**Architecture:** Operações de banco atômicas com verificação de titularidade (`WHERE session_id = $1 AND user_id = $2`), proteção contínua no WebSocket por mensagem, analisador léxico situacional com janela curta de histórico (`SituationalContext`), validação de sintaxe Python via `ast.parse()` antes de alegações de conclusão de tarefas, e suíte multi-turn de tortura comportamental com cálculo de métricas de qualidade.

**Tech Stack:** Python 3.12+, FastAPI, asyncpg, psycopg, Pydantic v2, pytest, AST module.

**Spec:** [`docs/superpowers/specs/2026-10-09-charlie-auditoria-correcoes-design.md`](file:///C:/Users/lucas/OneDrive/Documentos/assistente/docs/superpowers/specs/2026-10-09-charlie-auditoria-correcoes-design.md)

## Global Constraints
- Ambiente de execução: Microsoft Windows com PowerShell (sem comandos Unix/bash).
- Execução de testes exclusivamente com `.venv\Scripts\pytest` ou `uv run pytest`.
- Todos os arquivos lidos e gravados estritamente em UTF-8.
- Chaves de cache com escopo inequívoco por identidade (`user_id:resource_id`).
- Proibição de declarar que testes foram executados sem evidência tangível de execução.
- Nenhuma resposta com deboche, hostilidade passivo-agressiva ou julgamento de utilidade da conversa.

## Review Focus
1. Condição de corrida em `session_id` concorrente: consulta atômica garante que requisição não associe mensagem se a titularidade não coincidir.
2. Mensagem espúria no WebSocket com `session_id` alheio: rejeitada por mensagem, sem confiar apenas no handshake inicial.
3. Falso positivo de frustração: frases técnicas neutras como *"esse teste não funciona ainda"* não são tratadas como irritação do usuário.
4. Despedida simples com *"tchau"*: respondida com brevidade e simpatia natural, sem ironias.
5. Arquivo Python com erro de sintaxe: `_verify_code` falha determinísticamente com `ast.parse` e impede a alegação de conclusão.

---

### Task 1: Isolamento Multi-Tenant Atômico na Persistência e Rotas de Chat

**Files:**
- Modify: `api/services/chat_persistence.py:80-240,470-530`
- Modify: `api/routes/chat.py:80-265,410-440`
- Test: `tests/torture/test_security.py`

**Interfaces:**
- Consumes: `pool: asyncpg.Pool`, `session_id: str`, `user_id: str`
- Produces: `ensure_session_record(pool, session_id, user_id, ...) -> str` (falha/rejeita se sessão já pertencer a outro usuário), `load_chat_history(pool, session_id, user_id=...) -> list[dict]` (com filtro atômico de titularidade).

- [ ] **Step 1: Escrever teste de falha para IDOR em `load_chat_history` e `_prepare_session_and_store_user_message`**

No arquivo `tests/torture/test_security.py`, criar `test_sec_40_atomic_session_ownership_enforcement` simulando Usuário A criando sessão e Usuário B tentando ler histórico ou gravar mensagens na mesma sessão.

- [ ] **Step 2: Executar teste para verificar que falha antes da correção**

Run: `.venv\Scripts\pytest tests/torture/test_security.py -k test_sec_40 -v`  
Expected: FAIL com acesso indevido permitido ou ausência de validação de titularidade.

- [ ] **Step 3: Implementar validação atômica de titularidade em `api/services/chat_persistence.py`**

Modificar:
1. `ensure_session_record`: Se a sessão já existir e `existing["user_id"]` não for nulo nem igual a `str(user_id)` (nem corresponder ao email), lançar `PermissionError("Acesso negado: esta conversa pertence a outro usuário.")`.
2. `load_chat_history`: Receber parâmetro opcional `user_id: Optional[str] = None`. Se fornecido, consultar:
   `SELECT role, content FROM public.chat_messages WHERE session_id = $1 AND user_id = $2 AND role IN ('user', 'assistant') ORDER BY created_at ASC`.
   Se a sessão em `public.chat_sessions` pertencer a outro usuário, retornar lista vazia.
3. `save_chat_message_record`: Validar que `session_id` pertence ao `user_id` antes da inserção.

- [ ] **Step 4: Implementar verificação de titularidade por requisição e no WebSocket em `api/routes/chat.py`**

Modificar:
1. `_prepare_session_and_store_user_message`: Capturar `PermissionError` de `ensure_session_record` e retornar `HTTPException(status_code=403, detail="Acesso negado: esta conversa pertence a outro usuário.")`.
2. `chat_post` e `chat_stream_sse`: Passar `user_id=str(user["id"])` para `_load_thread_history`.
3. No handler WebSocket `chat_ws`: No evento `msg_type == "chat"`, validar que o `thread_id` fornecido pertence a `ws_user["id"]`. Se pertencer a outro usuário, enviar `{"type": "error", "data": {"error": "Acesso negado a esta conversa."}}` e não executar pipeline.

- [ ] **Step 5: Executar teste para verificar que passa**

Run: `.venv\Scripts\pytest tests/torture/test_security.py -k test_sec_40 -v`  
Expected: PASS

- [ ] **Step 6: Commit das alterações**

```bash
git add api/services/chat_persistence.py api/routes/chat.py tests/torture/test_security.py
git commit -m "fix(security): atomic session ownership enforcement in persistence and chat routes"
```

---

### Task 2: Isolamento de Identidade em Caches e Memória Semântica

**Files:**
- Modify: `brain/personality/user_model.py:150-220`
- Modify: `memory/retrieval/retriever.py:15-75`
- Modify: `memory/database.py:170-220`
- Test: `tests/torture/test_security.py`

**Interfaces:**
- Consumes: `user_id: str`
- Produces: Cache particionado por `user_id:resource_id`, garantia de que `get_summary_context` não vaza memórias para `default` quando houver usuário autenticado.

- [ ] **Step 1: Escrever teste de falha para partição de cache e isolamento de RAG**

Criar `test_sec_41_user_model_cache_and_rag_isolation` em `tests/torture/test_security.py`.

- [ ] **Step 2: Executar teste para verificar falha**

Run: `.venv\Scripts\pytest tests/torture/test_security.py -k test_sec_41 -v`  
Expected: FAIL

- [ ] **Step 3: Implementar particionamento de cache em `UserModelManager` e escopo em `MemoryRetriever`**

1. Em `brain/personality/user_model.py`: Garantir que `_cache` use chave composta `f"user:{user_id}"` e adicionar método `invalidate_user(user_id: str)`.
2. Em `memory/retrieval/retriever.py`: Exigir `user_id` explícito; se ausente, resolver via `current_user_id_var.get()`. Se não autenticado, não vazar memórias privadas de terceiros.
3. Em `memory/database.py`: Garantir que `search_memories` e `get_all_facts` filtrem estritamente por `user_id`.

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `.venv\Scripts\pytest tests/torture/test_security.py -k test_sec_41 -v`  
Expected: PASS

- [ ] **Step 5: Commit das alterações**

```bash
git add brain/personality/user_model.py memory/retrieval/retriever.py memory/database.py tests/torture/test_security.py
git commit -m "fix(security): partition user_model cache and memory retriever by explicit identity"
```

---

### Task 3: Módulo de Calibração Situacional de Tom (`SituationalContext`)

**Files:**
- Create: `brain/personality/situational_tone.py`
- Test: `tests/test_situational_tone.py`

**Interfaces:**
- Produces: `SituationalContext`, `analyze_situational_context(user_text: str, recent_history: Optional[list[dict]] = None, repeated_failures: int = 0, explicit_tone_pref: Optional[str] = None) -> SituationalContext`

- [ ] **Step 1: Escrever teste unitário para o classificador situacional de tom**

Criar `tests/test_situational_tone.py` cobrindo:
1. Despedida neutra ("tchau", "até mais", "boa noite").
2. Frustração técnica ("de novo esse erro? não aguento mais").
3. Falso positivo ("esse teste não funciona ainda; vamos investigar").
4. Pedido explícito de seriedade ("seja sério, foco aqui").
5. Pedido explícito de zoeira ("pode zoar").
6. Pergunta factual/política ("quem venceu a eleição em 2024?").
7. Usuário apontando erro ("você errou a porta do servidor").

- [ ] **Step 2: Executar teste para verificar falha (módulo inexistente)**

Run: `.venv\Scripts\pytest tests/test_situational_tone.py -v`  
Expected: FAIL com ImportError

- [ ] **Step 3: Implementar `brain/personality/situational_tone.py`**

Implementar:
1. Dataclass `SituationalContext` com campos desacoplados:
   - `tone_mode`: "serious" | "playful" | "supportive" | "balanced"
   - `sarcasm_allowed`: bool
   - `teasing_allowed`: bool
   - `is_farewell`: bool
   - `is_frustrated`: bool
   - `is_factual_query`: bool
   - `is_user_correction`: bool
   - `repeated_failure_count`: int
   - `explicit_tone_request`: Optional[str]
   - `confidence`: float
2. Função `analyze_situational_context`:
   - Limitar análise a `recent_history[-2:]` para custo e latência previsíveis.
   - Aplicar a hierarquia de 4 níveis de prioridade.
   - Em caso de ambiguidade, selecionar conservadoramente `"balanced"`.
3. Método `to_prompt_guidelines(self) -> str` gerando micro-diretrizes compactas sem inflar o prompt.

- [ ] **Step 4: Executar testes unitários do classificador**

Run: `.venv\Scripts\pytest tests/test_situational_tone.py -v`  
Expected: PASS com 100% de cobertura nos cenários léxicos.

- [ ] **Step 5: Commit do módulo de calibração situacional**

```bash
git add brain/personality/situational_tone.py tests/test_situational_tone.py
git commit -m "feat(personality): situational tone classifier with multi-level priority hierarchy"
```

---

### Task 4: Injeção de Diretrizes Anti-Hostilidade e Respeito no Prompt do Sistema

**Files:**
- Modify: `brain/prompts/prompts.py:10-75,130-190`
- Modify: `core/pipeline.py:200-225`
- Test: `tests/test_prompts.py`

**Interfaces:**
- Consumes: `analyze_situational_context` de `brain/personality/situational_tone.py`
- Produces: `build_system_prompt` enriquecido com diretrizes situacionais compactas, eliminando respostas defensivas, passivo-agressivas ou zombarias a despedidas.

- [ ] **Step 1: Escrever teste de asserção de diretrizes situacionais no prompt**

Criar/expandir teste em `tests/test_prompts.py` verificando que:
1. "tchau" gera diretriz explícita de despedida calorosa e breve, sem deboche.
2. "de novo esse erro?" suspende sarcasmo (`sarcasm_allowed = False`) e injeta postura resolutiva.
3. Pedido de seriedade injeta proibição estrita de piadas.

- [ ] **Step 2: Executar teste para verificar falha**

Run: `.venv\Scripts\pytest tests/test_prompts.py -v`  
Expected: FAIL

- [ ] **Step 3: Integrar `SituationalContext` em `build_system_prompt`**

1. Em `brain/prompts/prompts.py`:
   - Chamar `analyze_situational_context(user_text, ...)`
   - Injetar o bloco `situational_context.to_prompt_guidelines()` com destaque na hierarquia de prioridades.
   - Adicionar regras claras sobre despedidas neutras, admissão de erros confirmados e tratamento sério de temas factuais/políticos.
2. Em `core/pipeline.py`:
   - Passar histórico recente para `build_system_prompt` para alimentar o classificador situacional.

- [ ] **Step 4: Executar testes de prompt para verificar aprovação**

Run: `.venv\Scripts\pytest tests/test_prompts.py -v`  
Expected: PASS

- [ ] **Step 5: Commit da integração de prompt**

```bash
git add brain/prompts/prompts.py core/pipeline.py tests/test_prompts.py
git commit -m "feat(prompts): integrate situational tone guidelines and anti-hostility directives"
```

---

### Task 5: Validação Determinística de Código com AST no Verifier

**Files:**
- Modify: `brain/agent/verifier.py:115-145`
- Test: `tests/test_verifier.py`

**Interfaces:**
- Consumes: `tool_result: str`, `task.arguments: dict`
- Produces: `Verifier._verify_code(task, tool_result, criteria) -> Tuple[bool, TaskEvidence]` com verificação sintática via `ast.parse` para arquivos `.py` e checagem de erros.

- [ ] **Step 1: Escrever teste para validação de sintaxe Python e taxonomia de código**

Criar teste em `tests/test_verifier.py` testando:
1. Arquivo Python com código válido passa.
2. Arquivo Python com `SyntaxError` (ex: parêntese não fechado) falha no `Verifier` com detalhes do erro (linha e coluna).
3. Distinção de taxonomia: arquivo criado não tem evidência de teste aprovado sem execução real.

- [ ] **Step 2: Executar teste para verificar falha**

Run: `.venv\Scripts\pytest tests/test_verifier.py -v`  
Expected: FAIL

- [ ] **Step 3: Implementar validação sintática determinística em `brain/agent/verifier.py`**

Modificar `_verify_code` e `_verify_file`:
1. Identificar se o alvo ou argumento é um script Python (`.py`).
2. Se houver código gerado no arquivo em disco ou em `arguments.content`, executar `ast.parse(code_content)`.
3. Em caso de `SyntaxError`, registrar `passed = False` com `summary = f"Erro de sintaxe Python na linha {e.lineno}, coluna {e.offset}: {e.msg}"`.
4. Registrar evidência real de validação com nome do arquivo, hash e resultado.

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `.venv\Scripts\pytest tests/test_verifier.py -v`  
Expected: PASS

- [ ] **Step 5: Commit do validador AST**

```bash
git add brain/agent/verifier.py tests/test_verifier.py
git commit -m "feat(verifier): deterministic AST syntax validation and tangible code evidence"
```

---

### Task 6: Quebra de Ciclo de Repetições e Pivot Material de Estratégia no Reflector

**Files:**
- Modify: `brain/agent/reflector.py:65-170`
- Modify: `brain/agent/failure_memory.py:20-60`
- Test: `tests/test_reflector.py`

**Interfaces:**
- Consumes: `task: TaskNode`, `raw_error: str`, `failure_memory: FailureMemory`
- Produces: `CorrectionPlan` com limite estrito de 2 falhas por estratégia, bloqueando variações cosméticas e forçando `switch_strategy` ou diagnóstico transparente.

- [ ] **Step 1: Escrever teste de quebra de loop e pivot de estratégia**

Criar teste em `tests/test_reflector.py` testando que:
1. Na primeira falha, prescreve correção da hipótese 1.
2. Na segunda falha com mesma abordagem, o contador atinge 2.
3. Na tentativa seguinte, o Reflector bloqueia repetição cosmética da hipótese 1 e exige mudança material de estratégia ou diagnóstico transparente.

- [ ] **Step 2: Executar teste para verificar falha**

Run: `.venv\Scripts\pytest tests/test_reflector.py -v`  
Expected: FAIL

- [ ] **Step 3: Implementar rastreamento de hipóteses e pivot no `ReflectorAgent`**

1. Em `brain/agent/failure_memory.py`: Adicionar rastreamento de hipóteses por assinatura semântica (evitando que variações de espaço ou aspas burlem o detector de loop).
2. Em `brain/agent/reflector.py`:
   - Após 2 falhas na mesma hipótese: `action = "switch_strategy"`.
   - Se nenhuma estratégia alternativa material estiver disponível: retornar `action = "abort"` com diagnóstico detalhado (o que foi tentado, o que revelou, evidências e o que resta investigar para o usuário).

- [ ] **Step 4: Executar teste para verificar aprovação**

Run: `.venv\Scripts\pytest tests/test_reflector.py -v`  
Expected: PASS

- [ ] **Step 5: Commit da recuperação baseada em evidências**

```bash
git add brain/agent/reflector.py brain/agent/failure_memory.py tests/test_reflector.py
git commit -m "feat(reflector): 2-attempt hypothesis limit, material strategy pivot and transparent diagnostics"
```

---

### Task 7: Suíte Completa de Testes de Regressão Comportamental (`BEH-01` a `BEH-12`)

**Files:**
- Create: `tests/torture/test_behavioral.py`
- Modify: `tests/torture/runner.py:1-120`
- Test: `tests/torture/test_behavioral.py`

**Interfaces:**
- Consumes: Todos os módulos atualizados (`situational_tone`, `verifier`, `chat_persistence`, `prompts`)
- Produces: 12 cenários automatizados reproduzíveis avaliando sequências de diálogo, verificando comportamentos esperados e ausência estrita de comportamentos proibidos, integrados ao relatório de métricas.

- [ ] **Step 1: Escrever o módulo `tests/torture/test_behavioral.py`**

Implementar os 12 casos estruturados:
- `test_beh_01_simple_farewell_warm_and_brief`
- `test_beh_02_consensual_banter_friendly_complicity`
- `test_beh_03_technical_frustration_suppresses_sarcasm`
- `test_beh_04_code_repeated_error_pivots_strategy`
- `test_beh_05_user_correction_acknowledged_honestly`
- `test_beh_06_political_and_real_world_respectful_handling`
- `test_beh_07_factual_recent_information_honesty`
- `test_beh_08_multi_tenant_isolation_in_depth`
- `test_beh_09_casual_conversation_no_forced_commands`
- `test_beh_10_explicit_seriousness_request_honored`
- `test_beh_11_technical_negative_not_misclassified_as_frustration`
- `test_beh_12_code_generation_does_not_claim_unexecuted_tests`

- [ ] **Step 2: Executar a suíte de testes comportamentais**

Run: `.venv\Scripts\pytest tests/torture/test_behavioral.py -v`  
Expected: PASS para os 12 cenários.

- [ ] **Step 3: Integrar a suíte comportamental no orquestrador `tests/torture/runner.py`**

Adicionar a execução de `tests/torture/test_behavioral.py` ao runner consolidado, calculando as métricas de qualidade:
- Taxa de adaptação de tom (meta: 100%)
- Taxa de hostilidade residual (meta: 0%)
- Taxa de afirmações verificadas (meta: 100%)
- Índice de isolamento multi-tenant (meta: 100%)

- [ ] **Step 4: Executar o runner consolidado**

Run: `.venv\Scripts\python.exe -m tests.torture.runner`  
Expected: 81 cenários executados com 100% de confiabilidade e 0 violações de segurança/conduta.

- [ ] **Step 5: Commit da suíte comportamental**

```bash
git add tests/torture/test_behavioral.py tests/torture/runner.py
git commit -m "feat(testing): behavioral torture test suite with 12 multi-turn scenarios and quality metrics"
```

---

### Task 8: Verificação de Regressão Global e Consolidação da Documentação

**Files:**
- Modify: `docs/security/INVENTARIO_RISCOS_E_COBERTURA.md`
- Test: Suite completa do repositório (`pytest tests/`)

- [ ] **Step 1: Rodar a suíte global de testes do Charlie**

Run: `.venv\Scripts\pytest tests/ -v`  
Expected: Todos os testes (áudio, TTS, STT, voz, aceitação, core, segurança e comportamentais) passando sem regressões.

- [ ] **Step 2: Atualizar o Inventário Centralizado com a matriz comportamental e de isolamento**

Atualizar `docs/security/INVENTARIO_RISCOS_E_COBERTURA.md` documentando os novos cenários `BEH-01` a `BEH-12` e `SEC-40` a `SEC-41`.

- [ ] **Step 3: Commit final da auditoria e plano de correções**

```bash
git add docs/security/INVENTARIO_RISCOS_E_COBERTURA.md
git commit -m "docs: consolidacao do inventario de riscos com cenarios comportamentais e isolamento multi-tenant"
```
