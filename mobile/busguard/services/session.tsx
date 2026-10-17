import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  CurrentUser,
  login as requestLogin,
  logout as clearSession,
  onSessionExpired,
  restoreSession,
  SessionCancelledError,
  getApiErrorMessage,
} from '@/services/apiClient';

type SessionStatus = 'checking' | 'signedOut' | 'signedIn' | 'unavailable';

type SessionContextValue = {
  status: SessionStatus;
  user: CurrentUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  retry: () => Promise<void>;
  errorMessage: string | null;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('checking');
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const generation = useRef(0);
  const logoutPending = useRef(false);

  const retry = useCallback(async () => {
    const current = ++generation.current;
    setStatus('checking');
    setErrorMessage(null);
    try {
      const restoredUser = logoutPending.current ? (await clearSession(), null) : await restoreSession();
      if (current !== generation.current) return;
      logoutPending.current = false;
      setUser(restoredUser);
      setStatus(restoredUser ? 'signedIn' : 'signedOut');
    } catch (caught) {
      if (current !== generation.current || caught instanceof SessionCancelledError) return;
      setErrorMessage(getApiErrorMessage(caught, 'verificar sua sessão'));
      setUser(null);
      setStatus('unavailable');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onSessionExpired(() => {
      generation.current += 1;
      setUser(null);
      setStatus('signedOut');
    });
    void retry();
    return () => { generation.current += 1; unsubscribe(); };
  }, [retry]);

  const login = useCallback(async (email: string, password: string) => {
    const current = ++generation.current;
    setErrorMessage(null);
    const currentUser = await requestLogin(email, password);
    if (current !== generation.current) return;
    logoutPending.current = false;
    setUser(currentUser);
    setStatus('signedIn');
  }, []);

  const logout = useCallback(async () => {
    const current = ++generation.current;
    logoutPending.current = true;
    setUser(null);
    setStatus('checking');
    setErrorMessage(null);
    try {
      await clearSession();
      if (current !== generation.current) return;
      logoutPending.current = false;
      setStatus('signedOut');
    } catch (caught) {
      if (current === generation.current) {
        setErrorMessage(getApiErrorMessage(caught, 'encerrar sua sessão'));
        setStatus('unavailable');
      }
      throw caught;
    }
  }, []);

  const value = useMemo(
    () => ({ status, user, login, logout, retry, errorMessage }),
    [status, user, login, logout, retry, errorMessage],
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
