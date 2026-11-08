import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './api';
import { DATA_CHANGED } from './realtime';

export function useApiData<T>(loader: () => Promise<T>, tables: string[] = ['*']) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const mounted = useRef(false);
  const requestId = useRef(0);
  const tablesRef = useRef(tables);
  tablesRef.current = tables;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async (silent = false) => {
    const currentRequest = ++requestId.current;
    if (!silent) { setLoading(true); setError(''); }
    try {
      const result = await loaderRef.current();
      if (mounted.current && currentRequest === requestId.current) { setData(result); setError(''); }
      return result;
    } catch (caught) {
      if (mounted.current && currentRequest === requestId.current) setError(errorMessage(caught));
      throw caught;
    } finally {
      if (mounted.current && currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void reload().catch(() => undefined);
    return () => { mounted.current = false; requestId.current += 1; };
  }, [reload]);

  useEffect(() => {
    let timer: number | undefined;
    let running = false;
    let queued = false;
    let active = true;
    const refresh = async () => {
      timer = undefined;
      if (!active || document.visibilityState === 'hidden') return;
      if (running) { queued = true; return; }
      running = true;
      try { await reload(true); } catch { /* Mantém os dados anteriores até a próxima tentativa. */ }
      finally {
        running = false;
        if (active && queued) { queued = false; schedule(); }
      }
    };
    const schedule = () => {
      if (timer === undefined) timer = window.setTimeout(() => void refresh(), 200);
    };
    const onChange = (event: Event) => {
      const changed = (event as CustomEvent<string[]>).detail;
      if (changed.includes('*') || tablesRef.current.includes('*') || changed.some(table => tablesRef.current.includes(table))) schedule();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') schedule(); };
    window.addEventListener(DATA_CHANGED, onChange);
    document.addEventListener('visibilitychange', onVisible);
    const fallback = window.setInterval(schedule, 15000);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearInterval(fallback);
      window.removeEventListener(DATA_CHANGED, onChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  return { data, setData, loading, error, reload };
}

export function usePagination<T>(items: T[], pageSize = 5) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pages);
  const visible = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  return { page: safePage, pages, visible, setPage };
}

export function digits(value: string) {
  return value.replace(/\D/g, '');
}

export function localDateInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function dateIsToday(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return false;
  const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return localDate === localDateInputValue();
}

export function includesText(values: Array<string | number | null | undefined>, search: string) {
  const normalizedSearch = search.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  if (!normalizedSearch) return true;
  return values.some((value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(normalizedSearch));
}
