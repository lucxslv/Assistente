import { useCallback, useEffect, useRef, useState } from 'react';
import { chatService } from '@/src/services/chat';
import { ChatMessage, StreamEvent } from '@/src/types/api';
import { parseAssistantPayload } from '@/src/types/chat';

const id = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function useChat(threadId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setStreaming] = useState(false);
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const socket = useRef<WebSocket | null>(null);
  const assistantId = useRef<string | null>(null);

  const applyEvent = useCallback((event: StreamEvent) => {
    if (event.type === 'token') {
      setMessages((current) =>
        current.map((m) =>
          m.id === assistantId.current
            ? { ...m, content: m.content + (event.data?.token ?? '') }
            : m
        )
      );
    }
    if (event.type === 'reset_and_fallback') {
      setMessages((current) =>
        current.map((m) =>
          m.id === assistantId.current
            ? { ...m, content: '', widgets: undefined, status: 'streaming' }
            : m
        )
      );
    }
    if (event.type === 'tool_start') {
      setMessages((current) =>
        current.map((m) =>
          m.id === assistantId.current
            ? { ...m, content: `${m.content}\n\n_Executando ${String(event.data?.name ?? 'ferramenta')}…_` }
            : m
        )
      );
    }
    if (event.type === 'done') {
      const payload = parseAssistantPayload(event.data?.reply ?? '');
      setMessages((current) =>
        current.map((m) =>
          m.id === assistantId.current
            ? {
                ...m,
                content: payload.text ?? m.content,
                widgets: payload.widgets,
                status: 'done',
              }
            : m
        )
      );
      setStreaming(false);
    }
    if (event.type === 'error') {
      setMessages((current) =>
        current.map((m) =>
          m.id === assistantId.current
            ? {
                ...m,
                status: 'error',
                content: event.data?.error ?? 'Erro ao gerar resposta.',
              }
            : m
        )
      );
      setStreaming(false);
    }
  }, []);

  const connect = useCallback(async () => {
    if (socket.current?.readyState === WebSocket.OPEN) return;
    try {
      socket.current = await chatService.connect({
        onEvent: applyEvent,
        onError: () => setConnection('offline'),
        onClose: () => setConnection('offline'),
      });
      setConnection('connected');
    } catch {
      setConnection('offline');
    }
  }, [applyEvent]);

  useEffect(() => {
    let mounted = true;
    const startSocket = async () => {
      try {
        if (socket.current?.readyState === WebSocket.OPEN) return;
        socket.current = await chatService.connect({
          onEvent: applyEvent,
          onError: () => {
            if (mounted) setConnection('offline');
          },
          onClose: () => {
            if (mounted) setConnection('offline');
          },
        });
        if (mounted) setConnection('connected');
      } catch {
        if (mounted) setConnection('offline');
      }
    };

    startSocket();

    return () => {
      mounted = false;
      socket.current?.close();
    };
  }, [applyEvent]);

  const send = useCallback(
    async (text: string) => {
      if (!threadId || !text.trim() || isStreaming) return;
      const now = new Date().toISOString();
      const responseId = id();
      assistantId.current = responseId;

      setMessages((current) => [
        ...current,
        { id: id(), role: 'user', content: text.trim(), createdAt: now, status: 'done' },
        { id: responseId, role: 'assistant', content: '', createdAt: now, status: 'streaming' },
      ]);
      setStreaming(true);

      try {
        if (socket.current?.readyState !== WebSocket.OPEN) await connect();
        if (socket.current?.readyState === WebSocket.OPEN) {
          chatService.send(socket.current, text.trim(), threadId);
        } else {
          try {
            await chatService.streamSse(text.trim(), threadId, applyEvent);
          } catch {
            const response = await chatService.sendRest(text.trim(), threadId);
            applyEvent({ type: 'done', data: { reply: response.reply } });
          }
        }
      } catch (error) {
        applyEvent({
          type: 'error',
          data: { error: error instanceof Error ? error.message : 'Falha ao enviar mensagem.' },
        });
      }
    },
    [applyEvent, connect, isStreaming, threadId]
  );

  return { messages, setMessages, send, isStreaming, connection };
}
