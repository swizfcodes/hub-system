import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface BusinessState {
  active: string | null; // business_key
  setActive: (key: string) => void;
}

// The "active business" is the one the user is currently looking at.
// Persisted so refreshes don't drop the context.
export const useBusinessStore = create<BusinessState>()(
  persist(
    (set) => ({
      active: null,
      setActive: (key) => set({ active: key }),
    }),
    { name: 'orika_active_business' },
  ),
);
