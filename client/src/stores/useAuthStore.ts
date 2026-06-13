import { create } from "zustand";
import { getUser, getToken, storeUser, clearToken, fetchMe } from "@services/auth";
import type { AuthUser } from "@typedefs/common";

interface AuthState {
  user: AuthUser | null;
  /** True once hydrate() has run — prevents premature redirect to /login on page refresh */
  isHydrated: boolean;
  setUser: (u: AuthUser | null) => void;
  signOut: () => void;
  hydrate: () => void;
  /**
   * Refresh name/avatar/role from /auth/me and merge into the cached user.
   * The login response is only a snapshot — this keeps the sidebar and
   * greeting in sync with the DB even when the cached copy is stale
   * (e.g. after a deploy that fixed what login returns).
   */
  refreshFromServer: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isHydrated: false,
  setUser: (user) => set({ user }),
  signOut: () => {
    clearToken();
    set({ user: null, isHydrated: true });
    window.location.href = "/login";
  },
  hydrate: () => {
    const u = getUser();
    // Always mark hydrated — even when no user is found — so AppShell
    // knows the check has completed and can safely redirect to /login.
    set({ user: u ? (u as AuthUser) : null, isHydrated: true });
  },
  refreshFromServer: async () => {
    if (!getToken() || !get().user) return;
    try {
      const me = await fetchMe();
      const current = get().user;
      if (!current) return;
      const merged: AuthUser = {
        ...current,
        display_name: me.display_name ?? current.display_name,
        avatar_url: me.avatar_url ?? current.avatar_url,
        email: me.email ?? current.email,
        role_name: me.role_name ?? current.role_name,
      };
      storeUser(merged);
      set({ user: merged });
    } catch {
      // Offline / transient error — keep the cached user as-is.
    }
  },
}));
