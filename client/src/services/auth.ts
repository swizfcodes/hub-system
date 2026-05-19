import axios from 'axios';

const API_BASE = '/api';
const TOKEN_KEY = 'orika_token';
const USER_KEY  = 'orika_user';

export interface LoginPayload { email: string; password: string; }

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    user_id: string;
    role_id: string;
    current_business: string;
    permitted_businesses: string[];
    default_business: string;
    display_name?: string;
    email?: string;
  };
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const { data } = await axios.post<AuthResponse>(`${API_BASE}/auth/login`, payload);
  return data;
}

export function storeToken(token: string, remember = true): void {
  if (remember) localStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function storeUser(user: AuthResponse['user']): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser(): AuthResponse['user'] | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
