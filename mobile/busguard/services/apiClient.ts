import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const API_PORT = '8000';
const REQUEST_TIMEOUT_MS = 10000;
const API_BASE_URL = getApiBaseUrl();
const TOKEN_STORAGE_KEY = 'busguard.accessToken';

let accessToken: string | null = null;
let sessionVersion = 0;
let storageQueue: Promise<void> = Promise.resolve();
const sessionExpiredListeners = new Set<() => void>();

export class SessionCancelledError extends Error {
  constructor() { super('Operação de sessão substituída.'); }
}

export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`API error ${status}`);
  }
}

export class ApiTransportError extends Error {
  constructor(public readonly kind: 'network' | 'timeout' | 'cancelled') {
    super(kind === 'timeout' ? 'Tempo limite da requisição excedido.'
      : kind === 'cancelled' ? 'Requisição cancelada.' : 'Falha de conexão com o serviço.');
    this.name = kind === 'network' ? 'ApiTransportError' : 'AbortError';
  }
}

export function onSessionExpired(listener: () => void) {
  sessionExpiredListeners.add(listener);
  return () => { sessionExpiredListeners.delete(listener); };
}

type LoginResponse = {
  access_token: string;
  token_type: string;
};

export type CurrentUser = {
  id: number;
  role: 'admin' | 'driver' | 'responsible' | 'supervisor';
};

function persistToken(token: string | null): Promise<void> {
  const write = storageQueue.catch(() => undefined).then(async () => {
    if (Platform.OS === 'web') { clearLegacyWebToken(); return; }
    if (token) await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
  });
  storageQueue = write;
  return write;
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  const version = ++sessionVersion;
  accessToken = null;
  try {
    const data = await fetchWithTimeout<LoginResponse>(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    }, async response => {
      if (version !== sessionVersion) throw new SessionCancelledError();
      if (!response.ok) throw new ApiError(response.status);
      return response.json() as Promise<LoginResponse>;
    });
    if (version !== sessionVersion) throw new SessionCancelledError();
    if (typeof data.access_token !== 'string' || !data.access_token.trim()) throw new Error('Resposta de autenticação inválida.');
    accessToken = data.access_token;
    await persistToken(data.access_token);
    if (version !== sessionVersion) throw new SessionCancelledError();
    const user = await getCurrentUser();
    if (version !== sessionVersion) throw new SessionCancelledError();
    return user;
  } catch (error) {
    if (version === sessionVersion) {
      accessToken = null;
      await persistToken(null);
    }
    throw error;
  }
}

export async function restoreSession(): Promise<CurrentUser | null> {
  const version = sessionVersion;
  if (!accessToken) {
    await storageQueue.catch(() => undefined);
    const stored = await getStoredAccessToken();
    if (version !== sessionVersion) throw new SessionCancelledError();
    accessToken = stored;
  }

  if (!accessToken) {
    return null;
  }

  try {
    const user = await getCurrentUser();
    if (version !== sessionVersion) throw new SessionCancelledError();
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export async function logout() {
  sessionVersion += 1;
  accessToken = null;
  await persistToken(null);
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const user = await apiFetch<CurrentUser>('/auth/me');
  if (!user || !Number.isInteger(user.id) || user.id <= 0 || !['admin', 'driver', 'responsible', 'supervisor'].includes(user.role)) {
    throw new Error('Perfil de sessão inválido.');
  }
  return user;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const requestToken = accessToken;
  const requestVersion = sessionVersion;
  return fetchWithTimeout<T>(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {}),
      ...options.headers,
    },
  }, async response => {
    if (!response.ok) {
      if (response.status === 401 && requestToken && accessToken === requestToken && sessionVersion === requestVersion) {
        sessionVersion += 1;
        accessToken = null;
        // Notifica antes de esperar o armazenamento: não expira um login posterior.
        sessionExpiredListeners.forEach((listener) => listener());
        void persistToken(null).catch(() => undefined);
      }
      throw new ApiError(response.status);
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  });
}

export function getApiErrorMessage(error: unknown, context = 'conectar ao serviço') {
  if (error instanceof ApiTransportError) {
    if (error.kind === 'timeout') return 'A solicitação excedeu o tempo limite. Tente novamente.';
    if (error.kind === 'cancelled') return 'Solicitação cancelada.';
    return `Não foi possível ${context}. Verifique sua conexão e tente novamente.`;
  }
  if (error instanceof ApiError) {
    if (error.status === 401) return 'E-mail ou senha inválidos, ou sua sessão terminou.';
    if (error.status === 403) return 'Sua conta não tem permissão para esta operação.';
    if (error.status === 422) return 'Confira os dados informados e tente novamente.';
    if (error.status === 429) return 'Muitas tentativas. Aguarde um pouco antes de tentar novamente.';
    if (error.status >= 500) return 'O serviço está indisponível no momento. Tente novamente em instantes.';
  }
  return `Não foi possível ${context}. Tente novamente.`;
}

async function fetchWithTimeout<T>(
  url: string,
  options: RequestInit,
  consumeResponse: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let abortError = new ApiTransportError('cancelled');
  let rejectAbort: () => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(abortError);
  });
  controller.signal.addEventListener('abort', rejectAbort);
  const abort = (kind: 'timeout' | 'cancelled') => {
    if (controller.signal.aborted) return;
    abortError = new ApiTransportError(kind);
    controller.abort();
  };
  const onAbort = () => abort('cancelled');
  options.signal?.addEventListener('abort', onAbort);
  if (options.signal?.aborted) onAbort();
  const timeout = setTimeout(() => abort('timeout'), REQUEST_TIMEOUT_MS);
  try {
    const request = (async () => {
      if (controller.signal.aborted) throw abortError;
      let response: Response;
      try {
        response = await fetch(url, { ...options, signal: controller.signal });
      } catch (error) {
        if (controller.signal.aborted) throw abortError;
        if (error instanceof TypeError) throw new ApiTransportError('network');
        throw error;
      }
      if (controller.signal.aborted) throw abortError;
      return consumeResponse(response);
    })();
    // Inclui o consumo do corpo no limite, mesmo em plataformas cujo json()
    // não rejeita automaticamente ao receber o cancelamento do fetch.
    return await Promise.race([request, aborted]);
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onAbort);
    controller.signal.removeEventListener('abort', rejectAbort);
  }
}

function getApiBaseUrl() {
  const configuredBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

  if (configuredBaseUrl) {
    return stripTrailingSlash(configuredBaseUrl);
  }

  if (Platform.OS === 'web') {
    return `http://localhost:${API_PORT}`;
  }

  const constants = Constants as typeof Constants & {
    expoGoConfig?: { debuggerHost?: string };
    manifest?: { debuggerHost?: string };
  };
  const expoHostUri =
    Constants.expoConfig?.hostUri ??
    constants.expoGoConfig?.debuggerHost ??
    constants.manifest?.debuggerHost;
  const expoHost = expoHostUri?.split(':')[0];

  if (expoHost) {
    return `http://${expoHost}:${API_PORT}`;
  }

  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${API_PORT}`;
  }

  return `http://localhost:${API_PORT}`;
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/$/, '');
}

async function getStoredAccessToken() {
  if (Platform.OS === 'web') {
    clearLegacyWebToken();
    return null;
  }

  return SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
}

function clearLegacyWebToken() {
  try {
    globalThis.localStorage?.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // O navegador pode bloquear o acesso ao armazenamento.
  }
}
