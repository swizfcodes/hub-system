import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBusinessStore } from "@stores/useBusinessStore";
import { useAuthStore } from "@stores/useAuthStore";
import { getBusiness } from "@services/settings/businesses";
import type { Business } from "@typedefs/settings";

// Safe defaults — used while the Business record is loading, or if a
// business hasn't been provisioned with explicit values yet. NGN + 7.5%
// VAT matches the backend's `getVatRate` fallback and the invoice_lines
// schema default (vat_rate NUMERIC(5,4) NOT NULL DEFAULT 0.075).
const DEFAULT_CURRENCY = "NGN";
const DEFAULT_VAT_RATE = 0.075;

export interface ActiveBusiness {
  active: string | null;
  setActive: (key: string) => void;
  business: Business | null;
  currency: string;
  vatRate: number;
  isLoading: boolean;
}

/**
 * Single source of truth for the active business across the app.
 *
 * On first run, if no business is set in the store, we initialise to the
 * user's default_business from auth. The Business record (currency, VAT,
 * branding, etc.) is fetched lazily via react-query and cached for 5 min,
 * so any sales/POS/invoicing screen that needs `currency` or `vatRate`
 * gets the per-business setting from /settings/businesses/:key without
 * extra plumbing.
 *
 * Backwards-compat: existing call sites that destructure only
 * `{ active, setActive }` continue to work — the extra fields are
 * additive.
 */
export function useActiveBusiness(): ActiveBusiness {
  const { active, setActive } = useBusinessStore();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!active && user?.default_business) {
      setActive(user.default_business);
    }
  }, [active, user?.default_business, setActive]);

  // Lazy-load the active business record so we know its currency + VAT
  // rate. Cached for 5 min — settings changes propagate on the next
  // fetch or via a manual `invalidateQueries(['business', key])`.
  const { data: business, isLoading } = useQuery({
    queryKey: ["business", active],
    queryFn: () => getBusiness(active!),
    enabled: !!active,
    staleTime: 5 * 60_000,
  });

  return {
    active,
    setActive,
    business: business ?? null,
    currency: business?.default_currency ?? DEFAULT_CURRENCY,
    vatRate: business?.vat_rate ?? DEFAULT_VAT_RATE,
    isLoading,
  };
}
