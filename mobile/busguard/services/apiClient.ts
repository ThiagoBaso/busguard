import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const API_PORT = '8000';
const REQUEST_TIMEOUT_MS = 10000;
const API_BASE_URL = getApiBaseUrl();
const TOKEN_STORAGE_KEY = 'busguard.accessToken';

let accessToken: string | null = null;
const sessionExpiredListeners = new Set<() => void>();

export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`API error ${status}`);
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

async function setAccessToken(token: string | null) {
  accessToken = token;

  if (Platform.OS === 'web') {
    // Descarta tokens persistidos por versões anteriores. A sessão web fica só em memória.
    clearLegacyWebToken();
    return;
  }

  if (token) {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, token);
    return;
  }

  await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new ApiError(response.status);
  }

  const data = (await response.json()) as LoginResponse;
  await setAccessToken(data.access_token);

  try {
    return await getCurrentUser();
  } catch (error) {
    await setAccessToken(null);
    throw error;
  }
}

export async function restoreSession(): Promise<CurrentUser | null> {
  if (!accessToken) {
    accessToken = await getStoredAccessToken();
  }

  if (!accessToken) {
    return null;
  }

  try {
    return await getCurrentUser();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

export async function logout() {
  await setAccessToken(null);
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return apiFetch<CurrentUser>('/auth/me');
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const requestToken = accessToken;
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401 && requestToken && accessToken === requestToken) {
      await setAccessToken(null);
      sessionExpiredListeners.forEach((listener) => listener());
    }
    throw new ApiError(response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

async function fetchWithTimeout(url: string, options: RequestInit) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort);
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onAbort);
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
