# Arquitetura Móvel Expo — Ecossistema Charlie

Este documento descreve a arquitetura técnica, modelo de segurança, protocolos de comunicação e navegação do **Charlie Mobile**, a aplicação móvel desenvolvida com **React Native 0.86**, **Expo SDK 57** e **React 19**.

---

## 1. Visão Geral e Propósito

O **Charlie Mobile** atua como uma extensão móvel do ecossistema Charlie, operando como:
1. **Terminal Conversacional Inteligente:** Interface fluida para interação por texto e streaming com a inteligência do Charlie, permitindo acesso ao histórico de conversas, ferramentas e raciocínio multi-turn.
2. **Controle Remoto Nativo do PC (Windows):** Painel operacional integrado para comandar a máquina física executando o Desktop Charlie (ajuste de volume mestre, teclas de mídia, bloqueio de tela, captura de tela em tempo real e inicialização de aplicativos).
3. **Engine de Rede Dual-Path (LAN / Nuvem):** Conexão prioritária na rede local privada (LAN) para altíssima responsividade e baixíssima latência (≤5ms), com failover transparente para túnel seguro ou nuvem Vercel (`https://assistente-xi.vercel.app/api`).

```
┌────────────────────────────────────────────────────────────────────────┐
│                          CHARLIE MOBILE APP                            │
│                     (Expo SDK 57 / React Native)                       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
             ┌─────────────────────┴─────────────────────┐
             │                                           │
    [ Rota LAN Prioritária ]                    [ Rota WAN Failover ]
   (http://192.168.x.x:8005)                   (Vercel Cloud / Túnel)
             │                                           │
             ▼                                           ▼
┌─────────────────────────┐                 ┌─────────────────────────┐
│     CHARLIE DESKTOP     │                 │   CLOUD RELAY (API)     │
│   (Tauri v2 + Win32)    │◄─── Heartbeat ──┤  (FastAPI Serverless)   │
│   Execução no Windows   │     (Fila WAN)  │  Armazenamento Supabase │
└─────────────────────────┘                 └─────────────────────────┘
```

---

## 2. Estrutura de Diretórios e Módulos

O código da aplicação móvel está concentrado na pasta `mobile/`:

```
mobile/
├── app/                             # File-based Routing (Expo Router)
│   ├── (tabs)/                      # Layout principal em abas inferiores
│   │   ├── _layout.tsx              # Configuração da barra de abas e temas
│   │   ├── index.tsx                # Dashboard / Home com telemetria e status
│   │   ├── charlie.tsx              # Chat conversacional com streaming SSE
│   │   ├── chat.tsx                 # Histórico de conversas (threads)
│   │   └── workspace.tsx            # Centro operacional & DesktopRemotePad
│   ├── _layout.tsx                  # Root Layout (SafeArea, Providers, Storage)
│   ├── pairing.tsx                  # Tela dedicada de pareamento (QR Scanner + PIN)
│   └── ChatScreen.tsx               # Wrapper de tela cheia para sessões de chat
│
├── src/
│   ├── components/                  # Componentes visuais desacoplados
│   │   ├── DesktopRemotePad.tsx     # Pad de controle remoto do Windows
│   │   ├── PairingModal.tsx         # Modal multi-servidor (QR, PIN, Manual, Salvos)
│   │   ├── Screen.tsx               # Container base com safe-area adaptativa
│   │   ├── ConnectionBadge.tsx      # Indicador de status de conexão (LAN / Nuvem)
│   │   ├── MessageItem.tsx          # Renderização de mensagens formatadas
│   │   ├── StreamingMessageBubble.tsx # Balão reativo de streaming de tokens
│   │   └── ChatHistoryModal.tsx     # Modal de gerenciamento de threads
│   │
│   ├── hooks/                       # Hooks customizados com controle de ciclo de vida
│   │   ├── useChatStream.ts         # Consumo resiliente de SSE (/api/chat/stream)
│   │   ├── useServerConnection.ts   # Monitoramento e health check do servidor
│   │   ├── useDeviceConnection.ts   # Telemetria de hardware (CPU/RAM/Bateria)
│   │   ├── useChat.ts               # Gestão de mensagens, histórico e envio
│   │   └── useAuth.tsx              # Contexto de autenticação e sessão
│   │
│   ├── services/                    # Camada de comunicação de rede e persistência
│   │   ├── api.ts                   # Cliente Axios/Fetch com injeção de Bearer Token
│   │   ├── apiClient.ts             # Health check e normalização de URLs
│   │   ├── authStorage.ts           # Persistência segura via expo-secure-store
│   │   ├── desktopControl.ts        # Métodos tipados de controle remoto do Windows
│   │   ├── serverConfig.ts          # Perfis de servidores salvos e comutador ativo
│   │   ├── chat.ts                  # Requisições REST de conversas e mensagens
│   │   └── threads.ts               # CRUD de threads no Supabase via API
│   │
│   ├── types/                       # Interfaces TypeScript estritas
│   │   ├── api.ts                   # Schemas de endpoints, telemetria e respostas
│   │   └── chat.ts                  # Estruturas de mensagem, papéis e streaming
│   │
│   └── lib/                         # Configurações globais e inicialização
│       ├── config.ts                # Constantes e leitura de variáveis de ambiente
│       └── session.ts               # Identificadores de sessão do cliente
│
├── package.json                     # Dependências do Expo SDK 57 e scripts
├── app.json                         # Manifesto Expo e configurações nativas
└── tsconfig.json                    # Configuração estrita do compilador TypeScript
```

