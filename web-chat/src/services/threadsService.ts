import { api } from './api';
import { StorageService } from './storage';
import { Message, Thread } from '../types/chat';

interface ApiMessage {
  id: string;
  name: string;
  type: string;
  content: string;
  createdAt: string;
}

export const ThreadsService = {
  async getThreads(): Promise<Thread[]> {
    try {
      const data = await api.get<Thread[]>('/threads');
      StorageService.setCachedThreads(data);
      return data;
    } catch (err) {
      console.warn('Falha ao buscar threads remotas, usando cache local:', err);
      return StorageService.getCachedThreads();
    }
  },

  async createThread(name: string = 'Nova Conversa'): Promise<Thread> {
    try {
      const thread = await api.post<Thread>('/threads', { name });
      const current = StorageService.getCachedThreads();
      StorageService.setCachedThreads([thread, ...current]);
      return thread;
    } catch (err) {
      console.warn('Falha ao criar thread remota, criando localmente:', err);
      const localThread: Thread = {
        id: crypto.randomUUID ? crypto.randomUUID() : 'local-' + Date.now(),
        name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const current = StorageService.getCachedThreads();
      StorageService.setCachedThreads([localThread, ...current]);
      return localThread;
    }
  },

  async updateThreadName(id: string, name: string): Promise<void> {
    try {
      await api.patch(`/threads/${id}`, { name });
    } catch (err) {
      console.warn('Erro ao atualizar nome da thread remotamente:', err);
    }
    const current = StorageService.getCachedThreads();
    const updated = current.map((t) => (t.id === id ? { ...t, name, updatedAt: new Date().toISOString() } : t));
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
      const mapped: Message[] = rows.map((r) => ({
        id: r.id,
        role: r.type === 'user_message' ? 'user' : 'assistant',
        content: r.content,
        createdAt: r.createdAt,
        status: 'done',
        threadId,
      }));
      StorageService.setCachedMessages(threadId, mapped);
      return mapped;
    } catch (err) {
      console.warn('Falha ao buscar mensagens remotas, usando cache:', err);
      return StorageService.getCachedMessages(threadId);
    }
  },
};
