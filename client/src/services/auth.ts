import axios from 'axios';

// Vite proxies this to your Node server (http://localhost:4000) during dev
const API_BASE = '/api';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    user_id: string;
    role_id: string;
    current_business: string;
    permitted_businesses: string[];
    default_business: string;
  };
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const { data } = await axios.post<AuthResponse>(`${API_BASE}/auth/login`, payload);
  return data;
}

export function storeToken(token: string): void {
  localStorage.setItem('orika_token', token);
}

export function getToken(): string | null {
  return localStorage.getItem('orika_token');
}

export function clearToken(): void {
  localStorage.removeItem('orika_token');
}

// ── Axios Interceptors ───────────────────────────────────────────

// 1. Auto-attach the Bearer token to every single request
axios.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 2. Globally handle 401 Unauthorized responses (e.g., expired token)
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearToken();
      // Force a hard redirect to the login page to clear state
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);