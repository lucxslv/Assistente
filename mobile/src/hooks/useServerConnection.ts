import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { checkServerHealth, NetworkType, ServerHealthResult } from '@/src/services/apiClient';
import { ServerProfile, serverConfigService } from '@/src/services/serverConfig';

export interface ServerConnectionState {
  activeServer: ServerProfile | null;
  status: 'online' | 'offline' | 'checking';
  latencyMs: number | null;
  networkType: NetworkType;
  badgeText: string;
  badgeColor: string;
  isOnline: boolean;
  isRelayFailover: boolean;
  refresh: () => Promise<void>;
  switchServer: (id: string) => Promise<void>;
}

export function useServerConnection(): ServerConnectionState {
  const [activeServer, setActiveServerState] = useState<ServerProfile | null>(null);
  const [health, setHealth] = useState<ServerHealthResult>({
    status: 'offline',
    latencyMs: null,
    networkType: 'remote',
  });
  const [checking, setChecking] = useState(true);
  const [isRelayFailover, setIsRelayFailover] = useState(false);

  const applyServer = useCallback((server: ServerProfile) => {
    setActiveServerState((prev) => {
      if (prev && prev.id === server.id && prev.url === server.url && prev.name === server.name) {
        return prev;
      }
      return server;
    });
  }, []);

  const applyHealth = useCallback((result: ServerHealthResult) => {
    setHealth((prev) => {
      if (
        prev.status === result.status &&
        prev.latencyMs === result.latencyMs &&
        prev.networkType === result.networkType &&
        prev.error === result.error
      ) {
        return prev;
      }
      return result;
    });
  }, []);

  const checkConnection = useCallback(async () => {
    try {
      const server = await serverConfigService.getActiveServer();
      applyServer(server);
      const result = await checkServerHealth(server.url);

      if (result.status === 'online') {
        // Se a rota primária (LAN/Túnel) está online, desativa qualquer relay failover
        setIsRelayFailover(false);
        applyHealth(result);
        return;
      }

      // Se o servidor primário configurado está offline e não é a nuvem, testa a nuvem como failover volátil
      if (result.status === 'offline' && !server.url.includes('vercel.app')) {
        const cloudHealth = await checkServerHealth('https://assistente-xi.vercel.app/api');
        if (cloudHealth.status === 'online') {
          // Failover volátil EM MEMÓRIA: NÃO sobrescreve o servidor padrão no SecureStore
          setIsRelayFailover(true);
          applyHealth({
            ...cloudHealth,
            networkType: 'remote',
          });
          return;
        }
      }

      setIsRelayFailover(false);
      applyHealth(result);
    } catch {
      applyHealth({
        status: 'offline',
        latencyMs: null,
        networkType: 'remote',
        error: 'Falha ao obter servidor ativo',
      });
    } finally {
      setChecking(false);
    }
  }, [applyServer, applyHealth]);

  const switchServer = useCallback(
    async (id: string) => {
      setChecking(true);
      setIsRelayFailover(false);
      const updated = await serverConfigService.setActiveServer(id);
      applyServer(updated);
      const result = await checkServerHealth(updated.url);
      applyHealth(result);
      setChecking(false);
    },
    [applyServer, applyHealth]
  );

  // Monitoramento periódico adaptativo com pausa em background
  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const runProbe = async () => {
      if (AppState.currentState !== 'active') return;
      try {
        const server = await serverConfigService.getActiveServer();
        if (!mounted) return;
        applyServer(server);

        const primaryHealth = await checkServerHealth(server.url);
        if (!mounted) return;

        if (primaryHealth.status === 'online') {
          setIsRelayFailover(false);
          applyHealth(primaryHealth);
          return;
        }

        // Se primário falhou, sonda nuvem sem alterar SecureStore
        if (!server.url.includes('vercel.app')) {
          const cloudHealth = await checkServerHealth('https://assistente-xi.vercel.app/api');
          if (!mounted) return;
          if (cloudHealth.status === 'online') {
            setIsRelayFailover(true);
            applyHealth({ ...cloudHealth, networkType: 'remote' });
            return;
          }
        }

        setIsRelayFailover(false);
        applyHealth(primaryHealth);
      } catch {
        if (!mounted) return;
        applyHealth({
          status: 'offline',
          latencyMs: null,
          networkType: 'remote',
          error: 'Falha na sondagem periódica',
        });
      } finally {
        if (mounted) setChecking(false);
      }
    };

    runProbe();
    timer = setInterval(runProbe, 15000);

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        runProbe();
      }
    });

    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
      subscription.remove();
    };
  }, [applyServer, applyHealth]);

  // Formatação transparente do status para o usuário
  let badgeText = 'A verificar...';
  let badgeColor = '#F59E0B'; // Amarelo enquanto sonda

  if (!checking) {
    if (health.status === 'online') {
      const latencyStr = health.latencyMs ? `${health.latencyMs}ms` : '';
      if (isRelayFailover) {
        badgeColor = '#818CF8'; // Índigo suave
        badgeText = `Relay Nuvem (${latencyStr})`;
      } else {
        badgeColor = '#22C55E'; // Verde neon
        switch (health.networkType) {
          case 'lan':
            badgeText = `Conectado (LAN ${latencyStr})`;
            break;
          case 'tailscale':
            badgeText = `Tailscale (${latencyStr})`;
            break;
          case 'tunnel':
            badgeText = `Túnel (${latencyStr})`;
            break;
          default:
            badgeText = `Nuvem (${latencyStr})`;
            break;
        }
      }
    } else {
      badgeColor = '#EF4444'; // Vermelho
      badgeText = 'Desconectado';
    }
  }

  return useMemo(
    () => ({
      activeServer,
      status: checking ? 'checking' : health.status,
      latencyMs: health.latencyMs,
      networkType: health.networkType,
      badgeText,
      badgeColor,
      isOnline: health.status === 'online',
      isRelayFailover,
      refresh: checkConnection,
      switchServer,
    }),
    [activeServer, checking, health.status, health.latencyMs, health.networkType, badgeText, badgeColor, isRelayFailover, checkConnection, switchServer]
  );
}
