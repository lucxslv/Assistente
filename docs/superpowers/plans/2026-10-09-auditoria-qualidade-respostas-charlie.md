# Plano de Implementação: Auditoria e Correção Sistêmica de Qualidade das Respostas do Charlie

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar definitivamente a mutilação de código por regex, instituir imutabilidade da resposta do modelo, implementar verificação técnica estritamente baseada em evidências do sistema, padronizar contratos de eventos/widgets com fallback resiliente e endurecer privacidade/controle de acesso.

**Architecture:** 
1. `core/message_parser.py` e `core/pipeline.py`: Imutabilidade da resposta textual do modelo e substituição de regexes destrutivas por um parser com estado para metadados internos conhecidos.
2. `brain/agent/verifier.py`: Sistema determinístico de verificação em duas dimensões (`check_type` e `status`) com evidências físicas associadas ao hash SHA-256 do arquivo.
3. `brain/prompts/prompts.py`: Diretrizes inegociáveis de honestidade técnica e paridade 1:1 entre código e explicações.
4. `mobile/src/components/widgets/WidgetRegistry.tsx` e `mobile/src/types/chat.ts`: Contrato de conteúdo estruturado com fallback textual determinístico e tratamento de `embedded_widget_unavailable` com Error Boundary.
5. `api/services/audit_service.py` e `api/routes/admin.py`: Controle de acesso estrito no servidor, sanitização anti-log injection e pseudonimização de PII em logs operacionais.
6. `tests/test_code_integrity_repro.py` e `tests/test_property_integrity.py`: Suíte de reprodução e property-based testing cobrindo stream e batch.

**Tech Stack:** Python 3.12+, FastAPI, asyncpg, Pydantic v2, pytest, React 19 / React Native, TypeScript.

**Spec:** Auditoria e correção de qualidade das respostas do Charlie (09/10/2026).

## Global Constraints

- Ambiente de execução estritamente Windows com PowerShell (sem comandos Unix/bash).
- Execução de scripts Python e testes via `.venv\Scripts\python.exe` ou `.venv\Scripts\pytest`.
- Todos os arquivos criados e editados gravados estritamente em UTF-8.
- Resposta bruta do modelo tratada como imutável para conteúdo de usuário, código e Markdown.
- Proibição de aprovações fictícias de testes sem evidência concreta (comando + exit code 0 + logs reais).
- Respeito integral ao Checklist de Aceitação de 8 itens.

## Review Focus

1. **TypeScript Generics & Unions:** Preservação estrita de `Record<string, unknown>`, `Promise<Result<T, E>>` e `export type Result = | { ok: true; value: T } | { ok: false; error: E }` tanto no streaming quanto no `done` e no banco de dados.
2. **Propriedades JSON:** Preservação de campos `{ name: "...", action: "..." }` sem remoção arbitrária por regex.
3. **Honestidade de Verificação:** Se nenhuma ferramenta de teste for executada, o sistema classifica como `NOT_EXECUTED` e o Charlie nunca alega aprovação.
4. **Resiliência de Widgets:** Ocorrência de `embedded_widget_unavailable` ou exceção no renderer nunca bloqueia o chat e exibe o `fallbackText` correspondente.
5. **Privacidade e Isolamento:** E-mails e IPs mascarados em logs de terminal/exportação e isolamento multi-tenant intransponível com autorização server-side.

---

### Task 1: Congelar os Casos de Falha e Criar Testes de Reprodução (RED)

**Files:**
- Create: `tests/test_code_integrity_repro.py`
- Test: `tests/test_code_integrity_repro.py`

**Interfaces:**
- Produces: Testes automatizados reproduzindo os 6 defeitos relatados:
  1. Mutilação de `Record<string, unknown>` virando `Record`.
  2. Mutilação de `Result<T, E>` virando `Result`.
  3. Mutilação de `Promise<Record<...>>` virando `Promise>`.
  4. Mutilação de `export type Result<T, E> = |` virando união quebrada.
  5. Deleção indevida de blocos JSON com `"name"` e `"action"`.
  6. Afirmações falsas de compilação/teste quando nenhuma ferramenta foi chamada.

- [ ] **Step 1: Escrever testes de reprodução de mutilação em `tests/test_code_integrity_repro.py`**
- [ ] **Step 2: Executar testes para capturar a falha da implementação atual (RED)**
  Run: `.venv\Scripts\pytest tests/test_code_integrity_repro.py -v`
  Expected: FAIL demonstrando os defeitos da regex atual.
