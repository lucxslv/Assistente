import { Platform } from 'react-native';
import { authStorage } from '@/src/services/authStorage';
import { normalizeHostAddress, normalizeServerUrl, serverConfigService } from '@/src/services/serverConfig';

export interface DiscoveredDesktop {
  id?: string;
  name: string;
  lanUrl: string;
  isOnline: boolean;
  pairedAutomatically: boolean;
}

const DEFAULT_LAN_HOST = '192.168.0.190:8005';
const CLOUD_API_BASE = 'https://assistente-xi.vercel.app/api';

class DeviceDiscoveryService {
  /**
   * Tenta descobrir e vincular automaticamente o Charlie Desktop ativo na mesma rede local
   * ou vinculado à conta do usuário sem exigir inserção de PIN ou escaneamento de QR Code.
   */
  async autoDiscoverAndLink(): Promise<DiscoveredDesktop | null> {
    try {
      const deviceId = await authStorage.getOrCreateDeviceId();
      const deviceName = await authStorage.getDeviceName();

      // Candidatos a testar para descoberta
      const candidateHosts: string[] = [];

      // 1. Servidor ativo existente salvo
      const active = await serverConfigService.getActiveServer().catch(() => null);
      if (active && active.url && !active.url.includes('vercel.app')) {
        candidateHosts.push(active.url.replace(/\/api\/?$/, ''));
      }

      // 2. IP LAN detectado do host físico
      candidateHosts.push(normalizeHostAddress(DEFAULT_LAN_HOST));

      for (const host of candidateHosts) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2500);

          const normalizedBase = normalizeServerUrl(host).replace(/\/api\/?$/, '');
          const endpoint = `${normalizedBase}/api/pair/auto-link`;

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              device_id: deviceId,
              device_name: deviceName,
              platform: Platform.OS,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (res.ok) {
            const data = await res.json();
            const lanUrl = data.lan_url || normalizedBase;

            await authStorage.savePairedCredentials({
              token: data.token,
              serverUrl: `${normalizeServerUrl(lanUrl)}/api`,
              deviceId,
              deviceName,
              isLan: true,
            });

            return {
              name: data.server_name || 'Desktop Principal',
              lanUrl,
              isOnline: true,
              pairedAutomatically: true,
            };
          }
        } catch {
          // Timeout ou fora da rede local: continua procurando
        }
      }
    } catch (e) {
      console.warn('[deviceDiscovery] Falha no processo de descoberta:', e);
    }

    return null;
  }
}

export const deviceDiscoveryService = new DeviceDiscoveryService();
