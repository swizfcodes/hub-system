import { useBranding } from "@/providers/ThemeProvider";
import { useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  X,
} from "lucide-react";
import { useUiStore } from "@stores/useUiStore";
import { useIsDesktop } from "@hooks/useMediaQuery";
import { HUB_MODULES, type AppModule } from "@lib/constants/modules";
import { useVisibleModules } from "@hooks/useVisibleModules";
import { useNavPriority } from "@hooks/useNavPriority";
import { BusinessSwitcher } from "./BusinessSwitcher";
import { AccountMenu } from "./AccountMenu";
import { cn } from "@lib/cn";

const NAV_GROUPS: { label: string; modules: string[] }[] = [
  { label: "Run", modules: ["dashboard", "crm", "sales", "pos"] },
  {
    label: "Operate",
    modules: [
      "logistics",
      "stock",
      "purchasing",
      "catalogue",
      "retail-partners",
    ],
  },
  {
    label: "Finance",
    modules: ["invoicing", "accounting", "tax", "expenses", "reports"],
  },
  {
    label: "People",
    modules: ["staff", "payroll", "contacts", "messaging", "loyalty"],
  },
  {
    label: "Grow",
    modules: [
      "campaigns",
      "sales-campaigns",
      "social",
      "calendar",
      "tasks",
      "workspace",
    ],
  },
  { label: "System", modules: ["settings", "security", "documents", "help"] },
];

