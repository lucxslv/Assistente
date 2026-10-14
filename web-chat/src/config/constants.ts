/**
 * Centralized runtime constants — single source of truth for API endpoints.
 * Evita divergência entre api.ts, transport.ts e vite.config.ts.
 */

export const CLOUD_API_BASE = 'https://assistente-xi.vercel.app/api';
export const LOCAL_API_BASE = 'http://127.0.0.1:8005/api';

// Fallback WS derived from CLOUD_API_BASE when no explicit WS URL is set.
export const CLOUD_WS_BASE = CLOUD_API_BASE.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:') + '/chat/ws';
