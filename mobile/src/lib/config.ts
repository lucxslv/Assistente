import * as SecureStore from 'expo-secure-store';

const DEFAULT_API_URL = 'https://assistente-xi.vercel.app/api';
const API_OVERRIDE_KEY = 'charlie.api-url';

function normalizeApiUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '');
  if (!normalized) return DEFAULT_API_URL;
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
}

export const configuredApiUrl = normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL);

export async function getApiUrl(): Promise<string> {
  try {
    const override = await SecureStore.getItemAsync(API_OVERRIDE_KEY);
    if (override && (override.includes('192.168.') || override.includes('localhost') || override.includes('127.0.0.1') || override.includes(':8005') || override.includes(':8000'))) {
      await SecureStore.deleteItemAsync(API_OVERRIDE_KEY);
      return configuredApiUrl;
    }
    return override ? normalizeApiUrl(override) : configuredApiUrl;
  } catch {
    return configuredApiUrl;
  }
}

export async function setApiUrl(value: string): Promise<string> {
  const normalized = normalizeApiUrl(value);
  await SecureStore.setItemAsync(API_OVERRIDE_KEY, normalized);
  return normalized;
}

export function getWebSocketUrl(apiUrl: string, token?: string): string {
  const url = `${apiUrl.replace(/^http/, 'ws')}/chat/ws`;
  const query = `client_type=mobile${token ? `&token=${encodeURIComponent(token)}` : ''}`;
  return `${url}?${query}`;
}