export function Sidebar() {
  const { platform } = useBranding();
  // Wordmark: last word gets the accent (e.g. "Orika <Hub>").
  const nameWords = (platform.product_name || "Hub").split(" ");
  const nameTail = nameWords.length > 1 ? nameWords.pop() : "";
  const nameHead = nameWords.join(" ");
  const monogram = (platform.product_name || "H").charAt(0).toUpperCase();

  const {
    sidebarCollapsed,
    toggleSidebar,
    mobileSidebarOpen,
    setMobileSidebarOpen,
  } = useUiStore();
  const isDesktop = useIsDesktop();
  const location = useLocation();
  // user + signOut are handled by AccountMenu now

  const isOnSettings = location.pathname.startsWith("/settings");
  // Permission-driven navigation: only modules the user's role can view.
  const { visibleKeys } = useVisibleModules();
  // The user's resolved top-10 (pins → role default → global default).
  // The sidebar mirrors the app grid so the two never disagree.
  const { topModules } = useNavPriority();
  const topKeySet = new Set(topModules.map((m) => m.key));
  const [moreOpen, setMoreOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sidebar_more_open") === "1";
    } catch {
      return false;
    }
  });
  function toggleMore() {
    setMoreOpen((o) => {
      try {
        localStorage.setItem("sidebar_more_open", o ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !o;
    });
  }
  const collapsed = isDesktop ? sidebarCollapsed : false;

  // Auto-expand More when the current route lives inside it, so the
  // active item is never invisible.
  const activeInMore = HUB_MODULES.some(
    (m) =>
      !topKeySet.has(m.key) &&
      visibleKeys.has(m.key) &&
      (m.key === "settings"
        ? isOnSettings
        : location.pathname.startsWith(m.route)),
  );
  const moreExpanded = moreOpen || activeInMore;

  // Mobile = drawer; desktop = always-visible rail.
  const visible = isDesktop ? true : mobileSidebarOpen;

  return (
    <>
      {/* Mobile backdrop */}
      {!isDesktop && mobileSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-brand-black/70 backdrop-blur-sm animate-fade-in"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 bottom-0 z-50 flex flex-col bg-brand-black border-r border-brand-graphite transition-all duration-300",
          collapsed ? "w-[72px]" : "w-[260px]",
          !isDesktop && (visible ? "translate-x-0" : "-translate-x-full"),
        )}
        aria-label="Primary navigation"
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-brand-graphite/70 shrink-0">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-full border border-brand-accent/40 flex items-center justify-center group-hover:shadow-glow-sm transition-shadow shrink-0">
              <span className="font-display text-brand-accent text-lg leading-none">
                {monogram}
              </span>
            </div>
            {!collapsed && (
              <div className="flex flex-col leading-tight">
                <span className="font-display text-brand-cream text-lg tracking-wide">
                  {nameHead}
                  {nameTail && (
                    <>
                      {" "}
                      <span className="text-brand-accent">{nameTail}</span>
                    </>
                  )}
                </span>
                {platform.tagline && (
                  <span className="text-[0.55rem] tracking-[0.18em] uppercase text-brand-smoke truncate max-w-[150px]">
                    {platform.tagline}
                  </span>
                )}
              </div>
            )}
          </Link>
          {!isDesktop && (
            <button
              onClick={() => setMobileSidebarOpen(false)}
              className="p-2 text-brand-smoke hover:text-brand-cream"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Business switcher */}
        {!collapsed && (
          <div className="px-4 pt-4 pb-2">
            <div className="text-[0.55rem] tracking-[0.18em] uppercase text-brand-smoke mb-2 ml-1">
              Business Line
            </div>
            <BusinessSwitcher variant="sidebar" />
          </div>
        )}

        {/* Nav — Priority (resolved top-10) + collapsible More */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {(() => {
            const renderItem = (m: AppModule) => {
              const Icon = m.icon;
              const matches =
                m.key === "settings"
                  ? isOnSettings
                  : location.pathname.startsWith(m.route);
              return (
                <NavLink
                  key={m.key}
                  to={m.route}
                  onClick={() => !isDesktop && setMobileSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 mx-1 rounded-lg text-sm font-medium transition-all group relative",
                    matches
                      ? "bg-brand-charcoal text-brand-accent border-l-2 border-brand-accent pl-[10px]"
                      : "text-brand-cloud hover:text-brand-cream hover:bg-brand-charcoal/60",
                    collapsed && "justify-center px-0 mx-0",
                  )}
                  title={collapsed ? m.label : undefined}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  {!collapsed && <span className="truncate">{m.label}</span>}
                </NavLink>
              );
            };

            const moreGroups = NAV_GROUPS.map((g) => ({
              label: g.label,
              items: g.modules
                .filter((k) => visibleKeys.has(k) && !topKeySet.has(k))
                .map((k) => HUB_MODULES.find((m) => m.key === k))
                .filter((m): m is NonNullable<typeof m> => !!m),
            })).filter((g) => g.items.length > 0);

            return (
              <>
                {/* Priority — mirrors the Hub grid's top 10 */}
                <div className="mb-3">
                  {!collapsed && (
                    <div className="px-3 py-2 text-[0.55rem] tracking-[0.18em] uppercase text-brand-smoke font-bold">
                      Priority
                    </div>
                  )}
                  {topModules.map(renderItem)}
                </div>

                {/* More — everything else, grouped, collapsed by default */}
                {moreGroups.length > 0 && (
                  <>
                    <button
                      onClick={toggleMore}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 mx-1 rounded-lg text-sm font-medium w-[calc(100%-8px)] transition-all",
                        "text-brand-smoke hover:text-brand-cream hover:bg-brand-charcoal/60",
                        collapsed && "justify-center px-0 mx-0 w-full",
                      )}
                      title={collapsed ? "More" : undefined}
                      aria-expanded={moreExpanded}
                    >
                      {moreExpanded ? (
                        <ChevronUp className="w-[18px] h-[18px] shrink-0" />
                      ) : (
                        <ChevronDown className="w-[18px] h-[18px] shrink-0" />
                      )}
                      {!collapsed && (
                        <span className="truncate">
                          More
                          <span className="ml-1.5 text-[0.6rem] text-brand-smoke/70">
                            {moreGroups.reduce(
                              (n, g) => n + g.items.length,
                              0,
                            )}
                          </span>
                        </span>
                      )}
                    </button>
                    {moreExpanded &&
                      moreGroups.map((g) => (
                        <div key={g.label} className="mb-3">
                          {!collapsed && (
                            <div className="px-3 py-2 text-[0.55rem] tracking-[0.18em] uppercase text-brand-smoke font-bold">
                              {g.label}
                            </div>
                          )}
                          {g.items.map(renderItem)}
                        </div>
                      ))}
                  </>
                )}
              </>
            );
          })()}
        </nav>

        {/* Footer — Account menu */}
        <div className="px-3 py-3 border-t border-brand-graphite/70 shrink-0">
          <AccountMenu collapsed={collapsed} />
        </div>

        {/* Collapse handle (desktop only) */}
        {isDesktop && (
          <button
            onClick={toggleSidebar}
            className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-brand-graphite border border-brand-graphite text-brand-accent flex items-center justify-center hover:bg-brand-charcoal transition-colors shadow-card"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="w-3 h-3" />
            ) : (
              <ChevronLeft className="w-3 h-3" />
            )}
          </button>
        )}
      </aside>
    </>
  );
}
