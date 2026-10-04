# Charlie AI — Ecossistema de Inteligência Pessoal & Operacional

O **Charlie** é um ecossistema completo de assistência pessoal e inteligência autônoma com execução local profunda no Windows, cérebro em nuvem escalável com memória semântica vetorial contínua e múltiplos clientes (Desktop nativo e Web Chat PWA).

---

## 🏗️ Arquitetura do Ecossistema

O repositório está organizado de forma modular em três pilares principais:

```text
assistente/
├── 🖥️ Aplicações / Frontends
│   ├── desktop/                 # Cliente nativo Desktop (Tauri 2.0 Rust + React 19)
│   ├── web-chat/                # Cliente Web Mobile-First (React 19 + Vite -> Vercel)
│   └── landing/                 # Landing Page institucional moderna (HTML/CSS/JS)
│
├── 🧠 Backend & Cloud Brain
│   ├── api/                     # FastAPI, REST, WebSockets, Vercel Serverless
│   ├── core/                    # Engine, Pipeline de turnos e orquestração
│   ├── brain/                   # Consolidação contínua de fatos e perfil do usuário
│   ├── memory/                  # Vetores de embedding, Supabase & PostgreSQL
│   ├── providers/               # Provedores agnósticos (Gemini, Groq, Ollama, OpenAI)
│   ├── tools/                   # Ferramentas extensíveis (OS, Web, Mídia, Automação)
│   └── audio/                   # STT, TTS e Wake-Word local para Windows
│
├── 📁 Suporte, Scripts & Governança
│   ├── scripts/
│   │   ├── db/                  # Manutenção de banco, migrações e inspeção
│   │   ├── tests/               # Validações de isolamento e segurança
│   │   └── tools/               # Geração de assets e utilitários
│   ├── docs/
│   │   ├── architecture/        # Mapeamento técnico detalhado (MODULOS.md)
│   │   └── security/            # Auditorias de segurança e conformidade
│   └── archive/                 # Protótipos históricos arquivados (Chainlit)
│
└── ⚡ Scripts Rápidos (Raiz)
    ├── run_desktop.bat          # Inicializa API + Charlie Desktop em 1 clique
    ├── deploy-web.bat           # Sincroniza e faz deploy na Vercel (Web-Charlie)
    ├── iniciar_charlie.vbs      # Executa assistente em background sem terminal
    └── adicionar_ao_startup.bat # Registra o Charlie na inicialização do Windows
```

Para uma análise completa das responsabilidades e convenções de cada pasta, consulte [`docs/architecture/MODULOS.md`](docs/architecture/MODULOS.md).

---

## 🚀 Como Executar

### 1. Pré-requisitos
- Python >= 3.12 (com [uv](https://github.com/astral-sh/uv) instalado)
- Node.js >= 20 e npm
- Rust & Tauri CLI (apenas se for compilar o Desktop nativo)

### 2. Configuração de Variáveis de Ambiente
Copie o modelo de variáveis e configure suas credenciais:
```bash
cp .env.example .env
```

---

### 🖥️ 3. Charlie Desktop (Tauri + React)
Para abrir o aplicativo nativo para Windows (com a API modular inicializada automaticamente na porta 8005):
```cmd
run_desktop.bat
```
Ou manualmente:
```bash
cd desktop
npm run tauri dev
```

---

### 🌐 4. Charlie Web Chat (Frontend Web Standalone)
Para executar o cliente web localmente:
```bash
cd web-chat
npm install
npm run dev
```

#### Deploy na Vercel (Repositório `Web-Charlie`):
Sempre que fizer alterações na pasta `web-chat/`, basta rodar:
```cmd
deploy-web.bat
```
O script isola as alterações via `git subtree` e envia diretamente para o repositório [`lucxslv/Web-Charlie`](https://github.com/lucxslv/Web-Charlie.git), acionando o build de produção em [https://web-charlie.vercel.app](https://web-charlie.vercel.app).

---

### 🧠 5. Charlie Cloud Brain (API Backend)
Para rodar apenas o servidor de API localmente:
```bash
uv run python -m api.main
```
A API expõe documentação interativa Swagger em `http://localhost:8005/docs`.

---

## 🔒 Segurança e Isolamento

O sistema implementa governança de isolamento rigorosa:
- Isolamento multi-tenant por usuário com validação de tokens JWT.
- Criptografia e sanitização em tempo real de mensagens de chat.
- Memória semântica seletiva (consolidação inteligente apenas de fatos e preferências relevantes).
- Relatório de auditoria completo disponível em [`docs/security/AUDITORIA_SEGURANCA_CHARLIE.md`](docs/security/AUDITORIA_SEGURANCA_CHARLIE.md).

---

## 📄 Licença
Projeto pessoal e confidencial. Todos os direitos reservados.
