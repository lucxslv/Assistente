import { api } from './api';
import { StorageService } from './storage';
import {
  ChatTransport,
  SSEChatTransport,
  WebSocketChatTransport,
  SendMessageOptions,
  ImageAttachmentPayload,
  DocumentAttachmentPayload,
} from './transport';

export type { SendMessageOptions, ImageAttachmentPayload, DocumentAttachmentPayload, ChatTransport };

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
      if (options.signal?.aborted) return;
      console.warn('[ChatStreamService] Falha no transporte WebSocket, acionando fallback SSE:', err);
      return this.streamSSE(options);
    }
  }

  /**
   * Fallback Síncrono REST (POST /chat)
   */
  public async sendRest(options: SendMessageOptions): Promise<void> {
    const {
      message,
      threadId,
      requestId,
      skipTts = true,
      skipUserMessageSave = false,
      history,
      images,
      attachments,
      onDone,
      onError,
      signal,
    } = options;
    if (signal?.aborted) return;
    try {
      const baseUrl = api.getBaseUrl();
      const headers = api.getHeaders();
      const response = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers,
        signal,
        body: JSON.stringify({
          message,
          thread_id: threadId,
          request_id: requestId,
          skip_tts: skipTts,
          skip_user_message_save: skipUserMessageSave,
          history,
          images: images && images.length > 0 ? images : undefined,
          attachments: attachments && attachments.length > 0 ? attachments : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Erro na API HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      onDone(data.reply || '');
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError' || signal?.aborted) return;
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
        await this.streamSSE(options);
      }
    } catch (err) {
      if (options.signal?.aborted || (err as Error)?.name === 'AbortError') {
        return;
      }
      console.warn(`[ChatStreamService] Erro no modo ${mode}:`, err);
      options.onError((err as Error)?.message || 'Erro de comunicação durante o streaming.');
    }
  }

  public disconnect(): void {
    this.wsTransport.abort();
  }
}

export const chatStream = new ChatStreamService();
