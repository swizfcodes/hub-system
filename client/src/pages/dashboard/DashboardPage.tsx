/**
 * DashboardPage — the first app in the Command Centre.
 * Three tabs: Dashboard (KPIs) | Workspace (tasks+calendar) | Notifications
 *
 * Route: /dashboard
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Calendar,
  Bell,
  RefreshCw,
  Settings2,
  Menu,
} from "lucide-react";
import {
  AlertsStrip,
  NotificationsPanel,
} from "@components/dashboard/AlertsAndNotifications";
import {
  SalesSection,
  FinanceSection,
  CustomersSection,
  StockSection,
  LogisticsSection,
} from "@components/dashboard/DashboardSections";
import WorkspacePage from "@pages/workspace/WorkspacePage";
import {
  TodayHeroCard,
  QuickActions,
  MyRecentSales,
} from "@components/dashboard/RoleDashboards";
import {
  getSalesData,
  getFinanceData,
  getStockData,
  getCustomerData,
  getLogisticsData,
  getYesterdaySummary,
  getUnreadCount,
} from "@services/dashboard";
import {
  DASHBOARD_SECTIONS,
  PERIOD_OPTIONS,
  getPeriodParams,
  type SectionKey,
} from "@lib/constants/dashboardConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { useAuthStore } from "@stores/useAuthStore";
import { usePermissions } from "@hooks/usePermissions";
import { useDashboardPersona } from "@hooks/useDashboardPersona";
import { useUiStore } from "@stores/useUiStore";
import { useIsDesktop } from "@hooks/useMediaQuery";
import { CommandPalette } from "@components/search/CommandPalette";
import { fmtMoney, fmtDate } from "@lib/format";
import { cn } from "@lib/cn";
import type { AlertItem } from "@typedefs/dashboard";

type Tab = "dashboard" | "workspace" | "notifications";

export default function DashboardPage() {
  const qc = useQueryClient();
  // `active` is the single source of truth for which business the dashboard
  // shows — it drives the X-Business-Line header on every API call. The old
  // separate "brand" toggle never reached the API and has been removed; the
  // business switcher in the shell is the one control for this concept.
  const { currency, active } = useActiveBusiness();
  const { setMobileSidebarOpen } = useUiStore();
  const isDesktop = useIsDesktop();
  const [searchOpen, setSearchOpen] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  // Dashboard controls
  const [period, setPeriod] = useState("this_month");
  const [manualHidden, setManualHidden] = useState<SectionKey[]>(() => {
    // Store only sections the user has explicitly *hidden*, not all visible ones.
    // This way newly-permitted sections appear by default without localStorage bloat.
    try {
      const saved = localStorage.getItem("dashboard_sections_hidden");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showSectionPicker, setShowSectionPicker] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const params = getPeriodParams(period);

  // ── Permissions — resolved before queries so enabled flags are correct ──────
  const { hasPermission, hasAnyPermission, isLoading: permsLoading } = usePermissions();

  // ── Persona — which layout this user gets, derived from permissions ─────────
  // (see useDashboardPersona for the ladder; new roles fit automatically)
  const { persona } = useDashboardPersona();
  const isOwnerView = persona === "owner";
  const isManagerView = persona === "manager";
  const isCashierView = persona === "cashier";

  const canSeeSales     = hasAnyPermission([{ module: "sales", action: "view" }, { module: "pos", action: "view" }, { module: "invoicing", action: "view" }]);
  const canSeeFinance   = hasAnyPermission([{ module: "accounting", action: "view" }, { module: "invoicing", action: "view" }, { module: "expenses", action: "view" }]);
  const canSeeStock     = hasAnyPermission([{ module: "stock", action: "view" }, { module: "catalogue", action: "view" }, { module: "purchasing", action: "view" }]);
  const canSeeCustomers = hasAnyPermission([{ module: "crm", action: "view" }, { module: "contacts", action: "view" }]);
  const canSeeLogistics = hasPermission("logistics", "view");
  const canSeeRetail    = hasPermission("retail-partners", "view");

  // All data queries — each fires only when permissions have loaded and the
  // user actually has access to that module. This prevents wasted 403 requests.
  //
  // Query keys are structured arrays starting with "dash" so that
  // `invalidateQueries({ queryKey: ["dash"] })` matches them all (the old
  // string-prefix keys like "dash-sales" were never matched by refresh).
  // `active` (business) is included so switching business refetches.
  //
  // The cashier layout doesn't render KPI sections, so section queries are
  // skipped entirely for that persona.
  const sectionsEnabled = !permsLoading && !isCashierView;
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ["dash", "sales", active, period],
    queryFn: () => getSalesData(params),
    refetchInterval: 5 * 60_000,
    enabled: sectionsEnabled && canSeeSales,
  });
  const { data: financeData, isLoading: financeLoading } = useQuery({
    queryKey: ["dash", "finance", active, period],
    queryFn: () => getFinanceData(params),
    refetchInterval: 5 * 60_000,
    enabled: sectionsEnabled && canSeeFinance,
  });
  const { data: stockData, isLoading: stockLoading } = useQuery({
    queryKey: ["dash", "stock", active],
    queryFn: () => getStockData(),
    refetchInterval: 5 * 60_000,
    enabled: sectionsEnabled && canSeeStock,
  });
  const { data: customerData, isLoading: customerLoading } = useQuery({
    queryKey: ["dash", "customers", active, period],
    queryFn: () => getCustomerData(params),
    refetchInterval: 5 * 60_000,
    enabled: sectionsEnabled && canSeeCustomers,
  });
  const { data: logisticsData, isLoading: logisticsLoading } = useQuery({
    queryKey: ["dash", "logistics", active, period],
    queryFn: () => getLogisticsData(params),
    refetchInterval: 5 * 60_000,
    enabled: sectionsEnabled && canSeeLogistics,
  });
  const { data: yesterday } = useQuery({
    queryKey: ["dash", "yesterday", active],
    queryFn: () => getYesterdaySummary(),
    staleTime: 30 * 60_000,
    enabled: !permsLoading && canSeeSales && isOwnerView,
  });
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["unread-count"],
    queryFn: getUnreadCount,
    refetchInterval: 60_000,
  });

  // ── Section visibility ──────────────────────────────────────────────────────
  // Map the pre-computed permission booleans onto section keys so the section
  // picker and render logic stay in sync with the query enabled flags above.
  const permittedSections = DASHBOARD_SECTIONS.filter((s) => {
    if (s.key === "sales")     return canSeeSales;
    if (s.key === "finance")   return canSeeFinance;
    if (s.key === "customers") return canSeeCustomers;
    if (s.key === "stock")     return canSeeStock;
    if (s.key === "logistics") return canSeeLogistics;
    if (s.key === "retail")    return canSeeRetail;
    return false;
  }).map((s) => s.key);

  // Sections that are permitted AND not manually hidden by the user.
  const visibleSections = permittedSections.filter(
    (k) => !manualHidden.includes(k),
  );

  // Managers get a fixed layout: every permitted section, no manual
  // hiding and no picker — the dashboard just knows what to show them
  // (an accountant-persona keeps Finance, a stock manager keeps Stock).
  // Owner/generic get the configurable permission-filtered set.
  const sectionsToRender = isManagerView ? permittedSections : visibleSections;

  // Finance detail (net profit, bank balances) unblurred only for
  // users with accounting:approve or accounting:view.
  const canViewFinance =
    hasPermission("accounting", "approve") ||
    hasPermission("accounting", "view");

  // Build alerts from live data
  const alerts: AlertItem[] = [];
  const arTotal = financeData?.ar_ageing?.total ?? 0;
  const arCount = financeData?.ar_ageing?.invoice_count ?? 0;
  const lowStock = parseInt(String(stockData?.low_stock?.low_stock_count ?? 0));
  const failedDels = logisticsData?.summary?.failed ?? 0;

  if (arCount > 0 && canViewFinance)
    alerts.push({
      id: "ar",
      severity: "error",
      icon: "📄",
      label: `${arCount} overdue invoice${arCount > 1 ? "s" : ""}`,
      count: arCount,
      amount: arTotal,
      href: "/reports/finance/outstanding_invoices",
    });
  if (lowStock > 0)
    alerts.push({
      id: "stock",
      severity: "warn",
      icon: "📦",
      label: `${lowStock} product${lowStock > 1 ? "s" : ""} below reorder level`,
      count: lowStock,
      href: "/reports/stock/low_stock",
    });
  if (failedDels > 0)
    alerts.push({
      id: "deliveries",
      severity: "error",
      icon: "🚫",
      label: `${failedDels} failed deliver${failedDels > 1 ? "ies" : "y"} this week`,
      count: failedDels,
      href: "/logistics",
    });

  // Refresh all dashboard queries — matches every ["dash", ...] key.
  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ["dash"] });
    setLastRefresh(new Date());
  }

  // Toggle section visibility (toggles user's hidden-override for permitted sections)
  function toggleSection(key: SectionKey) {
    setManualHidden((prev) => {
      const next = prev.includes(key)
        ? prev.filter((s) => s !== key)
        : [...prev, key];
      localStorage.setItem("dashboard_sections_hidden", JSON.stringify(next));
      return next;
    });
  }

  const { user } = useAuthStore();
  const greeting = getGreeting(user?.display_name);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-brand-black">
      {/* Top nav — stacks into two breathing rows on mobile, inline on desktop */}
      <div className="flex flex-col gap-2 border-b border-white/5 px-4 sm:px-8 py-3 flex-shrink-0 sm:flex-row sm:items-center sm:justify-between">
        {/* Row 1: menu + tabs */}
        <div className="flex items-center gap-2">
          {/* Mobile menu toggle */}
          {!isDesktop && (
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="p-2 -ml-2 text-brand-cream hover:bg-brand-graphite rounded-lg transition-colors mr-2"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
          {/* Tabs */}
          <div className="flex items-center gap-1 rounded-xl border border-white/5 bg-brand-charcoal p-1">
            {(
              [
                {
                  key: "dashboard",
                  label: "Dashboard",
                  icon: LayoutDashboard,
                  badge: 0,
                },
                {
                  key: "workspace",
                  label: "Workspace",
                  icon: Calendar,
                  badge: 0,
                },
                {
                  key: "notifications",
                  label: "Notifications",
                  icon: Bell,
                  badge: unreadCount,
                },
              ] as const
            ).map(({ key, label, icon: Icon, badge }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                  activeTab === key
                    ? "bg-brand-accent text-brand-black"
                    : "text-brand-smoke hover:text-brand-cream",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:block">{label}</span>
                {badge > 0 && (
                  <span
                    className={cn(
                      "flex h-4 min-w-4 items-center justify-center rounded-full text-[9px] font-bold px-1",
                      activeTab === key
                        ? "bg-brand-black text-brand-accent"
                        : "bg-brand-accent text-brand-black",
                    )}
                  >
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: dashboard controls — own row on mobile (scrolls if tight),
            right-aligned inline on desktop, so the bar never feels crammed. */}
        {activeTab === "dashboard" && (
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap sm:justify-end">
            {/* Period selector — hidden for cashiers (their view is "today") */}
            {!isCashierView && (
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="rounded-lg border border-white/10 bg-brand-charcoal px-2.5 py-1.5 text-xs text-brand-cream focus:border-brand-accent/40 focus:outline-none"
              >
                {PERIOD_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            )}

            {/* Section visibility — owner only; other personas get fixed,
                curated layouts and shouldn't need to configure anything */}
            {isOwnerView && (
              <div className="relative">
                <button
                  onClick={() => setShowSectionPicker((s) => !s)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-brand-charcoal px-2.5 py-1.5 text-xs text-brand-smoke hover:text-brand-cream transition-colors"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:block">Sections</span>
                </button>
                {showSectionPicker && (
                  <div className="absolute right-0 top-full mt-1 z-30 w-48 rounded-xl border border-white/10 bg-brand-charcoal shadow-xl p-2">
                    {DASHBOARD_SECTIONS.filter((s) =>
                      permittedSections.includes(s.key),
                    ).map((s) => (
                      <label
                        key={s.key}
                        className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-brand-graphite/30"
                      >
                        <input
                          type="checkbox"
                          checked={visibleSections.includes(s.key)}
                          onChange={() => toggleSection(s.key)}
                          className="rounded"
                        />
                        <span className="text-xs text-brand-cream">
                          {s.icon} {s.label}
                        </span>
                      </label>
                    ))}
                    {permittedSections.length === 0 && (
                      <p className="text-[10px] text-brand-smoke px-2 py-2">
                        No sections permitted
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Refresh */}
            <button
              onClick={handleRefresh}
              className="text-brand-smoke hover:text-brand-accent transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            <p className="text-[10px] text-brand-smoke/40 hidden sm:block">
              Updated{" "}
              {lastRefresh.toLocaleTimeString("en-NG", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        )}
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Dashboard tab ── */}
        {activeTab === "dashboard" && (
          <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-8">
            {/* ── Cashier layout — today's number, quick actions, own sales ── */}
            {isCashierView && (
              <>
                <p className="text-sm text-brand-smoke">{greeting}</p>
                <TodayHeroCard currency={currency} />
                <QuickActions />
                <MyRecentSales currency={currency} />
              </>
            )}

            {/* ── Manager layout — today hero + quick actions above curated sections ── */}
            {isManagerView && (
              <>
                <p className="text-sm text-brand-smoke">{greeting}</p>
                <TodayHeroCard currency={currency} />
                <QuickActions />
              </>
            )}

            {/* ── Owner layout — yesterday briefing + quick actions ── */}
            {isOwnerView && yesterday && (
              <div className="rounded-2xl border border-brand-accent/20 bg-brand-accent/5 px-5 py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-sm text-brand-smoke">{greeting}</p>
                    <p className="text-lg font-semibold text-brand-cream mt-0.5">
                      Yesterday ({fmtDate(yesterday.date)})
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-6">
                    <div className="text-center">
                      <p className="font-display text-2xl font-light text-brand-accent tabular-nums">
                        {fmtMoney(yesterday.revenue, currency)}
                      </p>
                      <p className="text-[10px] text-brand-smoke uppercase tracking-widest">
                        Revenue
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="font-display text-2xl font-light text-brand-cream tabular-nums">
                        {yesterday.invoice_count}
                      </p>
                      <p className="text-[10px] text-brand-smoke uppercase tracking-widest">
                        Invoices
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="font-display text-2xl font-light text-brand-cream tabular-nums">
                        {yesterday.new_customers}
                      </p>
                      <p className="text-[10px] text-brand-smoke uppercase tracking-widest">
                        New Customers
                      </p>
                    </div>
                    {yesterday.top_product && (
                      <div className="text-center">
                        <p className="text-sm font-semibold text-brand-cream truncate max-w-[140px]">
                          {yesterday.top_product.name}
                        </p>
                        <p className="text-[10px] text-brand-smoke uppercase tracking-widest">
                          Top Product · {yesterday.top_product.units} units
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Owner quick actions */}
            {isOwnerView && <QuickActions max={3} />}

            {/* Alerts strip — operational alerts for everyone except cashiers */}
            {!isCashierView && alerts.length > 0 && <AlertsStrip alerts={alerts} />}

            {/* KPI sections.
                Owner/generic: permission-filtered minus manually-hidden.
                Manager: fixed curated set (sales, stock, logistics) — no
                configuration decisions to make.
                Cashier: none — their layout is rendered above. */}
            {!isCashierView && (
              <div className="space-y-10">
                {sectionsToRender.includes("sales") && (
                  <SalesSection
                    data={salesData ?? null}
                    isLoading={salesLoading}
                    currency={currency}
                  />
                )}
                {sectionsToRender.includes("finance") && (
                  <FinanceSection
                    data={financeData ?? null}
                    isLoading={financeLoading}
                    currency={currency}
                    canView={canViewFinance}
                  />
                )}
                {sectionsToRender.includes("customers") && (
                  <CustomersSection
                    data={customerData ?? null}
                    isLoading={customerLoading}
                    currency={currency}
                  />
                )}
                {sectionsToRender.includes("stock") && (
                  <StockSection
                    data={stockData ?? null}
                    isLoading={stockLoading}
                    currency={currency}
                  />
                )}
                {sectionsToRender.includes("logistics") && (
                  <LogisticsSection
                    data={logisticsData ?? null}
                    isLoading={logisticsLoading}
                    currency={currency}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Workspace tab ── */}
        {activeTab === "workspace" && <WorkspacePage />}

        {/* ── Notifications tab ── */}
        {activeTab === "notifications" && (
          <div className="px-4 sm:px-8 py-6 max-w-3xl mx-auto">
            <NotificationsPanel />
          </div>
        )}
      </div>
    </div>
  );
}

function getGreeting(name?: string): string {
  const h = new Date().getHours();
  const n = name || "there";
  if (h < 12) return `Good morning, ${n} ☀️`;
  if (h < 17) return `Good afternoon, ${n} 👋`;
  return `Good evening, ${n} 🌙`;
}
