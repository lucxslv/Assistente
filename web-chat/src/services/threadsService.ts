import { api } from './api';
import { StorageService } from './storage';
import { FileAttachment, Message, MessageStatus, Thread } from '../types/chat';

interface ApiAttachment {
  id?: string;
  name?: string;
  type?: string;
  size?: number;
  has_extracted_text?: boolean;
  preview_snippet?: string | null;
  extracted_text?: string | null;
  textPreview?: string | null;
  dataUrl?: string;
}

interface ApiMessage {
  id: string;
  name: string;
  type: string;
  role?: 'user' | 'assistant';
  content: string;
  status?: MessageStatus;
  request_id?: string | null;
  version?: number;
  is_edited?: boolean;
  edited_at?: string | null;
  attachments?: ApiAttachment[];
  feedback?: number | null;
  error_detail?: string | null;
  createdAt: string;
}

interface ApiThread {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  preview?: string;
  isPinned?: boolean;
  is_pinned?: boolean;
  isArchived?: boolean;
  is_archived?: boolean;
  pinnedAt?: string | null;
  archivedAt?: string | null;
}

function normalizeThread(raw: ApiThread): Thread {
  return {
    id: raw.id,
    name: raw.name || 'Nova Conversa',
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt || raw.createdAt,
    preview: raw.preview,
    isPinned: Boolean(raw.isPinned ?? raw.is_pinned ?? false),
    isArchived: Boolean(raw.isArchived ?? raw.is_archived ?? false),
    pinnedAt: raw.pinnedAt ?? null,
    archivedAt: raw.archivedAt ?? null,
  };
}

export const ThreadsService = {
  async getThreads(options?: { q?: string; includeArchived?: boolean }): Promise<Thread[]> {
    try {
      const params = new URLSearchParams();
      if (options?.q && options.q.trim()) {
        params.set('q', options.q.trim());
      }
      if (options?.includeArchived) {
        params.set('include_archived', 'true');
      }
      const qs = params.toString();
      const endpoint = qs ? `/threads?${qs}` : '/threads';
      const data = await api.get<ApiThread[]>(endpoint);
      const mapped = data.map(normalizeThread);
      if (!options?.q && !options?.includeArchived) {
        StorageService.setCachedThreads(mapped);
      }
      return mapped;
    } catch (err) {
      console.warn('Falha ao buscar threads remotas, usando cache local:', err);
      return StorageService.getCachedThreads();
    }
  },

  async createThread(name: string = 'Nova Conversa', idempotencyKey?: string): Promise<Thread> {
    try {
      const raw = await api.post<ApiThread>('/threads', {
        name,
        idempotency_key: idempotencyKey,
      });
      const thread = normalizeThread(raw);
      const current = StorageService.getCachedThreads();
      StorageService.setCachedThreads([thread, ...current.filter((t) => t.id !== thread.id)]);
      return thread;
    } catch (err) {
      console.warn('Falha ao criar thread remota, criando localmente:', err);
      const localThread: Thread = {
        id: crypto.randomUUID ? crypto.randomUUID() : 'local-' + Date.now(),
        name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isPinned: false,
        isArchived: false,
      };
      const current = StorageService.getCachedThreads();
      StorageService.setCachedThreads([localThread, ...current]);
      return localThread;
    }
  },

  async updateThread(
    id: string,
    payload: { name?: string; is_pinned?: boolean; is_archived?: boolean }
  ): Promise<Thread | null> {
    try {
      const raw = await api.patch<ApiThread>(`/threads/${id}`, payload);
      return normalizeThread(raw);
    } catch (err) {
      console.warn('Erro ao atualizar thread remotamente:', err);
      return null;
    }
  },

  async updateThreadName(id: string, name: string): Promise<void> {
    await this.updateThread(id, { name });
    const current = StorageService.getCachedThreads();
    const updated = current.map((t) =>
      t.id === id ? { ...t, name, updatedAt: new Date().toISOString() } : t
    );
    StorageService.setCachedThreads(updated);
  },

  async deleteThread(id: string): Promise<void> {
    try {
      await api.delete(`/threads/${id}`);
    } catch (err) {
      console.warn('Erro ao excluir thread remotamente:', err);
    }
    const current = StorageService.getCachedThreads();
    StorageService.setCachedThreads(current.filter((t) => t.id !== id));
  },

  async getMessages(threadId: string): Promise<Message[]> {
    try {
      const rows = await api.get<ApiMessage[]>(`/messages?thread_id=${encodeURIComponent(threadId)}`);
      const mapped: Message[] = rows.map((r) => {
        const mappedAtts: FileAttachment[] = (r.attachments || []).map((a, idx) => {
          const mime = a.type || 'application/octet-stream';
          const snippet = a.preview_snippet || a.extracted_text || a.textPreview || undefined;
          return {
            id: a.id || `${r.id}-att-${idx}`,
            name: a.name || 'arquivo',
            size: Number(a.size || 0),
            type: mime,
            isImage: mime.startsWith('image/'),
            dataUrl: a.dataUrl,
            textPreview: snippet,
            preview_snippet: snippet,
            has_extracted_text: Boolean(a.has_extracted_text || snippet),
          };
        });

        const rawStatus = r.status || 'completed';
        let uiStatus: MessageStatus = 'done';
        if (rawStatus === 'cancelled') uiStatus = 'cancelled';
        else if (rawStatus === 'interrupted') uiStatus = 'interrupted';
        else if (rawStatus === 'failed' || rawStatus === 'error') uiStatus = 'error';
        else if (rawStatus === 'in_progress') uiStatus = 'in_progress';

        return {
          id: r.id,
          role: r.role || (r.type === 'user_message' ? 'user' : 'assistant'),
          content: r.content || '',
          createdAt: r.createdAt,
          status: uiStatus,
          requestId: r.request_id || undefined,
          isEdited: Boolean(r.is_edited),
          editedAt: r.edited_at || null,
          version: r.version || 1,
          feedback: r.feedback ?? null,
          attachments: mappedAtts.length > 0 ? mappedAtts : undefined,
          error: r.error_detail || undefined,
          threadId,
        };
      });
      StorageService.setCachedMessages(threadId, mapped);
      return mapped;
    } catch (err) {
      console.warn('Falha ao buscar mensagens remotas, usando cache:', err);
      return StorageService.getCachedMessages(threadId);
    }
  },

  async editMessage(
    threadId: string,
    messageId: string,
    content: string,
    truncateSubsequent: boolean = true
  ): Promise<void> {
    await api.patch(`/messages/${encodeURIComponent(messageId)}`, {
      thread_id: threadId,
      content,
      truncate_subsequent: truncateSubsequent,
    });
  },

  async deleteFromMessage(
    threadId: string,
    messageId: string,
    inclusive: boolean = true
  ): Promise<void> {
    await api.delete(
      `/messages/${encodeURIComponent(messageId)}?thread_id=${encodeURIComponent(threadId)}&inclusive=${inclusive}`
    );
  },

  async submitMessageFeedback(
    threadId: string,
    messageId: string,
    rating: 1 | -1,
    comment?: string
  ): Promise<void> {
    await api.post(`/messages/${encodeURIComponent(messageId)}/feedback`, {
      thread_id: threadId,
      rating,
      comment,
    });
  },

  async cancelStream(requestId?: string | null, threadId?: string | null): Promise<void> {
    try {
      await api.post('/chat/cancel', {
        request_id: requestId || undefined,
        thread_id: threadId || undefined,
      });
    } catch (err) {
      console.warn('Aviso ao cancelar stream no servidor:', err);
    }
  },
};
