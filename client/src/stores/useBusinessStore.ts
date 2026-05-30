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
      setActive: (key) => {
        set({ active: key });
        // Clear POS state when business changes — stale terminal/session IDs
        // from the previous business cause 404s in the new business context.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { usePOSStore } = require('./posStore') as typeof import('./posStore');
        const pos = usePOSStore.getState();
        pos.setTerminal(null);
        pos.setSession(null);
        pos.clearCart();
      },
    }),
    { name: 'orika_active_business' },
  ),
);
