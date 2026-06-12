/**
 * PermissionGate — route-level guard rendered around the app <Outlet/>.
 *
 * Hiding a tile doesn't stop someone typing /payroll into the URL bar.
 * The backend still returns 403 on every API call, but the page itself
 * would render as a husk of failed queries. This gate matches the
 * current path to its module and shows a clean "no access" panel
 * instead. While permissions are loading it renders children untouched
 * (no flash of denial on refresh) — the API guards remain the real
 * enforcement at all times.
 */
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ShieldOff } from "lucide-react";
import { useVisibleModules } from "@hooks/useVisibleModules";
import { HUB_MODULES } from "@lib/constants/modules";

// Paths that are personal/utility surfaces, never permission-gated.
const OPEN_PREFIXES = ["/", "/workspace", "/help", "/profile", "/notifications"];

function moduleForPath(pathname: string) {
  if (OPEN_PREFIXES.includes(pathname)) return null;
  // Longest-prefix match so /sales-campaigns doesn't match /sales
  let best: (typeof HUB_MODULES)[number] | null = null;
  for (const m of HUB_MODULES) {
    if (
      pathname === m.route ||
      pathname.startsWith(m.route + "/") ||
      pathname.startsWith(m.route + "?")
    ) {
      if (!best || m.route.length > best.route.length) best = m;
    }
  }
  return best;
}

export function PermissionGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { canSeeModule, isLoading } = useVisibleModules();

  const module = moduleForPath(pathname);

  // No mapped module (login, invite, unknown) or still loading → pass through.
  if (!module || isLoading || canSeeModule(module)) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="max-w-sm w-full rounded-2xl border border-white/10 bg-brand-charcoal px-8 py-10 text-center space-y-4">
        <ShieldOff className="mx-auto h-10 w-10 text-brand-smoke" />
        <h1 className="text-lg font-semibold text-brand-cream">
          No access to {module.label}
        </h1>
        <p className="text-sm text-brand-smoke">
          Your role doesn't include the {module.label} module. If you need
          it, ask an administrator to update your role in Security → Roles.
        </p>
        <Link
          to="/"
          className="inline-block rounded-xl bg-brand-accent px-5 py-2.5 text-sm font-medium text-brand-black hover:opacity-90 transition-opacity"
        >
          Back to Hub
        </Link>
      </div>
    </div>
  );
}
