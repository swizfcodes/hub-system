import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Store } from "lucide-react";
import { useBusinessStore } from "@stores/useBusinessStore";

// The public storefront is the single-tenant Orika Living (diffusers)
// store. Its content lives in the `store` schema (store.settings singleton,
// store.signatures, scents) and is NOT business-scoped, so without a guard
// the jewelry business sees Orika's content. Gate every storefront settings
// page to the businesses that actually have a storefront. When a jewelry
// storefront ships, add its key here (and make the content business-scoped).
export const STOREFRONT_BUSINESSES = ["diffusers"];

export function StorefrontGuard({ children }: { children: ReactNode }) {
  const active = useBusinessStore((s) => s.active);

  // While the active business is still resolving (null), render nothing
  // rather than flashing Orika content under the wrong business.
  if (!active) return null;

  if (!STOREFRONT_BUSINESSES.includes(active)) {
    return (
      <div className="px-4 sm:px-8 py-16 max-w-2xl mx-auto text-center animate-app-in">
        <Store className="w-10 h-10 mx-auto text-brand-accent/60 mb-4" />
        <h1 className="font-display font-light text-2xl sm:text-3xl text-brand-cream mb-3">
          No storefront for this business <span className="italic text-brand-accent">yet</span>
        </h1>
        <p className="text-sm text-brand-cloud mb-6">
          The online storefront is enabled for one business only. Switch to
          that business to manage its homepage content, formats and scents.
          A storefront for this business is coming soon.
        </p>
        <Link
          to="/settings"
          className="inline-flex items-center gap-2 text-xs text-brand-accent hover:text-brand-cream transition-colors"
        >
          ← Back to Settings
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
