import { User } from '../types/auth';
import { Message, Thread } from '../types/chat';
import { AppSettings, DEFAULT_SETTINGS } from '../types/settings';

const STORAGE_KEYS = {
  TOKEN: 'charlie_web_auth_token',
  USER: 'charlie_web_user',
  SETTINGS: 'charlie_web_settings',
  DRAFTS: 'charlie_web_drafts',
  THREADS_CACHE: 'charlie_web_threads_cache',
  MESSAGES_CACHE_PREFIX: 'charlie_web_msg_cache_',
  ACTIVE_THREAD: 'charlie_web_active_thread',
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

export const StorageService = {
  // Token
  getToken(): string | null {
    return localStorage.getItem(STORAGE_KEYS.TOKEN);
  },
  setToken(token: string | null): void {
    if (token) {
      localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    } else {
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
    }
  },

  // User
  getUser(): User | null {
    return safeJsonParse<User | null>(localStorage.getItem(STORAGE_KEYS.USER), null);
  },
  setUser(user: User | null): void {
    if (user) {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.USER);
    }
  },

  // Settings
  getSettings(): AppSettings {
    const saved = safeJsonParse<Partial<AppSettings>>(localStorage.getItem(STORAGE_KEYS.SETTINGS), {});
    return { ...DEFAULT_SETTINGS, ...saved };
  },
  saveSettings(settings: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
    return updated;
  },

  // Drafts per thread
  getDraft(threadId: string): string {
    const drafts = safeJsonParse<Record<string, string>>(localStorage.getItem(STORAGE_KEYS.DRAFTS), {});
    return drafts[threadId] || '';
  },
  saveDraft(threadId: string, text: string): void {
    const drafts = safeJsonParse<Record<string, string>>(localStorage.getItem(STORAGE_KEYS.DRAFTS), {});
    if (text.trim()) {
      drafts[threadId] = text;
    } else {
      delete drafts[threadId];
    }
    localStorage.setItem(STORAGE_KEYS.DRAFTS, JSON.stringify(drafts));
  },
  clearDraft(threadId: string): void {
    this.saveDraft(threadId, '');
  },

  // Offline Cache for Threads
  getCachedThreads(): Thread[] {
    return safeJsonParse<Thread[]>(localStorage.getItem(STORAGE_KEYS.THREADS_CACHE), []);
  },
  setCachedThreads(threads: Thread[]): void {
    localStorage.setItem(STORAGE_KEYS.THREADS_CACHE, JSON.stringify(threads));
  },

  // Offline Cache for Messages
  getCachedMessages(threadId: string): Message[] {
    return safeJsonParse<Message[]>(localStorage.getItem(`${STORAGE_KEYS.MESSAGES_CACHE_PREFIX}${threadId}`), []);
  },
  setCachedMessages(threadId: string, messages: Message[]): void {
    localStorage.setItem(`${STORAGE_KEYS.MESSAGES_CACHE_PREFIX}${threadId}`, JSON.stringify(messages));
  },

  // Active Thread ID (survives page reload)
  getActiveThreadId(): string | null {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_THREAD);
  },
  setActiveThreadId(threadId: string | null): void {
    if (threadId) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_THREAD, threadId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_THREAD);
    }
  },

  // Clear all session data
  clearSession(): void {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_THREAD);
  }
};
