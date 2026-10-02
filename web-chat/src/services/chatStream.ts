import { api } from './api';
import { StorageService } from './storage';
import { StreamEvent } from '../types/chat';

export interface SendMessageOptions {
  message: string;
  threadId: string;
  skipTts?: boolean;
  history?: Array<{ role: string; content: string }>;
  onToken: (token: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onDone: (fullReply: string) => void;
  onError: (error: string) => void;
  signal?: AbortSignal;
}

class ChatStreamService {
  private ws: WebSocket | null = null;
  private wsConnecting: boolean = false;
  private pingInterval: number | null = null;
  private activeWsHandlers: Map<
    string,
    {
      onToken: (token: string) => void;
      onDone: (reply: string) => void;
      onError: (err: string) => void;
    }
  > = new Map();

  /**
   * Envia mensagem via SSE (Server-Sent Events) - Recomendado e mais robusto para HTTP
   */
  public async streamSSE(options: SendMessageOptions): Promise<void> {
    const { message, threadId, skipTts = true, history, onToken, onToolCall, onDone, onError, signal } = options;
    try {
      let baseUrl = api.getBaseUrl();
      let url = `${baseUrl}/chat/stream`;
      const headers = api.getHeaders();

      let response: Response;
      try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message,
          thread_id: threadId,
          skip_tts: skipTts,
          history,
        }),
        signal,
      });
    } catch (fetchErr) {
      if (baseUrl !== 'https://assistente-xi.vercel.app/api') {
        console.warn('[Charlie Web] Streaming local indisponível. Alternando automaticamente para Cloud API...');
        baseUrl = 'https://assistente-xi.vercel.app/api';
        url = `${baseUrl}/chat/stream`;
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message,
            thread_id: threadId,
            skip_tts: skipTts,
            history,
          }),
          signal,
        });
      } else {
        throw fetchErr;
      }
    }

      if (!response.ok) {
        let errMessage = `Erro HTTP ${response.status}: ${response.statusText}`;
        try {
          const errJson = await response.json();
          errMessage = errJson.detail || errJson.message || errMessage;
        } catch {
          // Ignore json parse error
        }
        throw new Error(errMessage);
      }

      if (!response.body) {
        throw new Error('Corpo de resposta de streaming vazio.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let accumulatedReply = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEventType = 'message';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            currentEventType = 'message';
            continue;
          }

          if (trimmed.startsWith('event:')) {
            currentEventType = trimmed.slice(6).trim();
            continue;
          }

          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);

              if (currentEventType === 'token' || data.token !== undefined) {
                const token = data.token || '';
                accumulatedReply += token;
                onToken(token);
              } else if (currentEventType === 'tool_call' || data.name !== undefined) {
                onToolCall?.(data.name || 'ferramenta', data.args || {});
              } else if (currentEventType === 'done' || data.reply !== undefined) {
                accumulatedReply = data.reply || accumulatedReply;
                onDone(accumulatedReply);
                return;
              } else if (currentEventType === 'error' || data.error !== undefined) {
                const errMsg = data.error || 'Erro desconhecido no streaming';
                onError(errMsg);
                return;
              }
            } catch {
              // Raw text chunk fallback
              if (currentEventType === 'token' || currentEventType === 'message') {
                accumulatedReply += dataStr;
                onToken(dataStr);
              }
            }
          }
        }
      }

      // Stream finished naturally
      onDone(accumulatedReply);
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        return; // Normal cancellation by user
      }
      onError((err as Error)?.message || 'Erro durante a transmissão.');
    }
  }

  /**
   * Fallback Síncrono REST (POST /chat)
   */
  public async sendRest(options: SendMessageOptions): Promise<void> {
    const { message, threadId, skipTts = true, history, onToken, onDone, onError, signal } = options;
    try {
      const res = await api.post<{ reply: string; thread_id: string }>(
        '/chat',
        {
          message,
          thread_id: threadId,
          skip_tts: skipTts,
          history,
        },
        { signal }
      );

      // Emulate rapid token chunk for consistent UI experience
      const reply = res.reply || '';
      onToken(reply);
      onDone(reply);
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
      onError((err as Error)?.message || 'Erro na requisição REST de chat.');
    }
  }

  /**
   * Conecta e obtém/mantém canal WebSocket com reconexão resiliente
   */
  public getOrConnectWebSocket(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        return resolve(this.ws);
      }

      if (this.wsConnecting) {
        const checkInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            clearInterval(checkInterval);
            resolve(this.ws);
          }
        }, 100);
        return;
      }

      this.wsConnecting = true;
      const settings = StorageService.getSettings();
      let wsUrl = settings.wsUrl;

      if (!wsUrl) {
        // Derive from api url or window.location
        const base = api.getBaseUrl();
        if (base.startsWith('http')) {
          wsUrl = base.replace(/^http/, 'ws') + '/chat/ws';
        } else {
          const loc = window.location;
          const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
          wsUrl = `${proto}//${loc.host}${base}/chat/ws`;
        }
      }

      const token = StorageService.getToken();
      const finalWsUrl = token ? `${wsUrl}?token=${encodeURIComponent(token.replace(/^Bearer\s+/i, ''))}` : wsUrl;

      try {
        const socket = new WebSocket(finalWsUrl);

        socket.onopen = () => {
          this.ws = socket;
          this.wsConnecting = false;
          api.setOnline(true);

          // Authenticate if token exists
          if (token) {
            socket.send(JSON.stringify({ type: 'auth', token: token.replace(/^Bearer\s+/i, '') }));
          }

          // Setup ping keepalive
          if (this.pingInterval) clearInterval(this.pingInterval);
          this.pingInterval = window.setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'ping' }));
            }
          }, 25000);

          resolve(socket);
        };

        socket.onmessage = (event) => {
          try {
            const data: StreamEvent = JSON.parse(event.data);
            if (data.type === 'pong') return;

            // Notify active handlers
            this.activeWsHandlers.forEach((handler) => {
              if (data.type === 'token' && data.data?.token) {
                handler.onToken(data.data.token);
              } else if (data.type === 'done') {
                handler.onDone(data.data?.reply || '');
              } else if (data.type === 'error') {
                handler.onError(data.data?.error || 'Erro no WebSocket');
              }
            });
          } catch (e) {
            console.error('Falha ao processar mensagem WS:', e);
          }
        };

        socket.onerror = (e) => {
          console.warn('Erro de conexão WebSocket:', e);
          this.wsConnecting = false;
        };

        socket.onclose = () => {
          this.ws = null;
          this.wsConnecting = false;
          if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
          }
        };
      } catch (err) {
        this.wsConnecting = false;
        reject(err);
      }
    });
  }

  /**
   * Envia mensagem via WebSocket
   */
  public async streamWS(options: SendMessageOptions): Promise<void> {
    const { message, threadId, onToken, onDone, onError } = options;
    try {
      const socket = await this.getOrConnectWebSocket();
      const requestId = `${threadId}-${Date.now()}`;

      let accumulated = '';
      this.activeWsHandlers.set(requestId, {
        onToken: (tok) => {
          accumulated += tok;
          onToken(tok);
        },
        onDone: (reply) => {
          this.activeWsHandlers.delete(requestId);
          onDone(reply || accumulated);
        },
        onError: (err) => {
          this.activeWsHandlers.delete(requestId);
          onError(err);
        },
      });

      socket.send(
        JSON.stringify({
          type: 'chat',
          message,
          thread_id: threadId,
        })
      );
    } catch (err: unknown) {
      console.warn('Falha no streaming via WS, acionando fallback SSE:', err);
      // Seamless silent fallback to SSE
      return this.streamSSE(options);
    }
  }

  /**
   * Despachante inteligente: Seleciona modo configurado com fallback automático
   */
  public async send(options: SendMessageOptions): Promise<void> {
    const settings = StorageService.getSettings();
    const mode = settings.streamingMode;

    try {
      if (mode === 'ws') {
        await this.streamWS(options);
      } else if (mode === 'sse') {
        await this.streamSSE(options);
      } else {
        await this.sendRest(options);
      }
    } catch (err) {
      console.warn(`Erro no modo ${mode}, tentando fallback resiliente:`, err);
      try {
        await this.streamSSE(options);
      } catch {
        await this.sendRest(options);
      }
    }
  }

  public disconnect(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.activeWsHandlers.clear();
  }
}

export const chatStream = new ChatStreamService();
