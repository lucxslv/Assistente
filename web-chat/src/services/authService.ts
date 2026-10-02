import { api } from './api';
import { StorageService } from './storage';
import { AuthResponse, LoginCredentials, RegisterCredentials, User } from '../types/auth';

export const AuthService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const data = await api.post<AuthResponse>('/auth/login', credentials);
    if (data.token) {
      StorageService.setToken(data.token);
      StorageService.setUser(data.user);
    }
    return data;
  },

  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    const data = await api.post<AuthResponse>('/auth/register', credentials);
    if (data.token) {
      StorageService.setToken(data.token);
      StorageService.setUser(data.user);
    }
    return data;
  },

  async getMe(): Promise<User> {
    const token = StorageService.getToken();
    if (!token) {
      throw new Error('Sem token autenticado.');
    }
    const user = await api.get<User>('/auth/me');
    StorageService.setUser(user);
    return user;
  },

  logout(): void {
    StorageService.clearSession();
  },
};
