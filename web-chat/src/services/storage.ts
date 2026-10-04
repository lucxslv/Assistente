import { User } from '../types/auth';
import { Message, Thread } from '../types/chat';
import { AppSettings, DEFAULT_SETTINGS } from '../types/settings';
import { mediaDb } from './mediaDb';

const BASE_KEYS = {
  TOKEN: 'charlie_web_auth_token',
  USER: 'charlie_web_user',
  SETTINGS: 'charlie_web_settings',
};

// Safe JSON parse helper
function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function getCurrentUserId(): string {
  try {
    const raw = localStorage.getItem(BASE_KEYS.USER);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id) return String(parsed.id);
    }
  } catch {
    // fallback
  }
  return 'default';
}

export const StorageService = {
  // Helper de chaves com isolamento estrito por usuário
  getUserPrefix(userId?: string): string {
    return `chat_${userId || getCurrentUserId()}_`;
  },

  getThreadsKey(userId?: string): string {
    return `${this.getUserPrefix(userId)}threads_cache`;
  },

  getMessagesKey(threadId: string, userId?: string): string {
    return `${this.getUserPrefix(userId)}msg_${threadId}`;
  },

  getDraftsKey(userId?: string): string {
    return `${this.getUserPrefix(userId)}drafts`;
  },

  getActiveThreadKey(userId?: string): string {
    return `${this.getUserPrefix(userId)}active_thread`;
  },

  // Token
  getToken(): string | null {
    return localStorage.getItem(BASE_KEYS.TOKEN);
  },
  setToken(token: string | null): void {
    if (token) {
      localStorage.setItem(BASE_KEYS.TOKEN, token);
    } else {
      localStorage.removeItem(BASE_KEYS.TOKEN);
    }
  },

  // User
  getUser(): User | null {
    return safeJsonParse<User | null>(localStorage.getItem(BASE_KEYS.USER), null);
  },
  setUser(user: User | null): void {
    if (user) {
      localStorage.setItem(BASE_KEYS.USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(BASE_KEYS.USER);
    }
  },

  // Settings
  getSettings(): AppSettings {
    const saved = safeJsonParse<Partial<AppSettings>>(localStorage.getItem(BASE_KEYS.SETTINGS), {});
    return { ...DEFAULT_SETTINGS, ...saved };
  },
  saveSettings(settings: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(BASE_KEYS.SETTINGS, JSON.stringify(updated));
    return updated;
  },

  // Drafts per thread (isolado por usuário)
  getDraft(threadId: string, userId?: string): string {
    const drafts = safeJsonParse<Record<string, string>>(localStorage.getItem(this.getDraftsKey(userId)), {});
    return drafts[threadId] || '';
  },
  saveDraft(threadId: string, text: string, userId?: string): void {
    const drafts = safeJsonParse<Record<string, string>>(localStorage.getItem(this.getDraftsKey(userId)), {});
    if (text.trim()) {
      drafts[threadId] = text;
    } else {
      delete drafts[threadId];
    }
    localStorage.setItem(this.getDraftsKey(userId), JSON.stringify(drafts));
  },
  clearDraft(threadId: string, userId?: string): void {
    this.saveDraft(threadId, '', userId);
  },

  // Offline Cache for Threads (isolado por usuário)
  getCachedThreads(userId?: string): Thread[] {
    return safeJsonParse<Thread[]>(localStorage.getItem(this.getThreadsKey(userId)), []);
  },
  setCachedThreads(threads: Thread[], userId?: string): void {
    localStorage.setItem(this.getThreadsKey(userId), JSON.stringify(threads));
  },

  // Offline Cache for Messages (isolado por usuário e sanitizado contra base64 bruto)
  getCachedMessages(threadId: string, userId?: string): Message[] {
    return safeJsonParse<Message[]>(localStorage.getItem(this.getMessagesKey(threadId, userId)), []);
  },
  setCachedMessages(threadId: string, messages: Message[], userId?: string): void {
    // Sanitização de mídia: remove dataUrl (base64 bruto) antes de salvar no localStorage
    // Preserva apenas metadados (id, name, size, isImage, mimeType) para evitar estourar cota de 5MB
    const sanitizedMessages = messages.map((msg) => {
      if (!msg.attachments || msg.attachments.length === 0) return msg;
      return {
        ...msg,
        attachments: msg.attachments.map((att) => ({
          id: att.id,
          name: att.name,
          size: att.size,
          isImage: att.isImage,
          type: att.type,
          textPreview: att.textPreview,
          // dataUrl omitido intencionalmente
        })),
      };
    });

    localStorage.setItem(this.getMessagesKey(threadId, userId), JSON.stringify(sanitizedMessages));
  },

  // Active Thread ID (isolado por usuário)
  getActiveThreadId(userId?: string): string | null {
    return localStorage.getItem(this.getActiveThreadKey(userId));
  },
  setActiveThreadId(threadId: string | null, userId?: string): void {
    if (threadId) {
      localStorage.setItem(this.getActiveThreadKey(userId), threadId);
    } else {
      localStorage.removeItem(this.getActiveThreadKey(userId));
    }
  },

  // Purge completo no logout: elimina dados isolados do usuário, caches e chaves temporárias
  purgeAllUserData(userId?: string): void {
    const targetId = userId || getCurrentUserId();
    const prefix = `chat_${targetId}_`;
    const toRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith(prefix) ||
          key.startsWith('charlie_web_msg_cache_') ||
          key === 'charlie_web_drafts' ||
          key === 'charlie_web_threads_cache' ||
          key === 'charlie_web_active_thread')
      ) {
        toRemove.push(key);
      }
    }

    toRemove.forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem(BASE_KEYS.TOKEN);
    localStorage.removeItem(BASE_KEYS.USER);

    // Expurga cache de mídias no IndexedDB
    try {
      mediaDb.clearUserMedia(targetId);
    } catch {
      // Ignora erro
    }
  },

  // Clear session wrapper
  clearSession(userId?: string): void {
    this.purgeAllUserData(userId);
  },
};
