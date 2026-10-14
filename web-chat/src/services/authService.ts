import { api } from './api';
import { StorageService } from './storage';
import {
  AuthResponse,
  ForgotPasswordResponse,
  LoginCredentials,
  ProfileUpdatePayload,
  RegisterCredentials,
  User,
} from '../types/auth';

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

  async forgotPassword(email: string): Promise<ForgotPasswordResponse> {
    return api.post<ForgotPasswordResponse>('/auth/forgot-password', { email });
  },

  async resetPassword(token: string, newPassword: string): Promise<{ status: string; message: string }> {
    return api.post<{ status: string; message: string }>('/auth/reset-password', {
      token,
      new_password: newPassword,
    });
  },

  async updateProfile(payload: ProfileUpdatePayload): Promise<User> {
    const res = await api.patch<{ status: string; user: User }>('/auth/profile', payload);
    const updatedUser = res.user;
    if (updatedUser) {
      StorageService.setUser(updatedUser);
    }
    return updatedUser;
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

  async logout(): Promise<void> {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignora erro de rede no logout
    } finally {
      StorageService.clearSession();
    }
  },
};
