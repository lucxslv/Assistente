import { useCallback, useEffect, useState } from 'react';
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

  const checkConnection = useCallback(async () => {
    try {
      const server = await serverConfigService.getActiveServer();
      setActiveServerState(server);
      const result = await checkServerHealth(server.url);
      setHealth(result);
    } catch {
      setHealth({
        status: 'offline',
        latencyMs: null,
        networkType: 'remote',
        error: 'Falha ao obter servidor ativo',
      });
    } finally {
      setChecking(false);
    }
  }, []);

  const switchServer = useCallback(
    async (id: string) => {
      setChecking(true);
      const updated = await serverConfigService.setActiveServer(id);
      setActiveServerState(updated);
      const result = await checkServerHealth(updated.url);
      setHealth(result);
      setChecking(false);
    },
    []
  );

  // Monitoramento periódico (a cada 30 segundos) com mounted guard
  useEffect(() => {
    let mounted = true;

    const runCheck = async () => {
      try {
        const server = await serverConfigService.getActiveServer();
        if (!mounted) return;
        setActiveServerState(server);
        const result = await checkServerHealth(server.url);
        if (!mounted) return;
        setHealth(result);
      } catch {
        if (!mounted) return;
        setHealth({
          status: 'offline',
          latencyMs: null,
          networkType: 'remote',
          error: 'Falha ao obter servidor ativo',
        });
      } finally {
        if (mounted) setChecking(false);
      }
    };

    runCheck();
    const interval = setInterval(runCheck, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Re-checa ao voltar do background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkConnection();
      }
    });
    return () => subscription.remove();
  }, [checkConnection]);

  // Formatação do badge para o cabeçalho
  let badgeText = 'A verificar...';
  let badgeColor = '#F59E0B'; // Amarelo/laranja enquanto checa

  if (!checking) {
    if (health.status === 'online') {
      badgeColor = '#22C55E'; // Verde neon
      const latencyStr = health.latencyMs ? `${health.latencyMs}ms` : '';
      switch (health.networkType) {
        case 'lan':
          badgeText = `LAN (${latencyStr})`;
          break;
        case 'tailscale':
          badgeText = `Tailscale (${latencyStr})`;
          break;
        case 'tunnel':
          badgeText = `Túnel (${latencyStr})`;
          break;
        default:
          badgeText = `Remoto (${latencyStr})`;
          break;
      }
    } else {
      badgeColor = '#EF4444'; // Vermelho
      badgeText = 'Desconectado';
    }
  }

  return {
    activeServer,
    status: checking ? 'checking' : health.status,
    latencyMs: health.latencyMs,
    networkType: health.networkType,
    badgeText,
    badgeColor,
    isOnline: health.status === 'online',
    refresh: checkConnection,
    switchServer,
  };
}
