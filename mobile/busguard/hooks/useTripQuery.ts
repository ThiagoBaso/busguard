import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ApiError, ApiTransportError } from '@/services/apiClient';

export function describeTripError(error: unknown) {
  const status = error instanceof ApiError ? error.status : null;
  const kind = error instanceof ApiTransportError ? error.kind
    : status !== null && status >= 500 ? 'service' : status !== null ? 'http' : 'unknown';
  const message = status === 404 ? 'Nenhuma viagem em andamento está disponível para sua conta.'
    : status === 403 ? 'Sua conta não tem acesso a esta viagem.'
    : status === 401 ? 'Sua sessão terminou. Entre novamente.'
    : kind === 'service' ? 'O serviço está temporariamente indisponível. Tente novamente em instantes.'
    : kind === 'timeout' ? 'A consulta demorou mais que o esperado. Tente novamente.'
    : kind === 'network' ? 'Não foi possível estabelecer conexão com o serviço. Verifique sua conexão e tente novamente.'
    : 'Não foi possível atualizar os dados. Tente novamente.';
  return { status, kind, message };
}

export function useTripQuery<T>(loader: (signal?: AbortSignal) => Promise<T>, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorKind, setErrorKind] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const focused = useRef(false);
  const enabledRef = useRef(enabled);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const task = useRef<Promise<T | null> | null>(null);
  const dataRef = useRef<T | null>(null);
  enabledRef.current = enabled;

  const cancel = useCallback(() => {
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
    task.current = null;
    setRefreshing(false);
    setLoading(false);
  }, []);

  const refresh = useCallback((): Promise<T | null> => {
    if (!focused.current || (AppState.currentState !== null && AppState.currentState !== 'active')) return Promise.resolve(null);
    if (task.current) return task.current;
    const current = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setRefreshing(true);
    setLoading(dataRef.current === null);
    const pending = (async () => {
      try {
        const result = await loader(abort.signal);
        if (current !== generation.current || !focused.current) return null;
        dataRef.current = result;
        setData(result);
        setError(null);
        setErrorStatus(null);
        setErrorKind(null);
        setUpdatedAt(new Date());
        return result;
      } catch (caught) {
        if (abort.signal.aborted || current !== generation.current || !focused.current) return null;
        const { status, kind, message } = describeTripError(caught);
        if (status === 404 || status === 401 || status === 403) { dataRef.current = null; setData(null); }
        setErrorStatus(status);
        setErrorKind(kind);
        setError(message);
        return null;
      } finally {
        if (current === generation.current) {
          task.current = null;
          controller.current = null;
          setRefreshing(false);
          setLoading(false);
        }
      }
    })();
    task.current = pending;
    return pending;
  }, [loader]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    if (enabledRef.current) void refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && enabledRef.current) void refresh();
      else if (state !== 'active') cancel();
    });
    const timer = setInterval(() => {
      if (enabledRef.current) void refresh();
    }, 15000);
    return () => {
      focused.current = false;
      clearInterval(timer);
      subscription.remove();
      cancel();
    };
  }, [cancel, refresh]));

  useEffect(() => { if (!enabled) cancel(); }, [enabled, cancel]);
  return { data, loading, refreshing, error, errorStatus, errorKind, updatedAt, refresh, cancel };
}
