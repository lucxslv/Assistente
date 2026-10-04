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
- **Função:** Aplicação nativa para Windows com baixa latência, integração profunda com Win32, atalhos globais, visualização de código e terminal integrado.
- **Execução:** Execute `run_desktop.bat` na raiz ou `cd desktop && npm run tauri dev`.

### 🌐 Web Chat (`web-chat/`)
- **Tecnologias:** React 19 + Vite + TypeScript + Tailwind CSS + Lucide Icons + KaTeX.
- **Função:** Cliente web responsivo, otimizado para mobile (PWA, safe-area insets, sem sobreposição de teclado/gestos).
- **Repositório Conectado:** [`lucxslv/Web-Charlie.git`](https://github.com/lucxslv/Web-Charlie.git).
- **Deploy:** Execute `deploy-web.bat` na raiz. A Vercel publica em `https://web-charlie.vercel.app`.

### 🚀 Landing Page (`landing/`)
- **Tecnologias:** HTML5 semântico, CSS moderno, JavaScript vanilla, Design "Clean Technical".
- **Função:** Apresentação institucional das capacidades do Charlie, download do instalador Windows e documentação pública.

---

## 3. Backend e Cérebro Cognitivo

| Módulo | Responsabilidade | Tecnologias Principais |
| :--- | :--- | :--- |
| **`api/`** | Endpoints HTTP/REST, SSE streaming e WebSockets para clientes. Ponto de entrada do deploy serverless da Vercel (`api/index.py`). | FastAPI, Uvicorn, Asyncpg |
| **`core/`** | Orquestração do pipeline de turnos de diálogo, loop de voz contínuo e streaming de tokens. | Python Asyncio |
| **`brain/`** | Extração de fatos semânticos e consolidação de preferências na memória do usuário em segundo plano. | Gemini API, Prompt Engineering |
| **`memory/`** | Gerenciamento de vetores de embedding (`text-embedding-004`), buscas semânticas por similaridade e conexão com Supabase/PostgreSQL. | Supabase, pgvector, SQLAlchemy |
| **`providers/`** | Camada agnóstica de inteligência artificial permitindo alternar facilmente entre modelos. | Google Gemini, OpenAI, Groq, Ollama, OpenRouter |
| **`tools/`** | Ferramentas executáveis pelo agente (busca web, controle do Windows, reprodutor de mídia, previsão do tempo, Home Assistant). | Win32 API, DuckDuckGo, PyAutoGUI |
| **`audio/`** | Processamento de fala local: detecção de wake-word ("Charlie"), transcrição (Faster-Whisper) e síntese de voz (Edge-TTS). | Faster-Whisper, OpenWakeWord, Edge-TTS |

---

## 4. Scripts e Governança (`scripts/`)

- **`scripts/db/`**:
  - `inspect_db.py`: Inspeciona o estado das tabelas e quantidade de registros no Supabase.
  - `clean_db.py`: Limpa tabelas legadas ou dados corrompidos de teste.
  - `create_tables.py`: Aplica a criação de tabelas DDL iniciais.
  - `deduplicate_user_memories.py`: Remove memórias semânticas duplicadas.
  - `migrate_tenants.py`: Executa migração de estrutura multi-tenant.
  - `test_timestamptz.py`: Testa validação de colunas com fuso horário no Postgres.
- **`scripts/tests/`**:
  - `test_isolation.py`: Testa isolamento estrito entre usuários e chats.
  - `test_memory_filtering_and_cross_chat.py`: Testa consultas semânticas cross-chat e filtragem de relevância.
  - `test_security_guards.py`: Valida guardrails contra injeção de prompt e vazamento de dados.
- **`scripts/tools/`**:
  - `generate_svg_and_png.py`: Utilitário para gerar logos e ícones em várias resoluções.

---

## 5. Scripts Rápidos de Automação (Raiz)

- **`deploy-web.bat`**: Sincroniza e faz o push imediato da pasta `web-chat` para o repositório `Web-Charlie` na Vercel.
- **`run_desktop.bat`**: Libera as portas 8005 e 1420, inicializa o backend e abre o app Desktop do Tauri.
- **`iniciar_charlie.vbs`**: Inicia o assistente de voz em background sem janela de terminal aberta.
- **`adicionar_ao_startup.bat`**: Registra o atalho do Charlie no Inicializar do Windows.
