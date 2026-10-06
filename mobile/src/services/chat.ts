import { getApiUrl, getWebSocketUrl } from '@/src/lib/config';
import { session } from '@/src/lib/session';
import { api } from '@/src/services/api';
import { StreamEvent } from '@/src/types/api';

type StreamHandlers = { onEvent: (event: StreamEvent) => void; onError: (message: string) => void; onClose?: () => void };

export const chatService = {
  async connect(handlers: StreamHandlers): Promise<WebSocket> {
    const [baseUrl, token] = await Promise.all([getApiUrl(), session.getToken()]);
    return new Promise((resolve, reject) => {
      let isSettled = false;
      const socket = new WebSocket(getWebSocketUrl(baseUrl, token ?? undefined));

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          try { socket.close(); } catch {}
          reject(new Error('Tempo esgotado ao conectar ao chat.'));
        }
      }, 8000);

      socket.onopen = () => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          if (token) {
            socket.send(JSON.stringify({ type: 'auth', token, client_type: 'mobile' }));
          }
          resolve(socket);
        }
      };

      socket.onmessage = (message) => {
        try {
          handlers.onEvent(JSON.parse(message.data) as StreamEvent);
        } catch {
          handlers.onError('Evento inválido recebido do servidor.');
        }
      };

      socket.onerror = () => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          reject(new Error('Falha ao conectar no canal em tempo real.'));
        }
        handlers.onError('A conexão em tempo real foi interrompida.');
      };

      socket.onclose = () => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
        }
        handlers.onClose?.();
      };
    });
  },
  send(socket: WebSocket, message: string, threadId: string) {
    socket.send(JSON.stringify({ type: 'chat', message, thread_id: threadId }));
  },
  async sendRest(message: string, threadId: string) {
    return api.post<{ reply: string; thread_id: string }>('/chat', { message, thread_id: threadId, skip_tts: true });
  },
  async streamSse(message: string, threadId: string, onEvent: (event: StreamEvent) => void, signal?: AbortSignal) {
    const [baseUrl, token] = await Promise.all([getApiUrl(), session.getToken()]);
    const response = await fetch(`${baseUrl}/chat/stream`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ message, thread_id: threadId, skip_tts: true }),
    });

    if (!response.ok) {
      throw new Error(`Streaming SSE indisponível (HTTP ${response.status}).`);
    }

    // Suporte nativo completo a ReadableStream (quando disponível na plataforma)
    if (response.body && typeof (response.body as any).getReader === 'function') {
      const reader = (response.body as any).getReader();
      const decoder = new TextDecoder();
      let pending = '';
      let eventType = 'message';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const raw of lines) {
          const line = raw.trim();
          if (line.startsWith('event:')) eventType = line.slice(6).trim();
          if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.slice(5).trim());
              onEvent({ type: eventType as StreamEvent['type'], data });
            } catch {
              // Ignora chunks parciais
            }
            eventType = 'message';
          }
        }
      }
      return;
    }

    // Fallback gracioso para engines mobile onde response.body.getReader é ausente
    const fullText = await response.text();
    const lines = fullText.split('\n');
    let eventType = 'message';
    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith('event:')) eventType = line.slice(6).trim();
      if (line.startsWith('data:')) {
        try {
          const data = JSON.parse(line.slice(5).trim());
          onEvent({ type: eventType as StreamEvent['type'], data });
        } catch {}
        eventType = 'message';
      }
    }
  },
};
