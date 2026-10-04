import React, { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';
import { session } from '@/src/lib/session';
import { authService } from '@/src/services/auth';
import { User } from '@/src/types/api';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<void>;
  continueAsGuest(): void;
  signOut(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const saved = await session.getUser();
      if (!saved) {
        setLoading(false);
        return;
      }
      try {
        setUser(await authService.me());
      } catch {
        await session.clear();
      }
      setLoading(false);
    })();
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      signIn: async (email: string, password: string) =>
        setUser(await authService.login(email, password)),
      signUp: async (name: string, email: string, password: string) =>
        setUser(await authService.register(name, email, password)),
      continueAsGuest: () => {
        setUser({
          id: 'guest-lucas',
          name: 'Lucas',
          email: 'lucas@charlie.local',
        });
      },
      signOut: async () => {
        await session.clear();
        setUser(null);
      },
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth requer AuthProvider');
  return value;
}
