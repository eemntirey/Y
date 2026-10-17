import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth, get, post } from './api';
import type { User } from './types';

interface SessionValue {
  user: User | null;
  ready: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (input: { username: string; email: string; password: string; displayName?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: User) => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!auth.token) {
      setUser(null);
      setReady(true);
      return;
    }
    try {
      const data = await get<{ user: User }>('/auth/me');
      setUser(data.user);
    } catch {
      auth.set(null);
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    auth.onUnauthorised(() => setUser(null));
  }, [refresh]);

  const login = useCallback(async (identifier: string, password: string) => {
    const data = await post<{ user: User; token: string; refresh: string }>('/auth/login', {
      identifier,
      password,
    });
    auth.set(data);
    setUser(data.user);
  }, []);

  const register = useCallback(
    async (input: { username: string; email: string; password: string; displayName?: string }) => {
      const data = await post<{ user: User; token: string; refresh: string }>('/auth/register', input);
      auth.set(data);
      setUser(data.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    const refreshToken = auth.refresh;
    try {
      if (refreshToken) await post('/auth/logout', { refresh: refreshToken });
    } catch {
      /* la session locale est de toute façon supprimée */
    }
    auth.set(null);
    setUser(null);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ user, ready, login, register, logout, refresh, setUser }),
    [user, ready, login, register, logout, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession doit être utilisé dans SessionProvider');
  return ctx;
}
