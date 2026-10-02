import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const API_PORT = '8000';
const API_BASE_URL = getApiBaseUrl();
const TOKEN_STORAGE_KEY = 'busguard.accessToken';

let accessToken: string | null = null;

type LoginResponse = {
  access_token: string;
  token_type: string;
};

export type CurrentUser = {
  id: number;
  role: 'admin' | 'driver' | 'responsible' | 'supervisor';
};

export function getAccessToken() {
  return accessToken;
}

export async function setAccessToken(token: string | null) {
  accessToken = token;

  if (Platform.OS === 'web') {
    if (typeof globalThis.localStorage === 'undefined') {
      return;
    }

    if (token) {
      globalThis.localStorage.setItem(TOKEN_STORAGE_KEY, token);
      return;
    }

    globalThis.localStorage.removeItem(TOKEN_STORAGE_KEY);
    return;
  }

  if (token) {
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, token);
    return;
  }

  await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
}

export async function login(email: string, password: string): Promise<CurrentUser> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error('Login invalido');
  }

  const data = (await response.json()) as LoginResponse;
  await setAccessToken(data.access_token);

  return getCurrentUser();
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
  } catch {
    await setAccessToken(null);
    return null;
  }
}

export async function logout() {
  await setAccessToken(null);
}

export async function getCurrentUser(): Promise<CurrentUser> {
  return apiFetch<CurrentUser>('/auth/me');
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }

  return response.json() as Promise<T>;
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
    if (typeof globalThis.localStorage === 'undefined') {
      return null;
    }

    return globalThis.localStorage.getItem(TOKEN_STORAGE_KEY);
  }

  return SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
}
