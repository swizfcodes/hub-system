import { Link, useLocation } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { useIsDesktop } from "@hooks/useMediaQuery";

/**
 * Floating "← App Menu" button (desktop only). Inspired by the demo's
 * #back-to-apps pattern, but elevated with our gold accent + cream pill.
 * On mobile, the App Menu lives in the bottom nav (no FAB needed).
 */
export function AppMenuFab() {
  const isDesktop = useIsDesktop();
  const { pathname } = useLocation();

  // Don't show on Hub home or login.
  if (!isDesktop) return null;
  if (pathname === "/" || pathname === "/hub" || pathname === "/login")
    return null;

  return (
    <Link
      to="/"
      className="hidden lg:inline-flex fixed bottom-8 left-1/2 -translate-x-1/2 z-40 items-center gap-2 px-5 py-3 rounded-full bg-orika-cream text-orika-black font-semibold text-xs uppercase tracking-widest shadow-lift hover:shadow-glow-md hover:-translate-y-0.5 transition-all group"
      aria-label="Return to App Menu"
    >
      <LayoutGrid className="w-4 h-4 text-orika-gold-dim group-hover:text-orika-gold transition-colors" />
      <span>App Menu</span>
    </Link>
  );
}
