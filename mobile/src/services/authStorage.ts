/**
 * Serviço de armazenamento seguro de credenciais de pareamento no mobile (Expo).
 * Utiliza expo-secure-store com isolamento de chave e fallback seguro.
 */

import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { normalizeServerUrl, serverConfigService } from '@/src/services/serverConfig';
import { session } from '@/src/lib/session';

export const AUTH_KEYS = {
  DEVICE_TOKEN: 'CHARLIE_DEVICE_TOKEN',
  SERVER_URL: 'CHARLIE_SERVER_URL',
  DEVICE_ID: 'CHARLIE_DEVICE_ID',
  DEVICE_NAME: 'CHARLIE_DEVICE_NAME',
  CONNECTION_MODE: 'CHARLIE_CONNECTION_MODE',
} as const;

export interface PairedCredentials {
  deviceToken: string;
  serverUrl: string;
  deviceId: string;
  deviceName: string;
  connectionMode: 'lan' | 'tunnel';
}

function generateSecureId(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    const ts = Date.now().toString(36);
    const r1 = Math.random().toString(36).substring(2, 10);
    const r2 = Math.random().toString(36).substring(2, 6);
    return `dev-${ts}-${r1}-${r2}`;
  }
}

export const authStorage = {
  /**
   * Obtém ou inicializa um identificador único de dispositivo (UUID estável)
   * que persiste nas instalações do app via SecureStore.
   */
  async getOrCreateDeviceId(): Promise<string> {
    try {
      const existing = await SecureStore.getItemAsync(AUTH_KEYS.DEVICE_ID);
      if (existing && existing.trim().length > 0) {
        return existing.trim();
      }
    } catch {
      // Ignora erro de leitura inicial
    }

    const newId = generateSecureId();
    try {
      await SecureStore.setItemAsync(AUTH_KEYS.DEVICE_ID, newId);
    } catch (e) {
      console.warn('[authStorage] Falha ao persistir deviceId no SecureStore:', e);
    }
    return newId;
  },

  /**
   * Retorna um nome descritivo padrão para o dispositivo móvel.
   */
  async getDeviceName(): Promise<string> {
    try {
      const stored = await SecureStore.getItemAsync(AUTH_KEYS.DEVICE_NAME);
      if (stored && stored.trim().length > 0) {
        return stored.trim();
      }
    } catch {
      // Ignora
    }

    const defaultName = Platform.select({
      ios: 'iPhone Charlie',
      android: 'Android Charlie',
      default: 'Dispositivo Mobile',
    });

    return defaultName;
  },

  /**
   * Persiste as credenciais permanentes após validação do PIN ou QR Code.
   * Sincroniza automaticamente com o serverConfigService e sessão global da API.
   */
  async savePairedCredentials(params: {
    token: string;
    serverUrl: string;
    deviceId: string;
    deviceName?: string;
    isLan: boolean;
  }): Promise<void> {
    const normalizedUrl = normalizeServerUrl(params.serverUrl);
    const mode = params.isLan ? 'lan' : 'tunnel';
    const devName = params.deviceName?.trim() || (await this.getDeviceName());

    try {
      await SecureStore.setItemAsync(AUTH_KEYS.DEVICE_TOKEN, params.token);
      await SecureStore.setItemAsync(AUTH_KEYS.SERVER_URL, normalizedUrl);
      await SecureStore.setItemAsync(AUTH_KEYS.DEVICE_ID, params.deviceId);
      await SecureStore.setItemAsync(AUTH_KEYS.DEVICE_NAME, devName);
      await SecureStore.setItemAsync(AUTH_KEYS.CONNECTION_MODE, mode);
    } catch (e) {
      console.warn('[authStorage] Erro ao gravar no SecureStore:', e);
    }

    // Sincroniza a sessão do cliente HTTP e perfil de usuário do Charlie
    const pairedUser = {
      id: params.deviceId,
      name: devName,
      email: `${devName.toLowerCase().replace(/[^a-z0-9]/g, '_')}@device.charlie`,
    };
    await session.save({ token: params.token, user: pairedUser });

    // Salva e ativa o perfil de servidor no gerenciador de perfis do app
    await serverConfigService.saveServer({
      name: 'Servidor Oficial',
      url: normalizedUrl,
      token: params.token,
      makeActive: true,
    });
  },

  /**
   * Recupera as credenciais ativas do dispositivo pareado.
   */
  async getPairedCredentials(): Promise<PairedCredentials | null> {
    try {
      const [token, url, deviceId, name, mode] = await Promise.all([
        SecureStore.getItemAsync(AUTH_KEYS.DEVICE_TOKEN),
        SecureStore.getItemAsync(AUTH_KEYS.SERVER_URL),
        SecureStore.getItemAsync(AUTH_KEYS.DEVICE_ID),
        SecureStore.getItemAsync(AUTH_KEYS.DEVICE_NAME),
        SecureStore.getItemAsync(AUTH_KEYS.CONNECTION_MODE),
      ]);

      if (!token || !url || !deviceId) {
        return null;
      }

      return {
        deviceToken: token,
        serverUrl: url,
        deviceId,
        deviceName: name || 'Dispositivo Mobile',
        connectionMode: (mode as 'lan' | 'tunnel') || 'lan',
      };
    } catch {
      return null;
    }
  },

  /**
   * Remove todas as credenciais pareadas e desconecta a sessão.
   */
  async clearPairedCredentials(): Promise<void> {
    try {
      await Promise.all([
        SecureStore.deleteItemAsync(AUTH_KEYS.DEVICE_TOKEN),
        SecureStore.deleteItemAsync(AUTH_KEYS.SERVER_URL),
        SecureStore.deleteItemAsync(AUTH_KEYS.CONNECTION_MODE),
      ]);
    } catch (e) {
      console.warn('[authStorage] Erro ao limpar SecureStore:', e);
    }

    await session.clear();
  },

  /**
   * Verifica se há um dispositivo atualmente pareado e ativo.
   */
  async isPaired(): Promise<boolean> {
    const creds = await this.getPairedCredentials();
    return creds !== null && Boolean(creds.deviceToken);
  },
};
