import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, type HealthResponse, type User } from '@/services/api';

interface BackendContextValue {
  online: boolean;
  health: HealthResponse | null;
  user: User | null;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const BackendContext = createContext<BackendContextValue | null>(null);

/** Polls the FastAPI backend; the app is fully functional offline (local-first). */
export function BackendProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [user, setUser] = useState<User | null>(null);

  const refreshUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      return;
    }
    try {
      setUser(await api.me());
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const h = await api.health();
        if (!cancelled) setHealth(h);
      } catch {
        if (!cancelled) setHealth(null);
      }
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (health) refreshUser();
  }, [health, refreshUser]);

  const logout = useCallback(() => {
    api.logout();
    setUser(null);
  }, []);

  return (
    <BackendContext.Provider value={{ online: !!health, health, user, refreshUser, logout }}>
      {children}
    </BackendContext.Provider>
  );
}

export function useBackend() {
  const ctx = useContext(BackendContext);
  if (!ctx) throw new Error('useBackend must be used inside <BackendProvider>');
  return ctx;
}
