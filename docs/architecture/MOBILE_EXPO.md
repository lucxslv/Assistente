# Arquitetura móvel Expo do Charlie

## Mapa do sistema encontrado

| Área | Responsabilidade | Protocolo consumido pelo mobile |
| --- | --- | --- |
| `api/` | FastAPI, autenticação, chat, sessões, ferramentas, configurações e auditoria | REST, SSE e WebSocket |
| `core/` | Pipeline de prompt, contexto, ferramentas e geração incremental | eventos `token`, `tool_start`, `tool_end`, `done`, `error` |
| `brain/` | perfil, memória consolidada, presença e runtime de agente | REST e SSE do agente |
| `memory/` e Supabase/Postgres | dados de usuário, threads, mensagens, memória semântica e auditoria | acessados somente pela API |
| `providers/` | OpenAI, Gemini, Groq, Ollama e OpenRouter | internos ao backend |
| `tools/`, `audio/` | automação Windows, web, mídia, Home Assistant, STT/TTS/wake word | `/api/tools`; áudio é local ao host e não retorna arquivos ao cliente |
| `desktop/`, `web-chat/`, `landing/` | clientes Windows, web e apresentação | pares do novo `mobile/` |

## Contratos principais

| Operação | Contrato |
| --- | --- |
| Sessão | `POST /api/auth/login` e `/register`: `{ user, token }`; token Supabase em `Authorization: Bearer <token>` |
| Conversas | `GET/POST /api/threads`, `GET /api/messages?thread_id=<uuid>`, `PUT/DELETE /api/threads/<uuid>` |
| Chat REST | `POST /api/chat`: `{ message, thread_id, skip_tts, history? }` → `{ reply, thread_id, session_id, status }` |
| Chat SSE | `POST /api/chat/stream` com o mesmo body; eventos SSE `token`, `tool_start`, `tool_end`, `done`, `error` |
| Chat WS | `ws(s)://host/api/chat/ws?token=<jwt>`; envia `{ type: 'chat', message, thread_id }`; recebe `{ type, data }`; `ping`/`pong` mantém presença |
| Agente | `POST /api/agent/goal`, `GET /api/agent/session`, `POST /pause`, `/resume`, `/cancel`, e `/stream` SSE |
| Capacidade operacional | `GET /api/tools`, `POST /api/tools/execute`, `GET /api/system/status`, `GET/PUT /api/settings` |

## Navegação

```text
Autenticação
  └── Abas
      ├── Chat: conversa ativa, streaming, estados de conexão
      ├── Conversas: histórico e criação de thread
      ├── Agente: objetivo, tarefas e ciclo de pausa/retomada
      ├── Ferramentas: schemas e execução autenticada
      └── Ajustes: endpoint LAN/nuvem, telemetria e conta
```

Os dados sensíveis do usuário ficam em `expo-secure-store`. A URL base vem de `EXPO_PUBLIC_API_URL`, com override persistido na tela Ajustes. Em aparelho físico, a URL precisa usar IPv4 LAN, e o servidor deve aceitar conexões em `0.0.0.0:8005`.
