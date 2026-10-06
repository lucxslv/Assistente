import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiUrl } from '@/src/lib/config';
import { chatService } from '@/src/services/chat';
import { ChatMessage, StreamEvent } from '@/src/types/api';
import { parseAssistantPayload } from '@/src/types/chat';

const genId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function useChatStream(threadId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  const [streamingText, setStreamingText] = useState('');
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'offline'>('connecting');

  const socket = useRef<WebSocket | null>(null);
  const tokenBufferRef = useRef('');
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thinkingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const thinkingStartTimeRef = useRef<number>(0);

  // Throttled token flush (atualiza o texto do streaming a cada 35ms)
  const scheduleBufferFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      setStreamingText(tokenBufferRef.current);
      flushTimerRef.current = null;
    }, 35);
  }, []);

  const stopThinkingTimer = useCallback(() => {
    if (thinkingTimerRef.current) {
      clearInterval(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
    setIsThinking((prev) => (prev ? false : prev));
  }, []);

  const startThinkingTimer = useCallback(() => {
    stopThinkingTimer();
    setIsThinking(true);
    setThinkingSeconds(0);
    thinkingStartTimeRef.current = Date.now();
    thinkingTimerRef.current = setInterval(() => {
      const elapsed = (Date.now() - thinkingStartTimeRef.current) / 1000;
      setThinkingSeconds(elapsed);
    }, 100);
  }, [stopThinkingTimer]);

  const applyEvent = useCallback(
    (event: StreamEvent) => {
      if (event.type === 'token') {
        const token = event.data?.token ?? '';
        tokenBufferRef.current += token;
        stopThinkingTimer();
        scheduleBufferFlush();
      }

      if (event.type === 'tool_start') {
        setActiveTool(String(event.data?.name ?? 'operando'));
      }

      if (event.type === 'tool_end') {
        setActiveTool(null);
      }

      if (event.type === 'reset_and_fallback') {
        tokenBufferRef.current = '';
        setStreamingText('');
        startThinkingTimer();
      }

      if (event.type === 'done') {
        stopThinkingTimer();
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }

        const rawReply = event.data?.reply ?? tokenBufferRef.current;
        const payload = parseAssistantPayload(rawReply);

        const finalMessage: ChatMessage = {
          id: genId(),
          role: 'assistant',
          content: payload.text || tokenBufferRef.current,
          widgets: payload.widgets,
          createdAt: new Date().toISOString(),
          status: 'done',
        };

        setMessages((prev) => [...prev, finalMessage]);
        tokenBufferRef.current = '';
        setStreamingText('');
        setActiveTool(null);
        setIsStreaming(false);
      }

      if (event.type === 'error') {
        stopThinkingTimer();
        const errMessage: ChatMessage = {
          id: genId(),
          role: 'assistant',
          content: event.data?.error ?? 'Falha ao processar resposta do Charlie.',
          createdAt: new Date().toISOString(),
          status: 'error',
        };
        setMessages((prev) => [...prev, errMessage]);
        tokenBufferRef.current = '';
        setStreamingText('');
        setActiveTool(null);
        setIsStreaming(false);
      }
    },
    [scheduleBufferFlush, startThinkingTimer, stopThinkingTimer]
  );

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
    const init = async () => {
      try {
        const baseUrl = await getApiUrl();
        if (baseUrl.includes('vercel.app') || baseUrl.includes('assistente-xi')) {
          // Na nuvem Vercel, a API opera via HTTP/SSE e dispensa WebSocket
          if (mounted) setConnection('connected');
          return;
        }

        if (socket.current?.readyState === WebSocket.OPEN) return;
        socket.current = await chatService.connect({
          onEvent: applyEvent,
          onError: () => {
            if (mounted) setConnection('connected');
          },
          onClose: () => {
            if (mounted) setConnection('connected');
          },
        });
        if (mounted) setConnection('connected');
      } catch {
        // Fallback gracioso: permite continuar via HTTP/SSE
        if (mounted) setConnection('connected');
      }
    };

    init();

    return () => {
      mounted = false;
      stopThinkingTimer();
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      socket.current?.close();
    };
  }, [applyEvent, stopThinkingTimer]);

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!threadId || !clean || isStreaming) return;

      const userMessage: ChatMessage = {
        id: genId(),
        role: 'user',
        content: clean,
        createdAt: new Date().toISOString(),
        status: 'done',
      };

      setMessages((prev) => [...prev, userMessage]);
      tokenBufferRef.current = '';
      setStreamingText('');
      setIsStreaming(true);
      startThinkingTimer();

      try {
        const baseUrl = await getApiUrl();
        const isVercel = baseUrl.includes('vercel.app') || baseUrl.includes('assistente-xi');

        if (!isVercel && socket.current?.readyState !== WebSocket.OPEN) {
          try {
            await connect();
          } catch {
            // Ignora falha de WebSocket e comuta para SSE/REST
          }
        }

        if (!isVercel && socket.current?.readyState === WebSocket.OPEN) {
          chatService.send(socket.current, clean, threadId);
        } else {
          try {
            await chatService.streamSse(clean, threadId, applyEvent);
          } catch {
            const response = await chatService.sendRest(clean, threadId);
            applyEvent({ type: 'done', data: { reply: response.reply } });
          }
        }
      } catch (err) {
        applyEvent({
          type: 'error',
          data: { error: err instanceof Error ? err.message : 'Falha na conexão com o Charlie.' },
        });
      }
    },
    [applyEvent, connect, isStreaming, startThinkingTimer, threadId]
  );

  return {
    messages,
    setMessages,
    send,
    isStreaming,
    isThinking,
    thinkingSeconds,
    streamingText,
    activeTool,
    connection,
  };
}
