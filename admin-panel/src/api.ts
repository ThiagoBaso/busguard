import type { CurrentUser } from './types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');
const TOKEN_KEY = 'busguard.admin.accessToken';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function getToken() {
  return window.sessionStorage.getItem(TOKEN_KEY);
}

function clearToken() {
  window.sessionStorage.removeItem(TOKEN_KEY);
}

async function parseError(response: Response): Promise<never> {
  const body = await response.json().catch(() => null) as { detail?: string } | null;
  if (response.status === 401) {
    clearToken();
    window.dispatchEvent(new Event('busguard:unauthorized'));
  }
  throw new ApiError(response.status, body?.detail || `Falha na API (${response.status}).`);
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error('Não foi possível conectar à API. Confira o serviço e o endereço configurado.');
  }

  if (!response.ok) return parseError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// Fetch permite enviar o Bearer no cabeçalho, sem expor o token na URL.
export async function openChanges(signal: AbortSignal): Promise<Response> {
  const token = getToken();
  const response = await fetch(`${API_BASE_URL}/admin/changes`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}, signal,
  });
  if (!response.ok) return parseError(response);
  return response;
}

export async function signIn(identifier: string, password: string): Promise<CurrentUser> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: identifier.trim(), password }),
    });
  } catch {
    throw new Error('Não foi possível conectar à API. Confira se o serviço está ativo.');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new ApiError(response.status, body?.detail || 'Não foi possível entrar.');
  }

  const token = (await response.json() as { access_token?: string }).access_token;
  if (!token) throw new Error('A API não retornou um token de acesso válido.');
  window.sessionStorage.setItem(TOKEN_KEY, token);
  try {
    const current = await apiFetch<CurrentUser>('/auth/me');
    if (current.role !== 'admin') throw new ApiError(403, 'Esta conta não tem acesso administrativo.');
    return current;
  } catch (error) {
    clearToken();
    throw error;
  }
}

export async function restoreSession(): Promise<CurrentUser | null> {
  if (!getToken()) return null;
  try {
    const current = await apiFetch<CurrentUser>('/auth/me');
    return current.role === 'admin' ? current : null;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
    throw error;
  }
}

export function signOut() {
  clearToken();
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Sua sessão terminou. Entre novamente.';
    if (error.status === 403) return 'Sua conta não tem permissão para esta operação.';
    if (error.status === 404) return 'O registro solicitado não foi encontrado.';
    if (error.status === 409) return 'Há dados duplicados ou este registro está em uso.';
    if (error.status === 422) return 'Confira os campos e formatos informados.';
    if (error.status >= 500) return 'O serviço está indisponível. Tente novamente em instantes.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
}
