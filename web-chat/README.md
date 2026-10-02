# Charlie Web Chat ⚡

Cliente web de produção standalone, moderno, desacoplado e reativo para o assistente **Charlie**. Construído com **React 19**, **TypeScript**, **Vite** e **Tailwind CSS**.

---

## 🎨 Identidade Visual (Clean Technical)

- **Fundo Neutro Calibrado**: `#0A0B0E` (feed de conversa) e `#0E0F12` (sidebar e docks), com cartões em `#13151A`.
- **Bordas & Divisores Sutis**: Linhas de 1px com `border-white/[0.06]` e `border-white/[0.08]` para alto contraste sem ruído visual.
- **Tipografia Técnica**: `Inter`, `Roboto` e `JetBrains Mono` com suporte a elementos monoespaciais e kbd.
- **Acentos & Glow**: Violeta Charlie (`#8B7CFF`) com brilhos sutis (`shadow-glow`) e indicadores verdes esmeralda (`#10B981`) para status ativo.

---

## 🚀 Funcionalidades Principais

### 1. Sidebar Lateral Inteligente
- **Identificação & Status**: Exibe a marca "Charlie Web v2.0" com indicador de status de conexão em tempo real (Online/Offline com ping automático).
- **Nova Conversa**: Botão de criação rápida com suporte ao atalho global de teclado `[N]`.
- **Histórico Agrupado por Período**:
  - *Hoje*
  - *Ontem*
  - *Últimos 7 dias*
  - *Anteriores*
- **Filtro em Tempo Real**: Campo de busca instantânea no topo da lista.
- **Ações Rápidas**: Renomeação inline e exclusão de conversas com confirmação.
- **Gaveta Responsiva (Drawer)**: Fechamento automático com backdrop blur em telas móveis e tablets.
- **Rodapé de Usuário & Configurações**: Exibe perfil logado (ou modo convidado), botão de configurações e logout.

### 2. Área Central de Conversação
- **Header Minimalista**: Exibe o título da conversa ativa com clique para renomear, indicador de pensamento do modelo (`Pensando` / `Transmitindo`), status de rede e menu de contexto (ações para renomear, exportar em Markdown/JSON, limpar mensagens e excluir conversa).
- **Feed com Autoscroll Inteligente**: Acompanha o streaming token-a-token automaticamente. Se o usuário rolar para cima para ler mensagens anteriores, o scroll é pausado e exibe o botão flutuante **"Rolar para o final ↓"** com contador de mensagens pendentes.
- **Renderização Rica de Markdown**:
  - Tabelas estilizadas em cards (`remark-gfm`).
  - Fórmulas matemáticas LaTeX com **KaTeX** inline e em bloco (`$E=mc^2$` e `$$\sum...$$`).
  - Listas, citações, links seguros e blocos de formatação.
- **Blocos de Código com Destaque & 1-Click Copy**:
  - Cabeçalho técnico com etiqueta da linguagem em caixa alta.
  - Botão de cópia rápida com feedback visual ("Copiar" ➔ "Copiado!").
- **Empty State Técnico**: Sugestões de comandos técnicos para iniciar novas conversas com um clique.

### 3. Prompt Dock (Barra de Entrada)
- **Textarea Auto-expansível**: Cresce suavemente até 180px com scrollbar moderna.
- **Anexos de Arquivos & Imagens**:
  - Upload via botão de clipe.
  - Suporte a **Arrastar e Soltar (Drag & Drop)** direto no dock.
  - Suporte a **Colar Imagens (Ctrl+V)** diretamente da área de transferência.
  - Pré-visualização com miniatura da imagem, nome, tamanho formatado e remoção em 1 clique.
- **Botão de Envio Compacto**: Seta `[ → ]` com estados desabilitado/ativo e botão `[ ■ ]` para interromper o streaming a qualquer momento.
- **Legenda Técnica**: `ENTER PARA ENVIAR • SHIFT+ENTER PARA QUEBRA DE LINHA`.

