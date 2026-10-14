import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Message,
  Thread,
  FileAttachment,
  ConnectionStatus,
  CharlieAIStatus,
  ToolExecutionCard,
} from '../types/chat';
import { ThreadsService } from '../services/threadsService';
import { StorageService } from '../services/storage';
import {
  chatStream,
  ImageAttachmentPayload,
  DocumentAttachmentPayload,
} from '../services/chatStream';
import { api } from '../services/api';
import { generateUUID } from '../utils/formatters';

interface SendInternalOptions {
  skipUserMessageSave?: boolean;
  skipUserBubbleInsert?: boolean;
}

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
  const activeRequestIdRef = useRef<string | null>(null);
  const isFirstLoadRef = useRef<boolean>(true);
  const isCreatingThreadRef = useRef<Promise<Thread> | null>(null);
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;
  const threadsRef = useRef<Thread[]>([]);
  threadsRef.current = threads;
  const streamingThreadIdRef = useRef<string | null>(null);

  // Monitor connection status
  useEffect(() => {
    const unsub = api.subscribeConnection((isOnline) => {
      setConnectionStatus(isOnline ? 'online' : 'offline');
    });

    const healthInterval = window.setInterval(async () => {
      const res = await api.checkHealth();
      setConnectionStatus(res.ok ? 'online' : 'offline');
    }, 15000);

    return () => {
      unsub();
      clearInterval(healthInterval);
    };
  }, []);

  // Cleanup on pagehide or beforeunload
  useEffect(() => {
    const handleExit = () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setIsStreaming(false);
      setCharlieStatus('idle');
    };

    window.addEventListener('beforeunload', handleExit);
    window.addEventListener('pagehide', handleExit);
    return () => {
      window.removeEventListener('beforeunload', handleExit);
      window.removeEventListener('pagehide', handleExit);
    };
  }, []);

  // Fetch threads
  const refreshThreads = useCallback(
    async (options?: { q?: string; includeArchived?: boolean }) => {
      try {
        const list = await ThreadsService.getThreads(options);
        setThreads(list);
        return list;
      } catch (e) {
        console.warn('Erro ao atualizar threads:', e);
        return [];
      }
    },
    []
  );

  useEffect(() => {
    async function init() {
      const list = await refreshThreads();
      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
        const savedThreadId = StorageService.getActiveThreadId();
        if (savedThreadId && list.some((t) => t.id === savedThreadId)) {
          setActiveThreadId(savedThreadId);
        } else if (list.length > 0) {
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

      StorageService.setActiveThreadId(activeThreadId);

      const savedDraft = StorageService.getDraft(activeThreadId);
      setDraftState(savedDraft);

      if (streamingThreadIdRef.current === activeThreadId && messagesRef.current.length > 0) {
        return;
      }

      setIsLoadingMessages(true);
      try {
        const msgs = await ThreadsService.getMessages(activeThreadId);
        if (!isCancelled) {
          if (streamingThreadIdRef.current !== activeThreadId) {
            setMessages(msgs);
          }
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

  const setDraft = useCallback(
    (text: string) => {
      setDraftState(text);
      if (activeThreadId) {
        StorageService.saveDraft(activeThreadId, text);
      }
    },
    [activeThreadId]
  );

  // Create new thread with concurrency lock + empty-thread reuse to avoid duplicates
  const createNewThread = useCallback(
    async (name = 'Nova Conversa', forceNew = false): Promise<Thread> => {
      if (isCreatingThreadRef.current) {
        return isCreatingThreadRef.current;
      }

      // Se a conversa ativa já está vazia e sem mensagens (ex: usuário clicou várias vezes em "Nova Conversa"), reaproveita!
      if (!forceNew && activeThreadId && messagesRef.current.length === 0) {
        const existingEmpty = threadsRef.current.find((t) => t.id === activeThreadId);
        if (
          existingEmpty &&
          (existingEmpty.name === 'Nova Conversa' || existingEmpty.name === 'Novo Chat')
        ) {
          return existingEmpty;
        }
      }

      const idempotencyKey = `new-thread-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const promise = (async () => {
        try {
          const thread = await ThreadsService.createThread(name, idempotencyKey);
          setThreads((prev) => [thread, ...prev.filter((t) => t.id !== thread.id)]);
          setActiveThreadId(thread.id);
          setMessages([]);
          setDraftState('');
          return thread;
        } finally {
          isCreatingThreadRef.current = null;
        }
      })();

      isCreatingThreadRef.current = promise;
      return promise;
    },
    [activeThreadId]
  );

  // Rename thread
  const renameThread = useCallback(async (threadId: string, newName: string) => {
    if (!newName.trim()) return;
    await ThreadsService.updateThreadName(threadId, newName.trim());
    setThreads((prev) =>
      prev.map((t) =>
        t.id === threadId
          ? { ...t, name: newName.trim(), updatedAt: new Date().toISOString() }
          : t
      )
    );
  }, []);

  // Pin / Unpin thread
  const togglePinThread = useCallback(async (threadId: string) => {
    const target = threadsRef.current.find((t) => t.id === threadId);
    const nextPinned = !(target?.isPinned ?? false);
    setThreads((prev) =>
      prev.map((t) => (t.id === threadId ? { ...t, isPinned: nextPinned } : t))
    );
    await ThreadsService.updateThread(threadId, { is_pinned: nextPinned });
  }, []);

  // Archive / Unarchive thread
  const toggleArchiveThread = useCallback(
    async (threadId: string) => {
      const target = threadsRef.current.find((t) => t.id === threadId);
      const nextArchived = !(target?.isArchived ?? false);
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, isArchived: nextArchived } : t))
      );
      await ThreadsService.updateThread(threadId, { is_archived: nextArchived });
      if (nextArchived && activeThreadId === threadId) {
        const remaining = threadsRef.current.filter(
          (t) => t.id !== threadId && !t.isArchived
        );
        setActiveThreadId(remaining.length > 0 ? remaining[0].id : null);
      }
    },
    [activeThreadId]
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

  // Stop active streaming (end-to-end: aborts client fetch AND signals POST /api/chat/cancel on backend)
  const stopStreaming = useCallback(() => {
    const reqId = activeRequestIdRef.current;
    const thId = streamingThreadIdRef.current || activeThreadId;

    if (reqId || thId) {
      ThreadsService.cancelStream(reqId, thId);
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    activeRequestIdRef.current = null;
    setIsStreaming(false);
    setCharlieStatus('idle');
    streamingThreadIdRef.current = null;

    setMessages((prev) => {
      const hasStreaming = prev.some((m) => m.isStreaming || m.status === 'streaming');
      if (!hasStreaming) return prev;
      const updated = prev.map((msg) =>
        msg.isStreaming || msg.status === 'streaming'
          ? {
              ...msg,
              content: msg.content || 'Geração interrompida pelo usuário.',
              isStreaming: false,
              status: 'cancelled' as const,
            }
          : msg
      );
      if (activeThreadId) {
        StorageService.setCachedMessages(activeThreadId, updated);
      }
      return updated;
    });
  }, [activeThreadId]);

  // Send message (supports structured attachments without dumping file contents into the chat bubble)
  const sendMessage = useCallback(
    async (
      text: string,
      attachments: FileAttachment[] = [],
      customThreadId?: string,
      internalOpts?: SendInternalOptions
    ) => {
      const trimmedText = text.trim();
      if (!trimmedText && attachments.length === 0) return;

      if (isStreaming) {
        stopStreaming();
      }

      let targetThreadId = customThreadId || activeThreadId;
      if (!targetThreadId) {
        const newThreadTitle = trimmedText
          ? trimmedText.slice(0, 36) + (trimmedText.length > 36 ? '...' : '')
          : 'Nova Conversa';
        const newThread = await createNewThread(newThreadTitle, true);
        targetThreadId = newThread.id;
      }

      streamingThreadIdRef.current = targetThreadId;

      const reqId = `req_${generateUUID().replace(/-/g, '').slice(0, 16)}`;
      activeRequestIdRef.current = reqId;

      const userMsgId = generateUUID();
      const asstMsgId = generateUUID();
      const now = new Date().toISOString();

      const visibleUserText =
        trimmedText ||
        (attachments.length > 0
          ? `Arquivo anexado: ${attachments.map((a) => a.name).join(', ')}`
          : '');

      const pendingAsstMessage: Message = {
        id: asstMsgId,
        role: 'assistant',
        content: '',
        createdAt: now,
        status: 'streaming',
        requestId: reqId,
        isStreaming: true,
        tools: [],
        threadId: targetThreadId,
      };

      if (internalOpts?.skipUserBubbleInsert) {
        setMessages((prev) => [...prev, pendingAsstMessage]);
      } else {
        const userMessage: Message = {
          id: userMsgId,
          role: 'user',
          content: visibleUserText,
          createdAt: now,
          status: 'done',
          requestId: reqId,
          attachments: attachments.length > 0 ? attachments : undefined,
          threadId: targetThreadId,
        };
        setMessages((prev) => [...prev, userMessage, pendingAsstMessage]);
      }

      if (!internalOpts?.skipUserBubbleInsert) {
        setDraft('');
        if (targetThreadId) {
          StorageService.clearDraft(targetThreadId);
        }
      }

      setIsStreaming(true);
      setCharlieStatus('thinking');

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      let accumulatedReply = '';
      let rafId: number | null = null;

      const flushTokensToState = () => {
        setCharlieStatus('speaking');
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === asstMsgId
              ? { ...msg, content: accumulatedReply, status: 'streaming' }
              : msg
          )
        );
      };

      const currentMessages = messagesRef.current;
      const conversationHistory = currentMessages
        .filter((m) => m.content && m.content.trim() && m.id !== asstMsgId)
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));

      // Extrai anexos de imagem para payload multimodal
      const imagePayloads: ImageAttachmentPayload[] = attachments
        .filter((att) => att.isImage && att.dataUrl)
        .map((att) => {
          let b64 = att.dataUrl || '';
          let mime = att.type || 'image/png';
          if (b64.startsWith('data:')) {
            const matches = b64.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
              mime = matches[1];
              b64 = matches[2];
            } else if (b64.includes(',')) {
              b64 = b64.split(',')[1];
            }
          }
          return {
            name: att.name,
            mime_type: mime,
            data: b64,
          };
        });

      // Estrutura anexos de documentos/código sem poluir o balão de mensagem
      const documentPayloads: DocumentAttachmentPayload[] = attachments.map((att) => ({
        id: att.id,
        name: att.name,
        type: att.type || 'application/octet-stream',
        size: att.size,
        extracted_text: att.textPreview || att.extractedText || undefined,
      }));

      try {
        await chatStream.send({
          message: visibleUserText,
          threadId: targetThreadId,
          requestId: reqId,
          skipTts: true,
          skipUserMessageSave: Boolean(internalOpts?.skipUserMessageSave),
          history: conversationHistory,
          images: imagePayloads.length > 0 ? imagePayloads : undefined,
          attachments: documentPayloads.length > 0 ? documentPayloads : undefined,
          signal: abortController.signal,
          onToken: (token) => {
            accumulatedReply += token;
            if (!rafId) {
              rafId = requestAnimationFrame(() => {
                rafId = null;
                flushTokensToState();
              });
            }
          },
          onToolStart: (name, friendlyName, args) => {
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== asstMsgId) return msg;
                const existingTools = msg.tools || [];
                const newTool: ToolExecutionCard = {
                  name,
                  friendlyName,
                  args,
                  status: 'executing',
                };
                return { ...msg, tools: [...existingTools, newTool] };
              })
            );
          },
          onToolEnd: (name, friendlyName, result, statusStr) => {
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== asstMsgId) return msg;
                const existingTools = [...(msg.tools || [])];
                const idx = existingTools.findIndex(
                  (t) => t.name === name && t.status === 'executing'
                );
                const resolvedStatus: 'completed' | 'error' =
                  statusStr === 'error' ? 'error' : 'completed';
                if (idx !== -1) {
                  existingTools[idx] = {
                    ...existingTools[idx],
                    friendlyName: friendlyName || existingTools[idx].friendlyName,
                    result,
                    status: resolvedStatus,
                  };
                } else {
                  existingTools.push({
                    name,
                    friendlyName,
                    result,
                    status: resolvedStatus,
                  });
                }
                return { ...msg, tools: existingTools };
              })
            );
          },
          onResetAndFallback: () => {
            if (rafId) {
              cancelAnimationFrame(rafId);
              rafId = null;
            }
            accumulatedReply = '';
            setCharlieStatus('thinking');
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === asstMsgId ? { ...msg, content: '', status: 'streaming' } : msg
              )
            );
          },
          onCancelled: (partialReply) => {
            if (rafId) {
              cancelAnimationFrame(rafId);
              rafId = null;
            }
            setIsStreaming(false);
            setCharlieStatus('idle');
            streamingThreadIdRef.current = null;
            abortControllerRef.current = null;
            activeRequestIdRef.current = null;
            const finalPartial =
              partialReply || accumulatedReply || 'Geração interrompida pelo usuário.';
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === asstMsgId
                  ? {
                      ...msg,
                      content: finalPartial,
                      status: 'cancelled' as const,
                      isStreaming: false,
                    }
                  : msg
              )
            );
          },
          onDone: (fullReply, meta) => {
            if (rafId) {
              cancelAnimationFrame(rafId);
              rafId = null;
            }
            setIsStreaming(false);
            setCharlieStatus('idle');
            streamingThreadIdRef.current = null;
            abortControllerRef.current = null;
            activeRequestIdRef.current = null;
            const finalContent = fullReply || accumulatedReply;

            setMessages((prev) => {
              const updated = prev.map((msg) =>
                msg.id === asstMsgId
                  ? {
                      ...msg,
                      id: meta?.assistantMessageId || msg.id,
                      content: finalContent,
                      status: 'done' as const,
                      isStreaming: false,
                    }
                  : msg
              );
              if (targetThreadId) {
                StorageService.setCachedMessages(targetThreadId, updated);
              }
              return updated;
            });

            setThreads((prev) =>
              prev.map((t) => {
                if (t.id === targetThreadId) {
                  const shouldRename =
                    t.name === 'Nova Conversa' || t.name === 'Novo Chat' || !t.name;
                  const newName = shouldRename
                    ? visibleUserText.slice(0, 42) +
                      (visibleUserText.length > 42 ? '...' : '')
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
            if (rafId) {
              cancelAnimationFrame(rafId);
              rafId = null;
            }
            setIsStreaming(false);
            setCharlieStatus('error');
            streamingThreadIdRef.current = null;
            abortControllerRef.current = null;
            activeRequestIdRef.current = null;
            setTimeout(() => {
              setCharlieStatus((curr) => (curr === 'error' ? 'idle' : curr));
            }, 3500);
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
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
        setIsStreaming(false);
        setCharlieStatus('error');
        streamingThreadIdRef.current = null;
        abortControllerRef.current = null;
        activeRequestIdRef.current = null;
        setTimeout(() => {
          setCharlieStatus((curr) => (curr === 'error' ? 'idle' : curr));
        }, 3500);
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
    [activeThreadId, createNewThread, isStreaming, setDraft, stopStreaming]
  );

  // Edit user message inline, truncate subsequent messages in DB + UI, and stream new assistant reply
  const editUserMessage = useCallback(
    async (userMsgId: string, newContent: string) => {
      const clean = newContent.trim();
      if (!clean || isStreaming || !activeThreadId) return;

      const currentMsgs = messagesRef.current;
      const targetIdx = currentMsgs.findIndex((m) => m.id === userMsgId);
      if (targetIdx === -1) return;

      const targetMsg = currentMsgs[targetIdx];

      try {
        await ThreadsService.editMessage(activeThreadId, userMsgId, clean, true);
      } catch (err) {
        console.warn('Aviso ao persistir edição no backend:', err);
      }

      const updatedUserMsg: Message = {
        ...targetMsg,
        content: clean,
        isEdited: true,
        editedAt: new Date().toISOString(),
        version: (targetMsg.version || 1) + 1,
      };

      const truncated = [...currentMsgs.slice(0, targetIdx), updatedUserMsg];
      setMessages(truncated);
      StorageService.setCachedMessages(activeThreadId, truncated);

      await sendMessage(clean, targetMsg.attachments || [], activeThreadId, {
        skipUserMessageSave: true,
        skipUserBubbleInsert: true,
      });
    },
    [activeThreadId, isStreaming, sendMessage]
  );

  // Regenerate assistant message without duplicating the user message
  const regenerateAssistantMessage = useCallback(
    async (assistantMsgId: string) => {
      if (isStreaming || !activeThreadId) return;
      const currentMsgs = messagesRef.current;
      const asstIdx = currentMsgs.findIndex((m) => m.id === assistantMsgId);
      if (asstIdx === -1) return;

      let precedingUserMsg: Message | null = null;
      for (let i = asstIdx - 1; i >= 0; i--) {
        if (currentMsgs[i].role === 'user') {
          precedingUserMsg = currentMsgs[i];
          break;
        }
      }
      if (!precedingUserMsg) return;

      try {
        await ThreadsService.deleteFromMessage(activeThreadId, assistantMsgId, true);
      } catch (err) {
        console.warn('Aviso ao truncar mensagem para regeneração:', err);
      }

      const truncated = currentMsgs.slice(0, asstIdx);
      setMessages(truncated);
      StorageService.setCachedMessages(activeThreadId, truncated);

      await sendMessage(
        precedingUserMsg.content,
        precedingUserMsg.attachments || [],
        activeThreadId,
        {
          skipUserMessageSave: true,
          skipUserBubbleInsert: true,
        }
      );
    },
    [activeThreadId, isStreaming, sendMessage]
  );

  // Regenerate last message
  const regenerateLastMessage = useCallback(() => {
    if (messagesRef.current.length === 0 || isStreaming) return;
    const lastAsst = [...messagesRef.current].reverse().find((m) => m.role === 'assistant');
    if (lastAsst) {
      regenerateAssistantMessage(lastAsst.id);
    }
  }, [isStreaming, regenerateAssistantMessage]);

  // Retry failed assistant message without duplicating questions
  const retryAssistantMessage = useCallback(
    (failedMsgId: string) => {
      regenerateAssistantMessage(failedMsgId);
    },
    [regenerateAssistantMessage]
  );

  // Submit feedback 👍 (+1) / 👎 (-1)
  const submitMessageFeedback = useCallback(
    async (messageId: string, rating: 1 | -1) => {
      if (!activeThreadId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, feedback: m.feedback === rating ? null : rating }
            : m
        )
      );
      try {
        await ThreadsService.submitMessageFeedback(activeThreadId, messageId, rating);
      } catch (err) {
        console.warn('Erro ao enviar avaliação da mensagem:', err);
      }
    },
    [activeThreadId]
  );

  // Resend user message into draft
  const resendUserMessage = useCallback(
    (userMsg: Message) => {
      if (isStreaming) return;
      setDraft(userMsg.content);
    },
    [isStreaming, setDraft]
  );

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
    togglePinThread,
    toggleArchiveThread,
    deleteThread,
    sendMessage,
    stopStreaming,
    editUserMessage,
    regenerateAssistantMessage,
    regenerateLastMessage,
    retryAssistantMessage,
    submitMessageFeedback,
    resendUserMessage,
    clearCurrentChat,
    refreshThreads,
  };
}
