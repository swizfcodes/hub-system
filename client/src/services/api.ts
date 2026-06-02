import axios, { AxiosError } from "axios";
import { getToken, clearToken } from "./auth";
import { useBusinessStore } from "@stores/useBusinessStore";

// Axios instance shared across the app — every service imports this.
export const api = axios.create({
  baseURL: "/api",
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // ── X-Business-Line ──
  // The backend's businessContext middleware reads this header first,
  // falling back to req.user.current_business. We send it on every request
  // so business-scoped queries always reflect the user's current selection
  // in the UI, not the value baked into the JWT at login.
  const active = useBusinessStore.getState().active;
  if (active) config.headers["X-Business-Line"] = active;

  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError<{ message?: string; errors?: unknown }>) => {
    if (err.response?.status === 401) {
      clearToken();
      if (window.location.pathname !== "/login")
        window.location.href = "/login";
    }
    return Promise.reject(err);
  },
);

// Convenience extractor — backend returns either { message } or { errors: [{ msg }] }.
export function errMsg(e: unknown, fallback = "Something went wrong"): string {
  const err = e as AxiosError<{
    message?: string;
    errors?: Array<{ msg: string }>;
  }>;
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.response?.data?.errors?.[0]?.msg)
    return err.response.data.errors[0].msg;
  if (err?.message) return err.message;
  return fallback;
}
