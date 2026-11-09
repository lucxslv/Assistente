# Charlie AI — Ecossistema de Inteligência Pessoal e Operacional

O Charlie é um assistente pessoal completo e ecossistema de inteligência autônoma com execução local profunda no Windows, cérebro em nuvem escalável com memória semântica vetorial contínua e múltiplos clientes (Desktop nativo e Web Chat PWA).

---

## Arquitetura

O repositório está organizado em três pilares principais:

```
assistente/
├── Frontends
│   ├── desktop/                 # Desktop nativo (Tauri 2.0 Rust + React 19)
│   ├── web-chat/                # Web Mobile-First (React 19 + Vite -> Vercel)
│   └── landing/                 # Landing Page institucional (HTML/CSS/JS)
│
├── Backend e Cérebro na Nuvem
│   ├── api/                     # FastAPI, REST, WebSockets, Vercel Serverless
│   ├── core/                    # Engine, Pipeline de turnos e orquestração
│   ├── brain/                   # Consolidação contínua de fatos e perfil do usuário
│   ├── memory/                  # Vetores de embedding, Supabase e PostgreSQL
│   ├── providers/               # Provedores agnósticos (Gemini, Groq, Ollama, OpenAI)
│   ├── tools/                   # Ferramentas extensíveis (SO, Web, Mídia, Automação)
│   └── audio/                   # STT, TTS e Wake-Word local para Windows
│
├── Suporte, Scripts e Governança
│   ├── scripts/
│   │   ├── db/                  # Manutenção de banco, migrações e inspeção
│   │   ├── tests/               # Validações de isolamento e segurança
│   │   └── tools/               # Geração de assets e utilitários
│   ├── docs/
│   │   ├── architecture/        # Mapeamento técnico detalhado (MODULOS.md)
│   │   └── security/            # Auditorias de segurança e conformidade
│   └── archive/                 # Protótipos históricos arquivados (Chainlit)
│
└── Scripts Rápidos (Raiz)
    ├── run_desktop.bat          # Inicializa API + Charlie Desktop em 1 clique
    ├── run_mobile.bat           # Inicializa Metro Bundler (Expo Go) + API
    ├── deploy-web.bat           # Sincroniza e faz deploy na Vercel (Web-Charlie)
    ├── iniciar_charlie.vbs      # Executa assistente em background sem terminal
    └── adicionar_ao_startup.bat # Registra o Charlie na inicialização do Windows
```

Para uma análise completa das responsabilidades e convenções de cada pasta, consulte [`docs/architecture/MODULOS.md`](docs/architecture/MODULOS.md).

---

## Como Executar

### Pré-requisitos
- Python >= 3.12 (com [uv](https://github.com/astral-sh/uv))
- Node.js >= 20 e npm
- Rust e Tauri CLI (apenas para compilar o Desktop nativo)

### Configuração de Ambiente
Copie o modelo e configure suas credenciais:
```bash
cp .env.example .env
```

---

### Charlie Desktop (Tauri + React)
Abra o aplicativo nativo para Windows (API inicia automaticamente na porta 8005):
```cmd
run_desktop.bat
```
Ou manualmente:
```bash
cd desktop
npm run tauri dev
```

---

### Charlie Mobile (React Native + Expo Go)
Abra o aplicativo móvel no smartphone com o **Expo Go**:
```cmd
run_mobile.bat
```
Ou manualmente:
```bash
cd mobile
npm start
```
Escaneie o QR Code exibido no terminal usando o aplicativo **Expo Go** (Android ou iOS).

---

### Charlie Web Chat (Frontend Web Standalone)
Execute o cliente web localmente:
```bash
cd web-chat
npm install
npm run dev
```

**Deploy na Vercel (Repositório `Web-Charlie`):**
Após alterações em `web-chat/`, rode:
```cmd
deploy-web.bat
```
O script isola as alterações via `git subtree` e envia para [`lucxslv/Web-Charlie`](https://github.com/lucxslv/Web-Charlie.git), disparando o build de produção em [https://web-charlie.vercel.app](https://web-charlie.vercel.app).

---

### Charlie Cloud Brain (API Backend)
Para rodar apenas o servidor de API localmente:
```bash
uv run python -m api.main
```
Documentação interativa Swagger em `http://localhost:8005/docs`.

---

## Segurança e Isolamento

O sistema implementa governança de isolamento rigorosa:
- Isolamento multi-tenant por usuário com validação de tokens JWT
- Criptografia e sanitização em tempo real de mensagens de chat
- Memória semântica seletiva (consolidação inteligente apenas de fatos e preferências relevantes)
- Relatório de auditoria completo em [`docs/security/AUDITORIA_SEGURANCA_CHARLIE.md`](docs/security/AUDITORIA_SEGURANCA_CHARLIE.md)

---

## Licença
Projeto pessoal e confidencial. Todos os direitos reservados.
