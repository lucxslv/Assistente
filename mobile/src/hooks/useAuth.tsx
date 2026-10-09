import React, { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { session } from '@/src/lib/session';
import { authService } from '@/src/services/auth';
import { authStorage } from '@/src/services/authStorage';
import { deviceDiscoveryService } from '@/src/services/deviceDiscovery';
import { User } from '@/src/types/api';

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<void>;
  setPairedUser(user: User): void;
  signOut(): Promise<void>;
  refreshSession(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const initSession = async () => {
    const [savedUser, savedToken] = await Promise.all([
      session.getUser(),
      session.getToken(),
    ]);

    if (!savedUser) {
      setLoading(false);
      return;
    }

    setUser(savedUser);
    setToken(savedToken);

    try {
      const freshUser = await authService.me();
      setUser(freshUser);
      // Tenta descobrir o Desktop local silenciosamente na inicialização
      deviceDiscoveryService.autoDiscoverAndLink().catch(() => {});
    } catch (err: unknown) {
      // Se for estritamente erro 401 ou 403, a credencial foi revogada
      const isAuthError =
        (err && typeof err === 'object' && 'status' in err && (err.status === 401 || err.status === 403)) ||
        (err instanceof Error && /401|403|unauthorized/i.test(err.message));

      if (isAuthError) {
        await session.clear();
        await authStorage.clearPairedCredentials();
        setUser(null);
        setToken(null);
      } else {
        // Modo offline, timeout ou falha de rede temporária: PRESERVA os dados locais
        setUser(savedUser);
        setToken(savedToken);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initSession();
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      signIn: async (email: string, password: string) => {
        const u = await authService.login(email, password);
        const t = await session.getToken();
        setUser(u);
        setToken(t);
        // Tenta vincular o Desktop na LAN ou conta em background sem bloquear
        deviceDiscoveryService.autoDiscoverAndLink().catch(() => {});
      },
      signUp: async (name: string, email: string, password: string) => {
        const u = await authService.register(name, email, password);
        const t = await session.getToken();
        setUser(u);
        setToken(t);
        deviceDiscoveryService.autoDiscoverAndLink().catch(() => {});
      },
      setPairedUser: (paired: User) => {
        setUser(paired);
        session.getToken().then((t) => setToken(t));
      },
      signOut: async () => {
        await session.clear();
        await authStorage.clearPairedCredentials();
        setUser(null);
        setToken(null);
      },
      refreshSession: initSession,
    }),
    [user, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth requer AuthProvider');
  return value;
}
