export type StreamingMode = 'sse' | 'ws' | 'rest';

export interface AppSettings {
  apiUrl: string;
  wsUrl: string;
  streamingMode: StreamingMode;
  customToken?: string;
  autoScroll: boolean;
  sendOnEnter: boolean;
  soundEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  apiUrl: import.meta.env.VITE_CHARLIE_API_URL || '/api',
  wsUrl: import.meta.env.VITE_CHARLIE_WS_URL || '',
  streamingMode: 'sse',
  autoScroll: true,
  sendOnEnter: true,
  soundEnabled: false,
};
