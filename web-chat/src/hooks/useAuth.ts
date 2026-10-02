import { useState, useEffect, useCallback } from 'react';
import { User, LoginCredentials, RegisterCredentials } from '../types/auth';
import { AuthService } from '../services/authService';
import { StorageService } from '../services/storage';
import { api } from '../services/api';

export function useAuth() {
  const [user, setUser] = useState<User | null>(() => StorageService.getUser());
  const [token, setToken] = useState<string | null>(() => StorageService.getToken());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Validate existing session on mount
  useEffect(() => {
    async function checkSession() {
      if (token) {
        try {
          const freshUser = await AuthService.getMe();
          setUser(freshUser);
        } catch {
          console.warn('Sessão expirada ou inválida. Redirecionando para login.');
          setUser(null);
          setToken(null);
          StorageService.clearSession();
        }
      }
    }
    checkSession();

    // Listen for 401 unauthorized from API client
    const unsubscribe = api.subscribeUnauthorized(() => {
      setUser(null);
      setToken(null);
      StorageService.clearSession();
    });

    return () => unsubscribe();
  }, [token]);

  const login = useCallback(async (creds: LoginCredentials) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const res = await AuthService.login(creds);
      setUser(res.user);
      setToken(res.token);
      return res;
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Falha ao autenticar.';
      setAuthError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (creds: RegisterCredentials) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const res = await AuthService.register(creds);
      setUser(res.user);
      setToken(res.token);
      return res;
    } catch (err: unknown) {
      const msg = (err as Error).message || 'Falha ao cadastrar.';
      setAuthError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    AuthService.logout();
    setUser(null);
    setToken(null);
  }, []);

  return {
    user,
    token,
    isAuthenticated: Boolean(token && user),
    isLoading,
    authError,
    setAuthError,
    login,
    register,
    logout,
  };
}
