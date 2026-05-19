import { create } from 'zustand';
import { getUser, clearToken } from '@services/auth';
import type { AuthUser } from '@typedefs/common';

interface AuthState {
  user: AuthUser | null;
  setUser: (u: AuthUser | null) => void;
  signOut: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  signOut: () => {
    clearToken();
    set({ user: null });
    window.location.href = '/login';
  },
  hydrate: () => {
    const u = getUser();
    if (u) set({ user: u as AuthUser });
  },
}));
