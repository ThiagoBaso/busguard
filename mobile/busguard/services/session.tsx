import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  CurrentUser,
  login as requestLogin,
  logout as clearSession,
  onSessionExpired,
  restoreSession,
} from '@/services/apiClient';

type SessionStatus = 'checking' | 'signedOut' | 'signedIn' | 'unavailable';

type SessionContextValue = {
  status: SessionStatus;
  user: CurrentUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retry: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('checking');
  const [user, setUser] = useState<CurrentUser | null>(null);

  const retry = useCallback(async () => {
    setStatus('checking');
    try {
      const restoredUser = await restoreSession();
      setUser(restoredUser);
      setStatus(restoredUser ? 'signedIn' : 'signedOut');
    } catch {
      setUser(null);
      setStatus('unavailable');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onSessionExpired(() => {
      setUser(null);
      setStatus('signedOut');
    });
    void retry();
    return unsubscribe;
  }, [retry]);

  const login = useCallback(async (email: string, password: string) => {
    const currentUser = await requestLogin(email, password);
    setUser(currentUser);
    setStatus('signedIn');
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    setUser(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo(
    () => ({ status, user, login, logout, retry }),
    [status, user, login, logout, retry],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('SessionProvider ausente');
  }
  return context;
}
