import { NavLink, useLocation } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { HUB_MODULES, SETTINGS_SUBMODULES } from "@lib/constants/modules";
import { useVisibleModules } from "@hooks/useVisibleModules";
import { useNavPriority } from "@hooks/useNavPriority";
import { useUnreadTotal } from "@hooks/useUnreadTotal";
import {
  unreadTone,
  formatUnread,
  UNREAD_TONE_CLASS,
} from "@lib/constants/unread";
import { cn } from "@lib/cn";

/**
 * Mobile bottom navigation. The icons shown are CALCULATED PER PAGE
 * (Tom's spec): the route declares which modules matter most for the
 * current context, and the bottom nav renders them. We fall back to a
 * sensible default if a page doesn't declare its own set.
 *
 * Rules:
 *  - On /settings/* we show the 4 most-used settings sub-modules + a back-to-Hub icon
 *  - On the Hub home we hide the bottom nav (the page IS the launcher)
 *  - Everywhere else we show: Dashboard, CRM, Sales, Stock, App Menu
 */

interface BottomItem {
  key: string;
  label: string;
  route: string;
  icon: React.ComponentType<{ className?: string }>;
}

function bottomItemsForRoute(
  pathname: string,
  visibleKeys: Set<string>,
  topKeys: string[],
): BottomItem[] | null {
  if (pathname === "/" || pathname === "/hub") return null;

  if (pathname.startsWith("/settings")) {
    const picks = [
      "business-setup",
      "bank-accounts",
      "custom-fields",
      "tax-rates",
    ];
    const items: BottomItem[] = picks
      .map((k) => SETTINGS_SUBMODULES.find((m) => m.key === k))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => ({
        key: m.key,
        label: m.label.split(" ")[0],
        route: m.route,
        icon: m.icon,
      }));
    items.push({ key: "apps", label: "Apps", route: "/", icon: LayoutGrid });
    return items;
  }

  // On Contacts module: show shortcuts to the most-used sibling modules
  if (pathname.startsWith("/contacts")) {
    const picks = ["contacts", "crm", "messaging", "tasks"];
    const items: BottomItem[] = picks
      .filter((k) => visibleKeys.has(k))
    .map((k) => HUB_MODULES.find((m) => m.key === k))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => ({
        key: m.key,
        label: m.label.split(" ")[0],
        route: m.route,
        icon: m.icon,
      }));
    items.push({ key: "apps", label: "Apps", route: "/", icon: LayoutGrid });
    return items;
  }

  // On Procurement / Catalogue: surface the procure-to-pay siblings
  if (
    pathname.startsWith("/procurement") ||
    pathname.startsWith("/catalogue")
  ) {
    const picks = ["catalogue", "purchasing", "stock", "contacts"];
    const items: BottomItem[] = picks
      .filter((k) => visibleKeys.has(k))
    .map((k) => HUB_MODULES.find((m) => m.key === k))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => ({
        key: m.key,
        label: m.label.split(" ")[0],
        route: m.route,
        icon: m.icon,
      }));
    items.push({ key: "apps", label: "Apps", route: "/", icon: LayoutGrid });
    return items;
  }

  // On CRM: surface sales-adjacent quick jumps + calendar
  if (pathname.startsWith("/crm")) {
    const picks = ["crm", "contacts", "calendar", "sales"];
    const items: BottomItem[] = picks
      .filter((k) => visibleKeys.has(k))
    .map((k) => HUB_MODULES.find((m) => m.key === k))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => ({
        key: m.key,
        label: m.label.split(" ")[0],
        route: m.route,
        icon: m.icon,
      }));
    items.push({ key: "apps", label: "Apps", route: "/", icon: LayoutGrid });
    return items;
  }

  // Default mobile bottom nav — the user's resolved nav priority
  // (useNavPriority ladder), so it personalises per role/user.
  const picks = topKeys.length
    ? topKeys.slice(0, 4)
    : ["dashboard", "crm", "sales", "stock"];
  const items: BottomItem[] = picks
    .filter((k) => visibleKeys.has(k))
    .map((k) => HUB_MODULES.find((m) => m.key === k))
    .filter((m): m is NonNullable<typeof m> => !!m)
    .map((m) => ({
      key: m.key,
      label: m.label.split(" ")[0],
      route: m.route,
      icon: m.icon,
    }));
  items.push({ key: "apps", label: "Apps", route: "/", icon: LayoutGrid });
  return items;
}

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const { visibleKeys } = useVisibleModules();
  const { topModules } = useNavPriority();
  const unreadTotal = useUnreadTotal();
  const tone = unreadTone(unreadTotal);
  const items = bottomItemsForRoute(
    pathname,
    visibleKeys,
    topModules.map((m) => m.key),
  );

  if (!items) return null;

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-brand-charcoal/95 backdrop-blur-md border-t border-brand-graphite pb-safe"
      aria-label="Bottom navigation"
    >
      <div className="grid grid-cols-5">
        {items.map((it) => {
          const Icon = it.icon;
          const active =
            it.route === "/" ? pathname === "/" : pathname.startsWith(it.route);
          return (
            <NavLink
              key={it.key}
              to={it.route}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 transition-colors",
                active
                  ? "text-brand-accent"
                  : "text-brand-smoke hover:text-brand-cream",
              )}
            >
              <span className="relative">
                <Icon className="w-5 h-5" />
                {it.key === "messaging" && tone && (
                  <span
                    className={cn(
                      "absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none",
                      UNREAD_TONE_CLASS[tone],
                    )}
                  >
                    {formatUnread(unreadTotal)}
                  </span>
                )}
              </span>
              <span className="text-[0.6rem] font-semibold tracking-wide uppercase">
                {it.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