- [ ] **Step 3: Commit dos testes de reprodução**
  ```bash
  git add tests/test_code_integrity_repro.py
  git commit -m "test: reproduce pipeline code mutilation and unverified claims defects"
  ```

---

### Task 2: Integridade do Pipeline e Parser Estruturado de Metadados (GREEN)

**Files:**
- Create: `core/message_parser.py`
- Modify: `core/pipeline.py:425-448`
- Test: `tests/test_code_integrity_repro.py`

**Interfaces:**
- Produces:
  - `MessageParser`: Parser com estado que extrai apenas tags internas conhecidas (`<internal_thought>`), mantendo o conteúdo de usuário, Markdown e código TypeScript/HTML/JSON 100% íntegro e imutável.
  - Eliminação de `re.sub(r'<[^>]+>', '', final_reply)` e remoção de filtros destrutivos de `"name"` e `"action"`.
  - Garantia de que o conteúdo do streaming acumulado e o payload do evento `done` transmitam a versão canônica idêntica.

- [ ] **Step 1: Implementar `core/message_parser.py` com parser com estado para metadados internos**
- [ ] **Step 2: Refatorar o pós-processamento de `run_pipeline_stream` em `core/pipeline.py`**
- [ ] **Step 3: Executar `tests/test_code_integrity_repro.py` para verificar aprovação (GREEN)**
  Run: `.venv\Scripts\pytest tests/test_code_integrity_repro.py -v`
  Expected: PASS para os testes de integridade de código.
- [ ] **Step 4: Commit da integridade do pipeline**
  ```bash
  git add core/message_parser.py core/pipeline.py
  git commit -m "fix(pipeline): replace destructive regex with immutable content parser preserving generics and JSON"
  ```

---

### Task 3: Verificação Baseada em Evidências e Prompting de Honestidade Técnica

**Files:**
- Modify: `brain/agent/verifier.py`
- Modify: `brain/prompts/prompts.py`
- Test: `tests/test_verifier_evidence.py`

**Interfaces:**
- Produces:
  - `VerificationCheckType` (Enum: `NONE`, `STATIC_ANALYSIS`, `COMPILATION`, `TEST_SUITE`, `MANUAL_EXECUTION`)
  - `VerificationStatus` (Enum: `NOT_EXECUTED`, `PASSED`, `FAILED`, `TOOL_ERROR`)
  - `VerificationEvidence`: dataclass contendo `check_type`, `status`, `command`, `exit_code`, `duration_ms`, `target_file_hash`, `logs`, `evidence_id`.
  - Invalidação automática de evidência quando o hash do arquivo no disco não corresponder à versão auditada.
  - Injeção no `system_prompt` da diretriz inegociável de honestidade técnica e paridade explicativa.

- [ ] **Step 1: Escrever teste em `tests/test_verifier_evidence.py` para evidências e invalidação por hash**
- [ ] **Step 2: Implementar modelo de duas dimensões e associação de hash em `brain/agent/verifier.py`**
- [ ] **Step 3: Injetar regras de honestidade técnica e autocontenção em `brain/prompts/prompts.py`**
- [ ] **Step 4: Executar testes de verificação**
  Run: `.venv\Scripts\pytest tests/test_verifier_evidence.py -v`
  Expected: PASS.
- [ ] **Step 5: Commit do verificador e diretrizes de prompt**
  ```bash
  git add brain/agent/verifier.py brain/prompts/prompts.py tests/test_verifier_evidence.py
  git commit -m "feat(verifier): evidence-based verification with hash invalidation and technical honesty prompts"
  ```

---

### Task 4: Contrato Único de Widgets com Fallback Obrigatório e Resiliência

**Files:**
- Modify: `mobile/src/types/chat.ts`
- Modify: `mobile/src/components/widgets/WidgetRegistry.tsx`
- Modify: `shared/types/chat.ts`
- Modify: `core/streaming.py`
- Test: `tests/test_widget_contract.py`

**Interfaces:**
- Produces:
  - Contrato `StructuredContent<T>` com `fallbackText` determinístico obrigatório.
  - Suporte ao tipo `embedded_widget_unavailable` em `WidgetRegistry.tsx`.
  - `WidgetErrorBoundary`: se o componente de widget falhar ou lançar exceção no React, exibe o `fallbackText` permitindo continuidade fluida da conversa.
  - Validação estrita de schema de payload antes de tentar renderizar.