---

## 3. Navegação e Arquitetura de Telas

A aplicação utiliza o **Expo Router** com roteamento baseado em arquivos:

### 3.1. Abas Principais (`app/(tabs)/`)

| Aba | Rota | Responsabilidade Principal |
| :--- | :--- | :--- |
| **Home** | `/` (`index.tsx`) | Status em tempo real do computador (`is_online`, latência, telemetria de CPU e memória RAM), acesso rápido ao pareamento e cartões de atalho. |
| **Charlie** | `/charlie` (`charlie.tsx`) | Interface conversacional principal com IA. Suporta streaming token-a-token via Server-Sent Events (SSE), teclado adaptativo com `KeyboardAvoidingView`, Markdown rico e realce de código. |
| **Conversas** | `/chat` (`chat.tsx`) | Histórico consolidado de threads do usuário salvas no Supabase, permitindo alternar de contexto, renomear ou arquivar conversas. |
| **Workspace** | `/workspace` (`workspace.tsx`) | Hub operacional contendo o **DesktopRemotePad** (controle remoto do PC físico), visão de tarefas do agente e console de logs em tempo real. |

### 3.2. Telas Auxiliares e Modais

- **`/pairing` (`app/pairing.tsx`):** Tela cheia dedicada ao pareamento com a câmera traseira (`CameraView`), detecção automática de QR Code, alternador para digitação de PIN de 6 dígitos e verificação criptográfica.
- **`PairingModal.tsx`:** Modal invocado em qualquer ponto da interface para alternar rapidamente entre servidores salvos, cadastrar IPs manualmente ou escanear um novo QR Code.

---

## 4. Arquitetura de Pareamento Seguro (Zero Trust Local)

O pareamento entre o **Charlie Desktop** e o **Charlie Mobile** adota um fluxo criptográfico estrito, eliminando senhas compartilhadas e protegendo contra força bruta:

### 4.1. Ciclo de Pareamento (Schema V1)

```
[ Charlie Desktop (Tauri) ]                 [ Charlie Mobile (Expo) ]
             │                                          │
    1. POST /api/pair/init                              │
       (Gera pairing_id UUIDv4,                         │
        secret de 32 bytes, PIN 6 dig)                  │
             │                                          │
    2. Renderiza QR Code & PIN                          │
       ┌────────────────────────┐                       │
       │ QR Code:               │                       │
       │ { v: 1, id: "...",     │                       │
       │   lan: "192.168.1.X",  │                       │
       │   secret: "..." }      │                       │
       └────────────────────────┘                       │
             │                                          │
             │ ◄────────── 3. Escaneia QR Code ─────────┤
             │            (ou digita PIN de 6 dígitos)  │
             │                                          │
             │ ◄─────── 4. POST /api/pair/verify-qr ────┤
             │            (ou verify-pin com device_id) │
             │                                          │
    5. Validação em tempo constante                     │
       (hmac.compare_digest)                            │
       Emissão de token permanente                      │
             │                                          │
             ├──────────── 6. Resposta { token } ──────►│
             │                                          │
             │                                  7. Salva em SecureStore
             │                                     (CHARLIE_DEVICE_TOKEN)
```

### 4.2. Diretrizes de Segurança Implementadas

1. **Segredo Efêmero de Sessão:** A sessão de pareamento possui TTL estrito de 300 segundos (5 minutos). Após a expiração, qualquer leitura do QR Code ou tentativa de PIN é rejeitada com código 404/410.
2. **Rate Limiting no PIN contra Brute-Force:** O backend limita a validação do PIN a no máximo **5 tentativas incorretas** por sessão. Ao atingir o limite, a sessão é destruída imediatamente e retorna HTTP 429 (`Too Many Requests`).
3. **Comparação Criptográfica Constant-Time:** As rotas de verificação usam `hmac.compare_digest` para mitigar ataques de temporização (timing attacks).
4. **Token de Longa Duração Vinculado (`charlie_dev_...`):** Após o pareamento bem-sucedido, um token criptográfico permanente é emitido e associado exclusivamente ao `device_id` daquele smartphone, possuindo escopo `mobile_client` e sendo revogável a qualquer momento no Desktop.

### 4.3. Armazenamento Seguro (`src/services/authStorage.ts`)

Todos os dados sensíveis do aparelho são gravados na sandbox criptografada do sistema operacional através do `expo-secure-store`:

| Chave | Descrição |
| :--- | :--- |
| `CHARLIE_DEVICE_TOKEN` | Token assinado de autorização para o endpoint `/api/device/command`. |
| `CHARLIE_SERVER_URL` | URL base ativa normalizada do servidor conectado. |
| `CHARLIE_DEVICE_ID` | Identificador único do dispositivo móvel (UUID persistente). |
| `CHARLIE_DEVICE_NAME` | Nome amigável do celular (ex.: "Samsung de Lucas"). |
| `CHARLIE_IS_LAN` | Booleano indicando se a conexão atual é local ou remota. |