### 4. Camada de Comunicação com Backend & Estado
- **Cliente Modular HTTP/SSE/WebSocket**:
  - **SSE (Server-Sent Events)**: Endpoint `POST /api/chat/stream` com streaming token-a-token sem travamentos.
  - **WebSocket**: Canal bidirecional `ws://.../api/chat/ws` com keepalive de ping/pong.
  - **REST Síncrono**: Fallback automático caso SSE ou WebSockets estejam indisponíveis.
- **Interceptor de JWT**: Injeção transparente de cabeçalho `Authorization: Bearer <token>`.
- **Resiliência & Fallback Offline**:
  - Cache local em `localStorage` para histórico de conversas e mensagens.
  - Persistência automática de rascunhos (*drafts*) por conversa.
  - Modo Convidado para testes locais instantâneos sem exigir login prévio.
- **Desacoplamento Total**: Não possui dependências do Tauri, rodando perfeitamente em qualquer navegador moderno.

---

## 🛠️ Como Executar Localmente

### Pré-requisitos
- **Node.js** v18+ ou superior
- **npm** ou **pnpm** / **yarn**

### Instalação & Inicialização

```bash
# 1. Acesse o diretório
cd web-chat

# 2. Instale as dependências (já instaladas)
npm install

# 3. Inicie o servidor de desenvolvimento
npm run dev
```

Ou no Windows, basta dar dois cliques no script:
```cmd
run_web.bat
```

O aplicativo estará disponível em:
👉 **`http://localhost:3000`** (ou porta exibida no terminal).

---

## ⚙️ Variáveis de Ambiente (`.env`)

Crie ou edite o arquivo `.env` (baseado em `.env.example`):

```env
# URL da API do Charlie (default: /api ou http://localhost:8005/api)
VITE_CHARLIE_API_URL=/api

# URL do WebSocket (opcional, deduzida automaticamente de VITE_CHARLIE_API_URL)
# VITE_CHARLIE_WS_URL=ws://localhost:8005/api/chat/ws
```

---

## 📦 Build para Produção

Para gerar a build estática otimizada:

```bash
npm run build
```

Os arquivos estáticos serão gerados no diretório `dist/` prontos para deploy no **Vercel**, **Cloudflare Pages**, **Netlify**, **Nginx** ou como ativos estáticos servidos pelo FastAPI.

---

## 🏛️ Estrutura de Diretórios

```
web-chat/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── run_web.bat
├── public/
│   └── charlie-logo.svg
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── types/
    │   ├── chat.ts
    │   ├── auth.ts
    │   └── settings.ts
    ├── services/
    │   ├── api.ts              # Cliente HTTP com interceptor JWT
    │   ├── chatStream.ts       # Driver SSE, WebSocket e REST
    │   ├── authService.ts      # Autenticação Supabase / Modo Convidado
    │   ├── threadsService.ts   # CRUD de conversas e mensagens
    │   └── storage.ts          # Gerenciamento de drafts e cache offline
    ├── hooks/
    │   ├── useChat.ts          # State machine principal do chat
    │   ├── useAuth.ts          # Gerenciamento de sessão
    │   ├── useSettings.ts      # Configurações do cliente
    │   └── useAutoScroll.ts    # Autoscroll inteligente
    ├── components/
    │   ├── layout/
    │   │   ├── Header.tsx
    │   │   ├── Sidebar.tsx
    │   │   └── SettingsModal.tsx
    │   ├── chat/
    │   │   ├── MessageFeed.tsx
    │   │   ├── MessageItem.tsx
    │   │   ├── MarkdownRenderer.tsx
    │   │   ├── CodeBlock.tsx
    │   │   ├── PromptDock.tsx
    │   │   ├── FilePreview.tsx
    │   │   └── ScrollToBottomButton.tsx
    │   ├── auth/
    │   │   └── AuthModal.tsx
    │   └── ui/
    │       ├── Button.tsx
    │       ├── Input.tsx
    │       ├── Modal.tsx
    │       └── Badge.tsx
    └── utils/
        ├── cn.ts
        └── formatters.ts
```
