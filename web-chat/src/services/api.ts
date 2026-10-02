import { StorageService } from './storage';

export interface ApiErrorResponse {
  detail?: string;
  message?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  status: number;
  data?: ApiErrorResponse;

  constructor(status: number, message: string, data?: ApiErrorResponse) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

type ConnectionListener = (isOnline: boolean) => void;
type UnauthorizedListener = () => void;

const LOCAL_API = 'http://127.0.0.1:8005/api';
const CLOUD_API = 'https://assistente-xi.vercel.app/api';

function resolveDefaultApi(): string {
  if (typeof window === 'undefined') return CLOUD_API;
  
  // 1. Env variable takes precedence if provided during build
  if (import.meta.env.VITE_CHARLIE_API_URL) {
    return import.meta.env.VITE_CHARLIE_API_URL.replace(/\/+$/, '');
  }

  const host = window.location.hostname;
  // 2. Se estiver rodando na nuvem (Vercel ou domínio de produção)
  if (host.includes('vercel.app')) {
    return 'https://assistente-xi.vercel.app/api';
  }

  // 3. Se estiver rodando no Vite Dev Server (porta 3000), o proxy encaminha /api para o backend local 8005
  if (host === 'localhost' || host === '127.0.0.1') {
    return '/api';
  }

  return CLOUD_API;
}

class ApiClient {
  private connectionListeners: Set<ConnectionListener> = new Set();
  private unauthorizedListeners: Set<UnauthorizedListener> = new Set();
  private isOnlineStatus: boolean = navigator.onLine;
  private activeBaseUrl: string = resolveDefaultApi();
  private hasTriedCloudFallback: boolean = false;

  constructor() {
    window.addEventListener('online', () => this.setOnline(true));
    window.addEventListener('offline', () => this.setOnline(false));
  }

  public subscribeConnection(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.isOnlineStatus);
    return () => this.connectionListeners.delete(listener);
  }

  public subscribeUnauthorized(listener: UnauthorizedListener): () => void {
    this.unauthorizedListeners.add(listener);
    return () => this.unauthorizedListeners.delete(listener);
  }

  public setOnline(status: boolean): void {
    if (this.isOnlineStatus !== status) {
      this.isOnlineStatus = status;
      this.connectionListeners.forEach((l) => l(status));
    }
  }

  public getBaseUrl(): string {
    return this.activeBaseUrl.replace(/\/+$/, '');
  }

  public getWsUrl(): string {
    const base = this.getBaseUrl();
    if (base.startsWith('http://')) {
      return base.replace('http://', 'ws://') + '/chat/ws';
    }
    if (base.startsWith('https://')) {
      return base.replace('https://', 'wss://') + '/chat/ws';
    }
    // Relative URL (e.g. /api)
    if (typeof window !== 'undefined') {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}${base}/chat/ws`;
    }
    return 'wss://assistente-xi.vercel.app/api/chat/ws';
  }

  public getHeaders(customHeaders: HeadersInit = {}): Headers {
    const headers = new Headers(customHeaders);
    
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const token = StorageService.getToken();
    if (token) {
      const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
      headers.set('Authorization', `Bearer ${cleanToken}`);
    }

    return headers;
  }

  public async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const baseUrl = this.getBaseUrl();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${baseUrl}${cleanEndpoint}`;
    const headers = this.getHeaders(options.headers);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      this.setOnline(true);

      if (response.status === 401) {
        // Trigger unauthorized listeners if not already handled
        this.unauthorizedListeners.forEach((l) => l());
      }

      if (!response.ok) {
        let errData: ApiErrorResponse = {};
        try {
          errData = await response.json();
        } catch {
          errData = { detail: response.statusText };
        }
        const message = errData.detail || errData.message || `Erro HTTP ${response.status}: ${response.statusText}`;
        throw new ApiError(response.status, message, errData);
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      return (await response.json()) as T;
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        throw err;
      }

      // Se falhar por conexão local, faz fallback automático transparente para a nuvem
      if (!this.hasTriedCloudFallback && this.activeBaseUrl !== CLOUD_API) {
        console.warn(`[Charlie Web] Backend local indisponível em ${this.activeBaseUrl}. Ativando fallback automático para a nuvem (${CLOUD_API})...`);
        this.activeBaseUrl = CLOUD_API;
        this.hasTriedCloudFallback = true;
        const retryUrl = `${CLOUD_API}${cleanEndpoint}`;
        try {
          const retryResp = await fetch(retryUrl, { ...options, headers });
          if (retryResp.ok) {
            this.setOnline(true);
            return (await retryResp.json()) as T;
          }
        } catch {
          // Continua para erro padrão
        }
      }

      // Network / offline error
      const isNetworkError = (err as Error).name === 'TypeError' || (err as Error).message.includes('fetch');
      if (isNetworkError) {
        this.setOnline(false);
      }

      throw new ApiError(0, (err as Error)?.message || 'Erro de conexão com o servidor Charlie.');
    }
  }

  public async get<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public async post<T>(endpoint: string, body?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public async patch<T>(endpoint: string, body?: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  public async delete<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  public async checkHealth(): Promise<{ status: string; service?: string; ok: boolean }> {
    try {
      const res = await this.get<{ status: string; service?: string }>('/health');
      this.setOnline(true);
      return { ...res, ok: res.status === 'ok' || res.status === 'online' };
    } catch {
      // Try root or /api/health
      try {
        const rootRes = await this.get<{ status: string }>('/');
        this.setOnline(true);
        return { status: rootRes.status || 'ok', ok: true };
      } catch {
        this.setOnline(false);
        return { status: 'offline', ok: false };
      }
    }
  }
}

export const api = new ApiClient();