- [ ] **Step 1: Escrever teste de contrato de widgets e fallback em `tests/test_widget_contract.py`**
- [ ] **Step 2: Atualizar os contratos de tipos em `mobile/src/types/chat.ts` e `shared/types/chat.ts`**
- [ ] **Step 3: Implementar tratamento de `embedded_widget_unavailable` e Error Boundary em `mobile/src/components/widgets/WidgetRegistry.tsx`**
- [ ] **Step 4: Garantir emissão de fallback determinístico no backend**
- [ ] **Step 5: Executar testes de contrato de widgets**
  Run: `.venv\Scripts\pytest tests/test_widget_contract.py -v`
  Expected: PASS.
- [ ] **Step 6: Commit do contrato de widgets e fallback resiliente**
  ```bash
  git add mobile/src/types/chat.ts mobile/src/components/widgets/WidgetRegistry.tsx shared/types/chat.ts core/streaming.py tests/test_widget_contract.py
  git commit -m "feat(widgets): structured content contract with mandatory fallbackText and error boundary"
  ```

---

### Task 5: Endurecimento de Privacidade, Controle de Acesso e Sanitização de Logs

**Files:**
- Create: `api/services/privacy.py`
- Modify: `api/services/audit_service.py`
- Modify: `api/routes/admin.py`
- Test: `tests/test_privacy_and_access_control.py`

**Interfaces:**
- Produces:
  - Funções puras em `api/services/privacy.py`: `mask_email(email)`, `mask_ip(ip)`, `sanitize_log_message(msg)` (anti-log injection, remoção de `\r` e `\n`).
  - Mascaramento de dados em logs operacionais de terminal e exportação de auditoria.
  - Testes negativos de isolamento multi-tenant garantindo que nenhuma requisição ou exportação vaze dados entre contas.

- [ ] **Step 1: Escrever testes de controle de acesso e mascaramento de PII em `tests/test_privacy_and_access_control.py`**
- [ ] **Step 2: Implementar módulo de privacidade e sanitização `api/services/privacy.py`**
- [ ] **Step 3: Integrar sanitização e mascaramento em `audit_service.py` e `admin.py`**
- [ ] **Step 4: Executar testes de privacidade**
  Run: `.venv\Scripts\pytest tests/test_privacy_and_access_control.py -v`
  Expected: PASS.
- [ ] **Step 5: Commit do endurecimento de privacidade e controle de acesso**
  ```bash
  git add api/services/privacy.py api/services/audit_service.py api/routes/admin.py tests/test_privacy_and_access_control.py
  git commit -m "feat(security): pii masking, anti-log injection, and strict multi-tenant access control"
  ```

---

### Task 6: Testes de Propriedades, Regressão Ponta a Ponta e Validação Global

**Files:**
- Create: `tests/test_property_integrity.py`
- Modify: `tests/torture/runner.py`
- Test: Suíte completa (`pytest tests/ -v` e `python -m tests.torture.runner`)

**Interfaces:**
- Produces:
  - Property-based testing verificando que qualquer combinação de código, delimitadores, generics, JSON e Markdown preserva 100% de integridade entre entrada bruta, stream, buffer e persistência.
  - Verificação rigorosa dos 8 itens do Checklist de Aceitação:
    * 1. Defeito original reproduzido antes da correção.
    * 2. Correção do pipeline preserva exemplos antes mutilados.
    * 3. Conteúdo transmitido, exibido e persistido consistente.
    * 4. Verificação técnica sem aprovações fictícias.
    * 5. Falhas de widgets com fallback funcional.
    * 6. Isolamento multi-tenant rejeitando acesso não autorizado.
    * 7. Suíte global executada com evidências reais.
    * 8. Relatório final discriminando status real.

- [ ] **Step 1: Implementar `tests/test_property_integrity.py` cobrindo stream e batch**
- [ ] **Step 2: Executar a suíte de propriedades e regressão**
  Run: `.venv\Scripts\pytest tests/test_property_integrity.py -v`
  Expected: PASS.
- [ ] **Step 3: Executar a suíte global de testes do repositório**
  Run: `.venv\Scripts\pytest tests/ -v`
  Expected: 100% de aprovação.
- [ ] **Step 4: Executar o Orquestrador Central Master**
  Run: `.venv\Scripts\python.exe -m tests.torture.runner`
  Expected: 100/100 cenários aprovados, 0 incidentes.
- [ ] **Step 5: Commit final da suíte de propriedades e integração**
  ```bash
  git add tests/test_property_integrity.py tests/torture/runner.py
  git commit -m "test: property-based integrity suite and master verification runner"
  ```
