/**
 * Interface unificada de Transporte para o Chat do Charlie (SSE / WebSocket).
 * Padroniza SSE como default na Web e encapsula WebSocket para agentes/runners.
 */

import { api } from './api';
import { StorageService } from './storage';
import { StreamEvent } from '../types/chat';

export interface ImageAttachmentPayload {
  name?: string;
  mime_type: string;
  data: string; // Base64 limpo sem prefixo data:image/...;base64,
}

export interface SendMessageOptions {
  message: string;
  threadId: string;
  skipTts?: boolean;
  history?: Array<{ role: string; content: string }>;
  images?: ImageAttachmentPayload[];
  onToken: (token: string) => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => void;
  onDone: (fullReply: string) => void;
  onError: (error: string) => void;
  signal?: AbortSignal;
}

export interface ChatTransport {
  readonly name: string;
  send(options: SendMessageOptions): Promise<void>;
  abort?(): void;
}

/**
 * Transporte Padrão Web: Server-Sent Events (SSE) via POST /api/chat/stream
 */
export class SSEChatTransport implements ChatTransport {
  public readonly name = 'sse';

  public async send(options: SendMessageOptions): Promise<void> {
    const {
      message,
      threadId,
      skipTts = true,
      history,
      images,
      onToken,
      onToolCall,
      onDone,
      onError,
      signal,
    } = options;

    try {
      let baseUrl = api.getBaseUrl();
      let url = `${baseUrl}/chat/stream`;
      const headers = api.getHeaders();

      let response: Response;
      const requestPayload = {
        message,
        thread_id: threadId,
        skip_tts: skipTts,
        history,
        images: images && images.length > 0 ? images : undefined,
      };

      try {
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestPayload),
          signal,
        });
      } catch (fetchErr) {
        if (baseUrl !== 'https://assistente-xi.vercel.app/api') {
          console.warn('[Charlie Web] Streaming local indisponível. Alternando para Cloud API...');
          baseUrl = 'https://assistente-xi.vercel.app/api';
          url = `${baseUrl}/chat/stream`;
          response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestPayload),
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
          // ignore
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
              if (currentEventType === 'token' || currentEventType === 'message') {
                accumulatedReply += dataStr;
                onToken(dataStr);
              }
            }
          }
        }
      }

      onDone(accumulatedReply);
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        return; // Cancelamento intencional
      }
      onError((err as Error)?.message || 'Erro durante a transmissão SSE.');
    }
  }
}

/**
 * Transporte Bidirecional WebSocket: Encapsulado para runners e agentes locais
 */
export class WebSocketChatTransport implements ChatTransport {
  public readonly name = 'websocket';
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

  private async getOrConnectWebSocket(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this.ws;
    }

    return new Promise((resolve, reject) => {
      if (this.wsConnecting) {
        const check = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            clearInterval(check);
            resolve(this.ws);
          }
        }, 100);
        return;
      }

      this.wsConnecting = true;
      const settings = StorageService.getSettings();
      let wsUrl = settings.wsUrl;

      if (!wsUrl) {
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

          if (token) {
            socket.send(JSON.stringify({ type: 'auth', token: token.replace(/^Bearer\s+/i, '') }));
          }

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

  public async send(options: SendMessageOptions): Promise<void> {
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
      console.warn('Falha no streaming via WS:', err);
      onError((err as Error)?.message || 'Falha de comunicação WebSocket.');
    }
  }

  public abort(): void {
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
