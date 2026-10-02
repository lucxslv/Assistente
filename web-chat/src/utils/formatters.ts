import { Thread } from '../types/chat';

export function groupThreadsByPeriod(threads: Thread[]): Record<string, Thread[]> {
  const groups: Record<string, Thread[]> = {
    'Hoje': [],
    'Ontem': [],
    'Últimos 7 dias': [],
    'Anteriores': [],
  };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const sevenDaysAgoStart = todayStart - 7 * 86400000;

  for (const thread of threads) {
    const rawDate = thread.updatedAt || thread.createdAt;
    const itemDate = rawDate ? new Date(rawDate).getTime() : 0;

    if (itemDate >= todayStart) {
      groups['Hoje'].push(thread);
    } else if (itemDate >= yesterdayStart) {
      groups['Ontem'].push(thread);
    } else if (itemDate >= sevenDaysAgoStart) {
      groups['Últimos 7 dias'].push(thread);
    } else {
      groups['Anteriores'].push(thread);
    }
  }

  // Remove empty groups to keep clean view
  const result: Record<string, Thread[]> = {};
  for (const [key, list] of Object.entries(groups)) {
    if (list.length > 0) {
      result[key] = list;
    }
  }

  return result;
}

export function formatTimeOrDate(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
