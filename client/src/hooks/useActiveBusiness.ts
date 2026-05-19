import { useEffect } from 'react';
import { useBusinessStore } from '@stores/useBusinessStore';
import { useAuthStore } from '@stores/useAuthStore';

/**
 * Single source of truth for the active business across the app.
 * On first run, if no business is set in the store, we initialise to
 * the user's default_business from auth.
 */
export function useActiveBusiness(): { active: string | null; setActive: (k: string) => void } {
  const { active, setActive } = useBusinessStore();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!active && user?.default_business) {
      setActive(user.default_business);
    }
  }, [active, user?.default_business, setActive]);

  return { active, setActive };
}
