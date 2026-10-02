import { useState, useEffect, useCallback, useRef } from 'react';
import { Message, Thread, FileAttachment, ConnectionStatus, CharlieAIStatus } from '../types/chat';
import { ThreadsService } from '../services/threadsService';
import { StorageService } from '../services/storage';
import { chatStream } from '../services/chatStream';
import { api } from '../services/api';
import { generateUUID } from '../utils/formatters';

export function useChat() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [charlieStatus, setCharlieStatus] = useState<CharlieAIStatus>('idle');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('online');
  const [draft, setDraftState] = useState<string>('');
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const isFirstLoadRef = useRef<boolean>(true);

  // Monitor connection status
  useEffect(() => {
    const unsub = api.subscribeConnection((isOnline) => {
      setConnectionStatus(isOnline ? 'online' : 'offline');
    });

    // Check backend health periodically
    const healthInterval = window.setInterval(async () => {
      const res = await api.checkHealth();
      setConnectionStatus(res.ok ? 'online' : 'offline');
    }, 15000);

    return () => {
      unsub();
      clearInterval(healthInterval);
    };
  }, []);

  // Fetch threads on mount
  const refreshThreads = useCallback(async () => {
    try {
      const list = await ThreadsService.getThreads();
      setThreads(list);
      return list;
    } catch (e) {
      console.warn('Erro ao atualizar threads:', e);
      return [];
    }
  }, []);

  useEffect(() => {
    async function init() {
      const list = await refreshThreads();
      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
        if (list.length > 0) {
          setActiveThreadId(list[0].id);
        }
      }
    }
    init();
  }, [refreshThreads]);

  // Load messages & draft when active thread changes
  useEffect(() => {
    let isCancelled = false;

    async function loadThreadData() {
      if (!activeThreadId) {
        setMessages([]);
        setDraftState('');
        return;
      }

      // Load draft for this thread
      const savedDraft = StorageService.getDraft(activeThreadId);
      setDraftState(savedDraft);

      // Load messages
      setIsLoadingMessages(true);
      try {
        const msgs = await ThreadsService.getMessages(activeThreadId);
        if (!isCancelled) {
          setMessages(msgs);
        }
      } catch (err) {
        console.warn('Erro ao carregar mensagens da conversa:', err);
      } finally {
        if (!isCancelled) {
          setIsLoadingMessages(false);
        }
      }
    }

    loadThreadData();

    return () => {
      isCancelled = true;
    };
  }, [activeThreadId]);

  // Draft change handler
  const setDraft = useCallback(
    (text: string) => {
      setDraftState(text);
      if (activeThreadId) {
        StorageService.saveDraft(activeThreadId, text);
      }
    },
    [activeThreadId]
  );

  // Create new thread
  const createNewThread = useCallback(async (name = 'Nova Conversa'): Promise<Thread> => {
    const thread = await ThreadsService.createThread(name);
    setThreads((prev) => [thread, ...prev.filter((t) => t.id !== thread.id)]);
    setActiveThreadId(thread.id);
    setMessages([]);
    setDraftState('');
    return thread;
  }, []);

  // Rename thread
  const renameThread = useCallback(
    async (threadId: string, newName: string) => {
      if (!newName.trim()) return;
      await ThreadsService.updateThreadName(threadId, newName.trim());
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, name: newName.trim(), updatedAt: new Date().toISOString() } : t))
      );
    },
    []
  );

  // Delete thread
  const deleteThread = useCallback(
    async (threadId: string) => {
      await ThreadsService.deleteThread(threadId);
      setThreads((prev) => {
        const next = prev.filter((t) => t.id !== threadId);
        if (activeThreadId === threadId) {
          setActiveThreadId(next.length > 0 ? next[0].id : null);
        }
        return next;
      });
      StorageService.clearDraft(threadId);
    },
    [activeThreadId]
  );

  // Stop active streaming
  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setCharlieStatus('idle');
  }, []);

  // Send message
  const sendMessage = useCallback(
    async (text: string, attachments: FileAttachment[] = [], customThreadId?: string) => {
      const trimmedText = text.trim();
      if (!trimmedText && attachments.length === 0) return;

      // Abort any ongoing stream
      stopStreaming();

      // Ensure we have an active thread
      let targetThreadId = customThreadId || activeThreadId;
      if (!targetThreadId) {
        const newThreadTitle = trimmedText ? trimmedText.slice(0, 30) + (trimmedText.length > 30 ? '...' : '') : 'Nova Conversa';
        const newThread = await createNewThread(newThreadTitle);
        targetThreadId = newThread.id;
      }

      // Format full prompt including text attachments if any
      let finalPrompt = trimmedText;
      if (attachments.length > 0) {
        const attachmentNotes = attachments
          .map((att) => {
            if (att.isImage) {
              return `[Anexo Imagem: ${att.name}]`;
            }
            if (att.textPreview) {
              return `\n\n--- Conteúdo do Arquivo (${att.name}) ---\n${att.textPreview}\n--- Fim do Arquivo ---`;
            }
            return `[Anexo: ${att.name} (${att.size} bytes)]`;
          })
          .join('\n');
        finalPrompt = `${finalPrompt}\n\n${attachmentNotes}`.trim();
      }

      const userMsgId = generateUUID();
      const asstMsgId = generateUUID();
      const now = new Date().toISOString();

      const userMessage: Message = {
        id: userMsgId,
        role: 'user',
        content: trimmedText || '(Arquivo anexo enviado)',
        createdAt: now,
        status: 'done',
        attachments,
        threadId: targetThreadId,
      };

      const pendingAsstMessage: Message = {
        id: asstMsgId,
        role: 'assistant',
        content: '',
        createdAt: now,
        status: 'streaming',
        isStreaming: true,
        threadId: targetThreadId,
      };

      setMessages((prev) => [...prev, userMessage, pendingAsstMessage]);

      // Clear draft
      setDraft('');
      if (targetThreadId) {
        StorageService.clearDraft(targetThreadId);
      }

      // Start streaming
      setIsStreaming(true);
      setCharlieStatus('thinking');

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      let accumulatedReply = '';

      try {
        await chatStream.send({
          message: finalPrompt,
          threadId: targetThreadId,
          skipTts: true,
          signal: abortController.signal,
          onToken: (token) => {
            setCharlieStatus('speaking');
            accumulatedReply += token;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === asstMsgId
                  ? { ...msg, content: accumulatedReply, status: 'streaming' }
                  : msg
              )
            );
          },
          onDone: (fullReply) => {
            setIsStreaming(false);
            setCharlieStatus('idle');
            abortControllerRef.current = null;
            const finalContent = fullReply || accumulatedReply;

            setMessages((prev) => {
              const updated = prev.map((msg) =>
                msg.id === asstMsgId
                  ? { ...msg, content: finalContent, status: 'done' as const, isStreaming: false }
                  : msg
              );
              if (targetThreadId) {
                StorageService.setCachedMessages(targetThreadId, updated);
              }
              return updated;
            });

            // Update thread title if needed
            setThreads((prev) =>
              prev.map((t) => {
                if (t.id === targetThreadId) {
                  const shouldRename = t.name === 'Nova Conversa' || t.name === 'Novo Chat' || !t.name;
                  const newName = shouldRename
                    ? (trimmedText.slice(0, 32) + (trimmedText.length > 32 ? '...' : ''))
                    : t.name;
                  return {
                    ...t,
                    name: newName,
                    updatedAt: new Date().toISOString(),
                    preview: finalContent.slice(0, 60),
                  };
                }
                return t;
              })
            );
          },
          onError: (errorMsg) => {
            setIsStreaming(false);
            setCharlieStatus('error');
            abortControllerRef.current = null;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === asstMsgId
                  ? {
                      ...msg,
                      content: accumulatedReply || `Erro: ${errorMsg}`,
                      status: 'error' as const,
                      error: errorMsg,
                      isStreaming: false,
                    }
                  : msg
              )
            );
          },
        });
      } catch (err: unknown) {
        setIsStreaming(false);
        setCharlieStatus('error');
        abortControllerRef.current = null;
        const msg = (err as Error)?.message || 'Erro inesperado ao comunicar com o Charlie.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === asstMsgId
              ? { ...m, content: `Erro: ${msg}`, status: 'error' as const, error: msg, isStreaming: false }
              : m
          )
        );
      }
    },
    [activeThreadId, createNewThread, setDraft, stopStreaming]
  );

  // Regenerate last message
  const regenerateLastMessage = useCallback(() => {
    if (messages.length === 0 || isStreaming) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return;

    // Remove last assistant message
    setMessages((prev) => {
      const idx = prev.map((m) => m.role).lastIndexOf('assistant');
      if (idx !== -1) {
        return prev.slice(0, idx);
      }
      return prev;
    });

    sendMessage(lastUserMsg.content, lastUserMsg.attachments);
  }, [messages, isStreaming, sendMessage]);

  // Clear current chat
  const clearCurrentChat = useCallback(async () => {
    if (!activeThreadId) return;
    setMessages([]);
    StorageService.setCachedMessages(activeThreadId, []);
  }, [activeThreadId]);

  const activeThread = threads.find((t) => t.id === activeThreadId) || null;

  return {
    threads,
    activeThreadId,
    activeThread,
    messages,
    isLoadingMessages,
    isStreaming,
    charlieStatus,
    connectionStatus,
    draft,
    setDraft,
    setActiveThreadId,
    createNewThread,
    renameThread,
    deleteThread,
    sendMessage,
    stopStreaming,
    regenerateLastMessage,
    clearCurrentChat,
    refreshThreads,
  };
}
