import { normalizeServerUrl } from './serverConfig';

export type NetworkType = 'lan' | 'tailscale' | 'tunnel' | 'remote';

export interface ServerHealthResult {
  status: 'online' | 'offline';
  latencyMs: number | null;
  networkType: NetworkType;
  version?: string;
  error?: string;
}

/**
 * Identifica a topologia de rede pelo padrão da URL (LAN, Tailscale, Cloudflare Tunnel ou Remoto).
 */
export function detectNetworkType(rawUrl: string): NetworkType {
  const url = rawUrl.toLowerCase();

  // Tailscale: IP 100.64.0.0/10 ou domínio .ts.net
  if (url.includes('.ts.net') || /https?:\/\/100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./i.test(url)) {
    return 'tailscale';
  }

  // LAN / Privada / Localhost
  if (
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    url.includes('.local') ||
    /https?:\/\/(?:192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)/i.test(url)
  ) {
    return 'lan';
  }

  // Tunnels (Cloudflare, ngrok, localtunnel, etc.)
  if (
    url.includes('trycloudflare.com') ||
    url.includes('.tunnel.') ||
    url.includes('ngrok') ||
    url.includes('localtunnel.me')
  ) {
    return 'tunnel';
  }

  return 'remote';
}

/**
 * Executa uma sondagem rápida no endpoint /health com timeout de 3 segundos
 * e calcula a latência de ida e volta (RTT).
 */
export async function checkServerHealth(serverUrl: string): Promise<ServerHealthResult> {
  const base = normalizeServerUrl(serverUrl);
  const networkType = detectNetworkType(base);
  const startTime = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  // Tenta /health primeiro (ou /api/health se /api já estiver na URL base)
  const healthPath = base.endsWith('/api') ? `${base}/health` : `${base}/api/health`;

  try {
    const response = await fetch(healthPath, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timer);
    const latencyMs = Math.max(1, Date.now() - startTime);

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        status: 'online',
        latencyMs,
        networkType,
        version: typeof data?.version === 'string' ? data.version : '2.0.0',
      };
    }

    return {
      status: 'offline',
      latencyMs: null,
      networkType,
      error: `Status HTTP ${response.status}`,
    };
  } catch (error) {
    clearTimeout(timer);

    // Fallback: se falhou /api/health, tenta na raiz /health caso a URL não termine em /api
    if (!base.endsWith('/api')) {
      try {
        const directController = new AbortController();
        const fallbackTimer = setTimeout(() => directController.abort(), 2000);
        const fbStart = Date.now();
        const fbRes = await fetch(`${base}/health`, {
          method: 'GET',
          signal: directController.signal,
        });
        clearTimeout(fallbackTimer);
        if (fbRes.ok) {
          return {
            status: 'online',
            latencyMs: Math.max(1, Date.now() - fbStart),
            networkType,
          };
        }
      } catch {
        // Ignora e retorna erro abaixo
      }
    }

    const isAborted = error instanceof Error && error.name === 'AbortError';
    return {
      status: 'offline',
      latencyMs: null,
      networkType,
      error: isAborted ? 'Tempo limite esgotado (timeout 3s)' : 'Host inalcançável',
    };
  }
}