---

## 5. Controle Remoto do PC Físico (`DesktopRemotePad`)

O componente `DesktopRemotePad.tsx` em conjunto com `desktopControl.ts` provê controle direto do sistema operacional Windows:

### 5.1. Comandos Nativos Suportados

| Função | Ação / Payload | Execução no Windows (Tauri/Win32) |
| :--- | :--- | :--- |
| **Volume Mestre** | `set_volume` (`level: 0..100`) | Ajuste real com **debounce de 150ms** e script Win32 silencioso sem abertura de janelas. |
| **Alternar Mudo** | `toggle_mute` | Injeção da tecla virtual `VK_VOLUME_MUTE` (0xAD) via `user32.dll::keybd_event`. |
| **Multimídia** | `media` (`key: play_pause, next, prev, volume_up, volume_down`) | Injeção direta de teclas virtuais: `0xB3` (Play/Pause), `0xB0` (Next), `0xB1` (Prev), etc. |
| **Bloqueio de Tela** | `lock` | Chamada imediata à API nativa `user32::LockWorkStation()` (Win + L). Possui modal de confirmação no mobile. |
| **Minimizar Tudo** | `minimize_all` | Execução oculta de `(New-Object -ComObject Shell.Application).MinimizeAll()` (Win + D). |
| **Print do Monitor** | `screenshot` | Captura do monitor principal via Win32 GDI (`GetDC`, `CreateCompatibleDC`, `BitBlt`), convertida em PNG base64 (`data:image/png;base64,...`) e exibida em modal com opção de envio para o chat. |
| **Atalhos Rápidos** | `open` (`target: "spotify:", "wt:", etc.`) | Abertura nativa segura via `cmd /c start ""` para programas, links ou protocolos do sistema. |

### 5.2. Contrato da API de Controle (`POST /api/device/command`)

- **Cabeçalhos:**
  ```http
  Authorization: Bearer charlie_dev_...
  Content-Type: application/json
  ```
- **Payload Flexível (Aninhado ou Plano):**
  ```json
  {
    "action": "set_volume",
    "params": {
      "level": 65
    }
  }
  ```
- **Resposta Padronizada:**
  ```json
  {
    "success": true,
    "status": "ok",
    "action": "set_volume",
    "message": "Volume ajustado para 65%"
  }
  ```
- **Resposta de Captura de Tela:**
  ```json
  {
    "success": true,
    "status": "ok",
    "action": "screenshot",
    "image_base64": "data:image/png;base64,iVBORw0KGgo...",
    "message": "Captura de tela realizada com sucesso."
  }
  ```

---

## 6. Camada de Streaming e Resiliência de Rede

### 6.1. Streaming Conversacional (SSE)
O app consome a rota `POST /api/chat/stream` utilizando `fetch` com leitor de stream contínuo:
- **Eventos Processados:**
  - `token`: Delta de texto exibido instantaneamente na tela.
  - `tool_start` e `tool_end`: Indicador visual de execução de ferramenta pelo assistente.
  - `done`: Finalização da resposta e persistência no histórico local.
  - `error`: Notificação graciosa de falha sem travamento da conversa.
- **Serverless Friendly:** Para garantir compatibilidade com a infraestrutura da Vercel (onde conexões WebSocket persistentes sofrem timeout), o mobile prioriza SSE com fallback automático para requisições REST `POST /api/chat`.

### 6.2. Prevenção de Loops de Renderização
Os hooks `useServerConnection` e `useDeviceConnection` implementam guardas de igualdade estrutural:
- Comparação do estado anterior com o novo estado antes de invocar `setState`.
- Memorização de perfis com `useMemo` e `useCallback` para evitar ciclos infinitos do tipo `Maximum update depth exceeded`.

---

## 7. Design System & Identidade Visual

O visual do mobile é inspirado no design **Clean Technical**:
- **Paleta de Cores:**
  - Fundo principal: `#0D0F12`
  - Superfícies e Cards: `#161A22`
  - Bordas e divisores: `#212631`
  - Cor primária / Acento IA: `#818CF8` (Índigo suave)
  - Sucesso / LAN Online: `#22C55E`
  - Alertas / Bloqueio: `#EF4444`
  - Tipografia Técnica: `#F5F7FA` (Primário), `#8791A4` (Secundário), `#64748B` (Muted).
- **Feedback Háptico:** Integração com `expo-haptics` em ações críticas (toque de volume, leitura do QR Code, envio de mensagens, confirmação de bloqueio).

---

## 8. Comandos e Scripts de Execução

No diretório `mobile/`:

```bash
# Instalação das dependências
npm install

# Iniciar o servidor de desenvolvimento Metro (Expo Go)
npm start

# Validação estrita de tipos TypeScript (Zero Warnings)
npm run typecheck

# Execução direcionada para Android / iOS
npm run android
npm run ios
```
