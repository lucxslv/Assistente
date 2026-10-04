import { api } from '@/src/services/api';
import { ApiMessage, ChatMessage, Thread } from '@/src/types/api';

export const threadsService = {
  list: () => api.get<Thread[]>('/threads'),
  create: (name = 'Novo Chat') => api.post<Thread>('/threads', { name }),
  rename: (id: string, name: string) => api.put<Thread>(`/threads/${id}`, { name }),
  remove: (id: string) => api.delete<void>(`/threads/${id}`),
  async messages(threadId: string): Promise<ChatMessage[]> {
    const rows = await api.get<ApiMessage[]>(`/messages?thread_id=${encodeURIComponent(threadId)}`);
    return rows.map((row) => ({
      id: row.id,
      role: row.type === 'user_message' ? 'user' : 'assistant',
      content: row.content,
      createdAt: row.createdAt ?? new Date().toISOString(),
      status: 'done',
    }));
  },
};
