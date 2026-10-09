import * as SecureStore from 'expo-secure-store';
import { setApiUrl } from '@/src/lib/config';
import { session } from '@/src/lib/session';

export interface ServerProfile {
  id: string;
  name: string;
  url: string;
  token?: string;
  isDefault?: boolean;
  createdAt?: string;
}

const STORAGE_SERVERS_KEY = 'charlie.servers.list';
const STORAGE_ACTIVE_ID_KEY = 'charlie.servers.active_id';

const FALLBACK_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://assistente-xi.vercel.app/api';

/** Normaliza URLs removendo barras finais e garantindo protocolo */
export function normalizeServerUrl(rawUrl: string): string {
  let url = rawUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  return url;
}

/**
 * Normaliza o endereço do host do usuário (IP ou domínio).
 * Se o usuário digitar "192.168.0.190" ou "192.168.0.190:8005",
 * garante "http://" e a porta 8005 padrão para LAN se omitida.
 * Remove também qualquer "/api" residual no final para evitar duplicidade.
 */
export function normalizeHostAddress(input: string, defaultPort = 8005): string {
  let clean = input.trim();
  if (!clean) return '';
  clean = clean.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(clean)) {
    clean = `http://${clean}`;
  }
  const match = clean.match(/^(https?:\/\/)([0-9a-zA-Z.-]+)(?::(\d+))?(\/.*)?$/);
  if (match) {
    const proto = match[1];
    const host = match[2];
    const port = match[3];
    if (!port && (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) || host === 'localhost')) {
      return `${proto}${host}:${defaultPort}`;
    }
    return `${proto}${host}${port ? `:${port}` : ''}`;
  }
  return clean;
}

/** Perfil padrão caso nenhum ambiente esteja configurado */
export function getDefaultServerProfile(): ServerProfile {
  return {
    id: 'default-cloud',
    name: 'Servidor Oficial',
    url: normalizeServerUrl(FALLBACK_URL),
    isDefault: true,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Serviço de gerenciamento e persistência de múltiplos servidores e ambientes do Charlie.
 * Armazena perfis e tokens com criptografia via Expo SecureStore.
 */
class ServerConfigService {
  /**
   * Retorna a lista de todos os servidores cadastrados.
   * Se vazia, inicializa com o servidor padrão.
   */
  async listServers(): Promise<ServerProfile[]> {
    try {
      const json = await SecureStore.getItemAsync(STORAGE_SERVERS_KEY);
      if (json) {
        const parsed = JSON.parse(json) as ServerProfile[];
          // Garante apenas perfis de servidor válidos (eliminando IPs de LAN offline como 192.168.* e 169.254.*)
          const valid = parsed.filter((s) => !/https?:\/\/(?:169\.254|192\.168|127\.0\.0\.1|localhost)/i.test(s.url));
          if (valid.length > 0) {
            return valid;
          }
      }
    } catch {
      // Ignora erro de leitura e usa fallback
    }

    const defaultServer = getDefaultServerProfile();
    await this.persistList([defaultServer]);
    return [defaultServer];
  }

  /**
   * Retorna o servidor ativo no momento.
   */
  async getActiveServer(): Promise<ServerProfile> {
    const servers = await this.listServers();
    try {
      const activeId = await SecureStore.getItemAsync(STORAGE_ACTIVE_ID_KEY);
      if (activeId) {
        const found = servers.find((s) => s.id === activeId && !/https?:\/\/169\.254\./i.test(s.url));
        if (found) return found;
      }
    } catch {
      // Fallback para o primeiro servidor
    }

    const selected = servers.find((s) => s.isDefault) ?? servers[0] ?? getDefaultServerProfile();
    await this.setActiveServer(selected.id);
    return selected;
  }

  /**
   * Define o servidor ativo e sincroniza as configurações globais da API e token.
   */
  async setActiveServer(id: string): Promise<ServerProfile> {
    const servers = await this.listServers();
    const target = servers.find((s) => s.id === id);

    if (!target) {
      throw new Error(`Servidor com ID "${id}" não encontrado.`);
    }

    await SecureStore.setItemAsync(STORAGE_ACTIVE_ID_KEY, target.id);

    // Sincroniza a URL no config global da API
    await setApiUrl(target.url);

    // Se o perfil trouxer token associado, sincroniza na sessão
    if (target.token) {
      await session.setToken(target.token);
    }

    return target;
  }

  /**
   * Salva ou atualiza um perfil de servidor.
   */
  async saveServer(
    profile: Omit<ServerProfile, 'id'> & { id?: string; makeActive?: boolean }
  ): Promise<ServerProfile> {
    const servers = await this.listServers();
    const id = profile.id ?? `srv-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
    const normalizedUrl = normalizeServerUrl(profile.url);

    const newProfile: ServerProfile = {
      id,
      name: profile.name.trim() || 'Servidor Charlie',
      url: normalizedUrl,
      token: profile.token?.trim(),
      isDefault: Boolean(profile.isDefault),
      createdAt: new Date().toISOString(),
    };

    const existingIndex = servers.findIndex((s) => s.id === id || s.url === normalizedUrl);

    let updatedList: ServerProfile[];
    if (existingIndex >= 0) {
      updatedList = [...servers];
      updatedList[existingIndex] = {
        ...updatedList[existingIndex],
        ...newProfile,
      };
    } else {
      updatedList = [newProfile, ...servers];
    }

    await this.persistList(updatedList);

    if (profile.makeActive || updatedList.length === 1) {
      await this.setActiveServer(newProfile.id);
    }

    return newProfile;
  }

  /**
   * Remove um perfil de servidor.
   */
  async deleteServer(id: string): Promise<void> {
    const servers = await this.listServers();
    const filtered = servers.filter((s) => s.id !== id);

    if (filtered.length === 0) {
      filtered.push(getDefaultServerProfile());
    }

    await this.persistList(filtered);

    const activeId = await SecureStore.getItemAsync(STORAGE_ACTIVE_ID_KEY);
    if (activeId === id) {
      await this.setActiveServer(filtered[0].id);
    }
  }

  private async persistList(servers: ServerProfile[]): Promise<void> {
    await SecureStore.setItemAsync(STORAGE_SERVERS_KEY, JSON.stringify(servers));
  }
}

export const serverConfigService = new ServerConfigService();
