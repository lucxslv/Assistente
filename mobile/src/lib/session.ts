import * as SecureStore from 'expo-secure-store';
import { AuthResponse, User } from '@/src/types/api';

const TOKEN_KEY = 'charlie.token';
const USER_KEY = 'charlie.user';

export const session = {
  async getToken() { return SecureStore.getItemAsync(TOKEN_KEY); },
  async getUser(): Promise<User | null> {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    return raw ? JSON.parse(raw) as User : null;
  },
  async save({ token, user }: AuthResponse) {
    await Promise.all([SecureStore.setItemAsync(TOKEN_KEY, token), SecureStore.setItemAsync(USER_KEY, JSON.stringify(user))]);
  },
  async setToken(token: string) { await SecureStore.setItemAsync(TOKEN_KEY, token); },
  async clear() { await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), SecureStore.deleteItemAsync(USER_KEY)]); },
};
