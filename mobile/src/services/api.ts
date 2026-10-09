import { getApiUrl } from '@/src/lib/config';
import { session } from '@/src/lib/session';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

const CLOUD_FALLBACK_URL = 'https://assistente-xi.vercel.app/api';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const [baseUrl, token] = await Promise.all([getApiUrl(), session.getToken()]);
  const effectiveToken = token || 'charlie_guest_token';

  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${effectiveToken}`);

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  let response: Response;

  // 1. Tenta a URL configurada como ativa
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    response = await fetch(`${baseUrl}${cleanPath}`, {
      ...init,
      headers,
      signal: init.signal || controller.signal,
    });
    clearTimeout(timeout);
  } catch {
    // 2. Se a URL ativa falhou e NÃO é a nuvem oficial, faz failover automático para a nuvem
    const isCloud = baseUrl.includes('vercel.app') || baseUrl.includes('assistente-xi');
    if (!isCloud) {
      try {
        const cloudController = new AbortController();
        const cloudTimeout = setTimeout(() => cloudController.abort(), 8000);

        response = await fetch(`${CLOUD_FALLBACK_URL}${cleanPath}`, {
          ...init,
          headers,
          signal: init.signal || cloudController.signal,
        });
        clearTimeout(cloudTimeout);
      } catch {
        throw new ApiError(0, 'Não foi possível conectar ao Charlie. Verifique sua conexão de rede.');
      }
    } else {
      throw new ApiError(0, 'Não foi possível conectar ao Charlie. Verifique sua conexão de rede.');
    }
  }

  // Se retornou 401 e estava usando outro token, retenta uma vez com guest_token
  if (response.status === 401 && effectiveToken !== 'charlie_guest_token') {
    try {
      headers.set('Authorization', 'Bearer charlie_guest_token');
      response = await fetch(`${baseUrl}${cleanPath}`, {
        ...init,
        headers,
      });
    } catch {
      // Ignora erro de retry e segue fluxo padrão
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.detail ?? body.message ?? `Erro HTTP ${response.status}`);
  }

  if (response.status === 204) return {} as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
