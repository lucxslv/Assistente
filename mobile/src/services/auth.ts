import { session } from '@/src/lib/session';
import { api } from '@/src/services/api';
import { AuthResponse, User } from '@/src/types/api';

export const authService = {
  async login(email: string, password: string) {
    const result = await api.post<AuthResponse>('/auth/login', { email, password });
    await session.save(result);
    return result.user;
  },
  async register(name: string, email: string, password: string) {
    const result = await api.post<AuthResponse>('/auth/register', { name, email, password });
    await session.save(result);
    return result.user;
  },
  async me() { return api.get<User>('/auth/me'); },
};
