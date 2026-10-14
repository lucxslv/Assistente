# Arquitetura e Mapeamento de Módulos — Ecossistema Charlie

Este documento serve como mapa de referência para a organização de pastas, responsabilidades e fluxos de build do projeto Charlie.

---

## 1. Visão Geral da Estrutura

```
assistente/
├── api/                     # Cloud Brain / Backend API (FastAPI, Vercel Serverless)
├── audio/                   # Percepção de Áudio Local (STT, TTS, Wake-Word para Desktop)
├── brain/                   # Consolidação Semântica, Perfil & Memória Contínua
├── core/                    # Loop do Assistente, Pipeline & Gestão de Turnos
├── memory/                  # Adaptadores de Banco de Dados, Embeddings & Vetores
├── providers/               # Provedores de LLM (Gemini, Groq, Ollama, OpenAI, OpenRouter)
├── tools/                   # Ferramentas Extensíveis de Ação (OS, Web, Media, Automação)
├── events/                  # Barramento de Eventos e Gatilhos Assíncronos (Reservado)
├── skills/                  # Habilidades e Workflows Compostos (Reservado)
│
├── desktop/                 # Cliente Nativo Desktop (Tauri 2.0 Rust + React 19)
├── web-chat/                # Cliente Web Standalone (React 19 + Vite -> Vercel Web-Charlie)
├── landing/                 # Landing Page Institucional Estática (HTML/CSS/JS)
│
├── scripts/                 # Scripts Utilitários e de Automação
│   ├── db/                  # Manutenção de banco, migrações e inspeção
│   ├── tests/               # Scripts de teste e validação de segurança
│   └── tools/               # Utilitários de apoio e geração de assets
│
├── docs/                    # Documentação Técnica e Auditorias
│   ├── architecture/        # Mapeamento técnico e decisões arquiteturais
│   └── security/            # Auditorias de segurança, isolamento e multi-tenancy
│
├── archive/                 # Arquivos Históricos e Protótipos Descontinuados
│   ├── legacy_chainlit/     # Protótipo inicial em Chainlit
│   └── debug/               # Scripts temporários de depuração
│
├── deploy-web.bat           # Automação de deploy para https://web-charlie.vercel.app
├── deploy-web.ps1           # Script PowerShell do deploy Web-Charlie
├── run_desktop.bat          # Inicializador unificado do Desktop (API + Tauri)
├── iniciar_charlie.vbs      # Execução oculta em background para Windows
├── adicionar_ao_startup.bat # Configuração de auto-inicialização no Windows
├── vercel.json              # Configuração Serverless do Backend na Vercel
└── pyproject.toml           # Manifesto de dependências e pacotes Python
```

---

## 2. Aplicações e Frontends

### 🖥️ Desktop (`desktop/`)
- **Tecnologias:** Tauri 2.0 (Rust) + React 19 + TypeScript + Tailwind CSS.
- **Função:** Aplicação nativa para Windows com baixa latência, integração profunda com Win32, atalhos globais, pareamento QR/PIN seguro com dispositivos móveis, streaming SSE com cancelamento por `AbortController` e anexos multimodais.
- **Execução:** Execute `run_desktop.bat` na raiz ou `npm --prefix desktop run tauri dev`.

