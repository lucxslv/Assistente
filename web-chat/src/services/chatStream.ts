import { api } from './api';
import { StorageService } from './storage';
import {
  ChatTransport,
  SSEChatTransport,
  WebSocketChatTransport,
  SendMessageOptions,
  ImageAttachmentPayload,
} from './transport';

export type { SendMessageOptions, ImageAttachmentPayload, ChatTransport };

class ChatStreamService {
  private sseTransport: SSEChatTransport = new SSEChatTransport();
  private wsTransport: WebSocketChatTransport = new WebSocketChatTransport();

  /**
   * Envia mensagem via SSE (Server-Sent Events) — Transporte padrão da Web
   */
  public async streamSSE(options: SendMessageOptions): Promise<void> {
    return this.sseTransport.send(options);
  }

  /**
   * Envia mensagem via WebSocket — Encapsulado para runners e agentes bidirecionais
   */
  public async streamWS(options: SendMessageOptions): Promise<void> {
    try {
      return await this.wsTransport.send(options);
    } catch (err) {
      console.warn('[ChatStreamService] Falha no transporte WebSocket, acionando fallback SSE:', err);
      return this.streamSSE(options);
    }
  }

  /**
   * Fallback Síncrono REST (POST /chat)
   */
  public async sendRest(options: SendMessageOptions): Promise<void> {
    const { message, threadId, skipTts = true, history, images, onDone, onError } = options;
    try {
      const baseUrl = api.getBaseUrl();
      const headers = api.getHeaders();
      const response = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message,
          thread_id: threadId,
          skip_tts: skipTts,
          history,
          images: images && images.length > 0 ? images : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Erro na API HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      onDone(data.reply || '');
    } catch (err: unknown) {
      onError((err as Error)?.message || 'Erro no fallback síncrono.');
    }
  }

  /**
   * Despachante inteligente: Seleciona modo configurado, padronizando SSE como default para web
   */
  public async send(options: SendMessageOptions): Promise<void> {
    const settings = StorageService.getSettings();
    const mode = settings.streamingMode;

    try {
      if (mode === 'ws') {
        await this.streamWS(options);
      } else {
        // SSE é o padrão recomendado e resiliente para HTTP
        await this.streamSSE(options);
      }
    } catch (err) {
      console.warn(`[ChatStreamService] Erro no modo ${mode}, tentando fallback:`, err);
      try {
        await this.streamSSE(options);
      } catch {
        await this.sendRest(options);
      }
    }
  }

  public disconnect(): void {
    this.wsTransport.abort();
  }
}

export const chatStream = new ChatStreamService();
