import axios from "axios";
import { api } from "./api";

const API_BASE = "/api";
const TOKEN_KEY = "orika_token";
const USER_KEY = "orika_user";

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    user_id: string;
    role_id: string;
    /** Role name returned by login (e.g. "owner", "manager", "sales"). */
    role?: string | null;
    current_business: string;
    permitted_businesses: string[];
    default_business: string;
    display_name?: string;
    avatar_url?: string;
    email?: string;
  };
}

/** Shape returned by GET /api/auth/me and PATCH /api/auth/me/profile. */
export interface MyProfile {
  user_id: string;
  email?: string;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  primary_phone?: string | null;
  employee_number?: string | null;
  job_title?: string | null;
  department?: string | null;
  role_name?: string | null;
  default_business?: string;
  permitted_businesses?: string[];
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const { data } = await axios.post<AuthResponse>(
    `${API_BASE}/auth/login`,
    payload,
  );
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

export function storeUser(user: AuthResponse["user"]): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser(): AuthResponse["user"] | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ── Self-service password reset (public endpoints) ──────────────────────────

export async function forgotPassword(
  email: string,
): Promise<{ message: string }> {
  const { data } = await axios.post<{ message: string }>(
    `${API_BASE}/auth/forgot-password`,
    { email },
  );
  return data;
}

export async function resetPassword(payload: {
  email: string;
  otp: string;
  newPassword: string;
}): Promise<{ message: string }> {
  const { data } = await axios.post<{ message: string }>(
    `${API_BASE}/auth/reset-password`,
    payload,
  );
  return data;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ message: string }> {
  const { data } = await axios.post<{ message: string }>(
    `${API_BASE}/auth/change-password`,
    { currentPassword, newPassword },
    { headers: { Authorization: `Bearer ${getToken()}` } },
  );
  return data;
}

export async function fetchMe(): Promise<MyProfile> {
  const { data } = await api.get<MyProfile>("/auth/me");
  return data;
}

/** Update the signed-in user's own display name. Returns the refreshed profile. */
export async function updateMyProfile(displayName: string): Promise<MyProfile> {
  const { data } = await api.patch<MyProfile>("/auth/me/profile", {
    display_name: displayName,
  });
  return data;
}