### 🌐 Web Chat (`web-chat/`)
- **Tecnologias:** React 19 + Vite + TypeScript + Tailwind CSS + Lucide Icons + KaTeX.
- **Função:** Cliente web responsivo (Mobile-First / PWA), com redesign Clean Technical, busca por conteúdo, fixação (`pin`) e arquivamento (`archive`) de conversas, anexos estruturados em chips (sem despejo de texto bruto no balão), edição de mensagens com truncamento determinístico, regeneração de resposta, avaliação 👍/👎, syntax highlighting leve (`CodeBlock.tsx`), cards dinâmicos de ferramentas (`ToolCallCard`), modal de edição de perfil (`ProfileModal.tsx`), recuperação de senha e painel administrativo (`AuditDashboard.tsx`).
- **Repositório Conectado:** [`lucxslv/Web-Charlie.git`](https://github.com/lucxslv/Web-Charlie.git).
- **Deploy:** Execute `deploy-web.bat` na raiz (somente mediante autorização). A Vercel publica em `https://web-charlie.vercel.app`.

### 🚀 Landing Page (`landing/`)
- **Tecnologias:** HTML5 semântico, CSS moderno, JavaScript vanilla, Design "Clean Technical".
- **Função:** Apresentação institucional das capacidades do Charlie, download do instalador Windows e documentação pública.

---

## 3. Backend, Segurança e Cérebro Cognitivo

| Módulo | Responsabilidade | Tecnologias Principais |
| :--- | :--- | :--- |
| **`api/`** | Endpoints HTTP/REST (`auth`, `chat`, `threads`, `messages`, `tools`, `settings`, `agent`, `admin`, `pair`, `device`, `voice`, `system`), streaming SSE cancelável ponta a ponta (`/api/chat/stream`, `/api/chat/cancel`), rate limiting e quotas (`api/security/rate_limiter.py`), persistência resiliente (`api/services/chat_persistence.py`) e auditoria/observabilidade (`api/services/audit_service.py`). | FastAPI, Uvicorn, Asyncpg, PyJWT, Bcrypt |
| **`core/`** | Orquestração do pipeline de turnos de diálogo (`core/pipeline.py`), cancelamento cooperativo por `threading.Event`, eventos SSE estruturados (`tool_start`, `tool_end`, `cancelled`, `done`) e fallback automático entre modelos/provedores. | Python Asyncio |
| **`brain/`** | Roteamento inteligente de modelos (`brain/router/router.py` — modos `FAST`, `REASONING`, `AGENTIC`), extração de fatos semânticos (`brain/memory/extractor.py` via `google.genai`) e consolidação de preferências. | Google GenAI SDK (`google-genai`), Prompt Engineering |
| **`memory/`** | Gerenciamento de vetores de embedding (`memory/embeddings.py`), buscas semânticas por similaridade e conexão com Supabase/PostgreSQL. | Supabase, pgvector, Asyncpg |
| **`providers/`** | Camada agnóstica de inteligência artificial com captura de `usage_metadata` real da API e cancelamento cooperativo de threads de streaming (`providers/gemini.py`). | Google Gemini, OpenAI, Groq, Ollama, OpenRouter |
| **`tools/`** | Registro de ferramentas (`tools/registry.py`) com nomes amigáveis (`TOOL_FRIENDLY_NAMES`), execução não-bloqueante (`asyncio.to_thread` + `asyncio.wait_for`), timeouts configuráveis e contrato estruturado de retorno. | Win32 API, DuckDuckGo, PyAutoGUI, Psutil |
| **`audio/`** | Processamento de fala local: detecção de wake-word ("Charlie"), transcrição (Groq Whisper / Faster-Whisper) e síntese de voz (ElevenLabs / Edge-TTS). | Faster-Whisper, OpenWakeWord, Edge-TTS |

---

## 4. Testes Automatizados e Governança (`tests/` e `scripts/`)

- **`tests/` (Suíte Principal `pytest` — 212 testes):**
  - `tests/test_milestone1_security_auth.py`: Autenticação própria, remoção de tokens mágicos, recuperação de senha, rate limiting, bloqueio de IDOR e Stealth Mode administrativo.
  - `tests/test_milestone2_chat_reliability.py`: Máquina de estados de mensagens (`in_progress`, `completed`, `cancelled`, `interrupted`, `failed`, `unknown`), cancelamento ponta a ponta, idempotência por `request_id` e separação de anexos do corpo visual.
  - `tests/test_milestone4_tools_router.py`: Nomes amigáveis e contrato estruturado de ferramentas, roteamento `LLMRouter` e cadeia de fallback.
  - `tests/test_milestone6_admin_observability.py`: Separação de custos reportados pela API vs estimados por heurística, percentis `p50`/`p95`, avaliação 👍/👎, suspensão/reativação de usuários e cotas operacionais.
  - `tests/test_milestone7_e2e_qa_concurrency.py`: Fluxo integrado E2E (conversa, anexo, edição com truncamento, feedback, pin/archive, busca) e isolamento multi-tenant concorrente.
  - `tests/torture/`: Suítes de aceitação, segurança (`test_security.py`), comportamento (`test_behavioral.py`), social (`test_social.py`) e DAG runtime (`test_runtime_core.py`).
- **`scripts/db/`**:
  - `migrate_milestone1_2.py`: Migração não-destrutiva (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`) das tabelas e colunas de autenticação, recuperação de senha, quotas, estado de mensagens, anexos, feedback e auditoria.
  - `inspect_db.py`, `create_tables.py`, `deduplicate_user_memories.py`, `migrate_tenants.py`.

---

## 5. Scripts Rápidos de Automação (Raiz)

- **`deploy-web.bat`**: Sincroniza e faz o push da pasta `web-chat` para o repositório `Web-Charlie` na Vercel.
- **`run_desktop.bat`**: Libera as portas 8005 e 1420, inicializa o backend e abre o app Desktop do Tauri.
- **`iniciar_charlie.vbs`**: Inicia o assistente de voz em background sem janela de terminal aberta.
- **`adicionar_ao_startup.bat`**: Registra o atalho do Charlie no Inicializar do Windows.

