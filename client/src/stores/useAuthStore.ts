import { create } from 'zustand';
import { getUser, clearToken } from '@services/auth';
import type { AuthUser } from '@typedefs/common';

interface AuthState {
  user: AuthUser | null;
  /** True once hydrate() has run — prevents premature redirect to /login on page refresh */
  isHydrated: boolean;
  setUser: (u: AuthUser | null) => void;
  signOut: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isHydrated: false,
  setUser: (user) => set({ user }),
  signOut: () => {
    clearToken();
    set({ user: null, isHydrated: true });
    window.location.href = '/login';
  },
  hydrate: () => {
    const u = getUser();
    // Always mark hydrated — even when no user is found — so AppShell
    // knows the check has completed and can safely redirect to /login.
    set({ user: u ? (u as AuthUser) : null, isHydrated: true });
  },
}));
