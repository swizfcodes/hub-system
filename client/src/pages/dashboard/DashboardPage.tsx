/**
 * DashboardPage — the first app in the Command Centre.
 * Three tabs: Dashboard (KPIs) | Workspace (tasks+calendar) | Notifications
 *
 * Route: /dashboard
 */
import { useState } from 'react';
import { useQuery, useQueryClient }          from '@tanstack/react-query';
import { LayoutDashboard, Calendar, Bell, RefreshCw, Settings2, Menu } from 'lucide-react';
import { AlertsStrip, NotificationsPanel } from '@components/dashboard/AlertsAndNotifications';
import {
  SalesSection, FinanceSection, CustomersSection,
  StockSection, LogisticsSection,
} from '@components/dashboard/DashboardSections';
import WorkspacePage from '@pages/workspace/WorkspacePage';
import {
  getSalesData, getFinanceData, getStockData, getCustomerData,
  getLogisticsData, getYesterdaySummary, getUnreadCount,
} from '@services/dashboard';
import {
  DASHBOARD_SECTIONS, BRAND_OPTIONS, PERIOD_OPTIONS,
  DEFAULT_VISIBLE_SECTIONS, getPeriodParams, type SectionKey, type BrandOption } from '@lib/constants/dashboardConstants';
import { useActiveBusiness } from '@hooks/useActiveBusiness';
import { useAuthStore } from '@stores/useAuthStore';
import { useUiStore } from '@stores/useUiStore';
import { useIsDesktop } from '@hooks/useMediaQuery';
import { CommandPalette } from '@components/search/CommandPalette';
import { fmtMoney, fmtDate } from '@lib/format';
import { cn } from '@lib/cn';
import type { AlertItem } from '@typedefs/dashboard';

type Tab = 'dashboard' | 'workspace' | 'notifications';

export default function DashboardPage() {
  const qc                       = useQueryClient();
  const { currency }   = useActiveBusiness();
  const { setMobileSidebarOpen } = useUiStore();
  const isDesktop = useIsDesktop();
  const [searchOpen, setSearchOpen] = useState(false);

  // Tab state
  const [activeTab,  setActiveTab]  = useState<Tab>('dashboard');

  // Dashboard controls
  const [brand,      setBrand]      = useState<BrandOption>('jewelry');
  const [period,     setPeriod]     = useState('this_month');
  const [visibleSections, setVisibleSections] = useState<SectionKey[]>(
    () => {
      try {
        const saved = localStorage.getItem('dashboard_sections');
        return saved ? JSON.parse(saved) : DEFAULT_VISIBLE_SECTIONS;
      } catch { return DEFAULT_VISIBLE_SECTIONS; }
    }
  );
  const [showSectionPicker, setShowSectionPicker] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const params = getPeriodParams(period);

  // All data queries
  const { data: salesData,     isLoading: salesLoading }    = useQuery({ queryKey: ['dash-sales',    brand, period], queryFn: () => getSalesData(params),    refetchInterval: 5 * 60_000 });
  const { data: financeData,   isLoading: financeLoading }  = useQuery({ queryKey: ['dash-finance',  brand, period], queryFn: () => getFinanceData(params),  refetchInterval: 5 * 60_000 });
  const { data: stockData,     isLoading: stockLoading }    = useQuery({ queryKey: ['dash-stock',    brand],         queryFn: () => getStockData(),           refetchInterval: 5 * 60_000 });
  const { data: customerData,  isLoading: customerLoading } = useQuery({ queryKey: ['dash-customers',brand, period], queryFn: () => getCustomerData(params), refetchInterval: 5 * 60_000 });
  const { data: logisticsData, isLoading: logisticsLoading }= useQuery({ queryKey: ['dash-logistics',brand, period], queryFn: () => getLogisticsData(params),refetchInterval: 5 * 60_000 });
  const { data: yesterday }                                  = useQuery({ queryKey: ['dash-yesterday',brand],         queryFn: () => getYesterdaySummary(),    staleTime: 30 * 60_000 });
  const { data: unreadCount = 0 }                           = useQuery({ queryKey: ['unread-count'],                 queryFn: getUnreadCount,                 refetchInterval: 60_000 });

  // Permissions — check if user can see finance (approve-level)
  // In real app pull from useAuth(); hardcoded true for owner for now
  const canViewFinance = true;

  // Build alerts from live data
  const alerts: AlertItem[] = [];
  const arTotal     = financeData?.ar_ageing?.total ?? 0;
  const arCount     = financeData?.ar_ageing?.invoice_count ?? 0;
  const lowStock    = parseInt(String(stockData?.low_stock?.low_stock_count ?? 0));
  const failedDels  = logisticsData?.summary?.failed ?? 0;

  if (arCount > 0 && canViewFinance) alerts.push({
    id: 'ar', severity: 'error', icon: '📄',
    label: `${arCount} overdue invoice${arCount > 1 ? 's' : ''}`,
    count: arCount, amount: arTotal,
    href: '/reports/finance/outstanding_invoices',
  });
  if (lowStock > 0) alerts.push({
    id: 'stock', severity: 'warn', icon: '📦',
    label: `${lowStock} product${lowStock > 1 ? 's' : ''} below reorder level`,
    count: lowStock,
    href: '/reports/stock/low_stock',
  });
  if (failedDels > 0) alerts.push({
    id: 'deliveries', severity: 'error', icon: '🚫',
    label: `${failedDels} failed deliver${failedDels > 1 ? 'ies' : 'y'} this week`,
    count: failedDels,
    href: '/logistics',
  });

  // Refresh all dashboard queries
  function handleRefresh() {
    qc.invalidateQueries({ queryKey: ['dash-'] });
    setLastRefresh(new Date());
  }

  // Toggle section visibility
  function toggleSection(key: SectionKey) {
    setVisibleSections((prev) => {
      const next = prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key];
      localStorage.setItem('dashboard_sections', JSON.stringify(next));
      return next;
    });
  }

  const { user } = useAuthStore();
  const greeting = getGreeting(user?.display_name);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-orika-black">
      {/* Top nav */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 sm:px-8 py-3 flex-shrink-0">
        {/* Mobile menu toggle */}
        {!isDesktop && (
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-2 -ml-2 text-orika-cream hover:bg-orika-graphite rounded-lg transition-colors mr-2"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        {/* Tabs */}
        <div className="flex items-center gap-1 rounded-xl border border-white/5 bg-orika-charcoal p-1">
          {([
            { key: 'dashboard',     label: 'Dashboard',     icon: LayoutDashboard, badge: 0            },
            { key: 'workspace',     label: 'Workspace',     icon: Calendar,        badge: 0            },
            { key: 'notifications', label: 'Notifications', icon: Bell,            badge: unreadCount  },
          ] as const).map(({ key, label, icon: Icon, badge }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={cn(
                'relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                activeTab === key
                  ? 'bg-orika-gold text-orika-black'
                  : 'text-orika-smoke hover:text-orika-cream',
              )}>
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:block">{label}</span>
              {badge > 0 && (
                <span className={cn(
                  'flex h-4 min-w-4 items-center justify-center rounded-full text-[9px] font-bold px-1',
                  activeTab === key ? 'bg-orika-black text-orika-gold' : 'bg-orika-gold text-orika-black',
                )}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Dashboard controls (only on dashboard tab) */}
        {activeTab === 'dashboard' && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Brand toggle */}
            <div className="flex rounded-lg border border-white/10 bg-orika-charcoal overflow-hidden">
              {BRAND_OPTIONS.map((b) => (
                <button key={b.value} onClick={() => setBrand(b.value)}
                  className={cn(
                    'px-2.5 py-1.5 text-xs font-medium transition-colors',
                    brand === b.value ? 'bg-orika-gold text-orika-black' : 'text-orika-smoke hover:text-orika-cream',
                  )}>
                  {b.icon} <span className="hidden sm:inline ml-1">{b.label}</span>
                </button>
              ))}
            </div>

            {/* Period selector */}
            <select value={period} onChange={(e) => setPeriod(e.target.value)}
              className="rounded-lg border border-white/10 bg-orika-charcoal px-2.5 py-1.5 text-xs text-orika-cream focus:border-orika-gold/40 focus:outline-none">
              {PERIOD_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>

            {/* Section visibility */}
            <div className="relative">
              <button onClick={() => setShowSectionPicker((s) => !s)}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-orika-charcoal px-2.5 py-1.5 text-xs text-orika-smoke hover:text-orika-cream transition-colors">
                <Settings2 className="h-3.5 w-3.5" />
                <span className="hidden sm:block">Sections</span>
              </button>
              {showSectionPicker && (
                <div className="absolute right-0 top-full mt-1 z-30 w-48 rounded-xl border border-white/10 bg-orika-charcoal shadow-xl p-2">
                  {DASHBOARD_SECTIONS.map((s) => (
                    <label key={s.key} className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-orika-graphite/30">
                      <input type="checkbox"
                        checked={visibleSections.includes(s.key)}
                        onChange={() => toggleSection(s.key)}
                        className="rounded" />
                      <span className="text-xs text-orika-cream">{s.icon} {s.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Refresh */}
            <button onClick={handleRefresh}
              className="text-orika-smoke hover:text-orika-gold transition-colors" title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </button>

            <p className="text-[10px] text-orika-smoke/40 hidden sm:block">
              Updated {lastRefresh.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        )}
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Dashboard tab ── */}
        {activeTab === 'dashboard' && (
          <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-8">

            {/* Morning briefing */}
            {yesterday && (
              <div className="rounded-2xl border border-orika-gold/20 bg-orika-gold/5 px-5 py-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-sm text-orika-smoke">{greeting}</p>
                    <p className="text-lg font-semibold text-orika-cream mt-0.5">
                      Yesterday ({fmtDate(yesterday.date)})
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-6">
                    <div className="text-center">
                      <p className="font-display text-2xl font-light text-orika-gold tabular-nums">
                        {fmtMoney(yesterday.revenue, currency)}
                      </p>
                      <p className="text-[10px] text-orika-smoke uppercase tracking-widest">Revenue</p>
                    </div>
                    <div className="text-center">
                      <p className="font-display text-2xl font-light text-orika-cream tabular-nums">
                        {yesterday.invoice_count}
                      </p>
                      <p className="text-[10px] text-orika-smoke uppercase tracking-widest">Invoices</p>
                    </div>
                    <div className="text-center">
                      <p className="font-display text-2xl font-light text-orika-cream tabular-nums">
                        {yesterday.new_customers}
                      </p>
                      <p className="text-[10px] text-orika-smoke uppercase tracking-widest">New Customers</p>
                    </div>
                    {yesterday.top_product && (
                      <div className="text-center">
                        <p className="text-sm font-semibold text-orika-cream truncate max-w-[140px]">
                          {yesterday.top_product.name}
                        </p>
                        <p className="text-[10px] text-orika-smoke uppercase tracking-widest">
                          Top Product · {yesterday.top_product.units} units
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Alerts strip */}
            {alerts.length > 0 && <AlertsStrip alerts={alerts} />}

            {/* KPI sections */}
            <div className="space-y-10">
              {visibleSections.includes('sales') && (
                <SalesSection data={salesData ?? null} isLoading={salesLoading} currency={currency} />
              )}
              {visibleSections.includes('finance') && (
                <FinanceSection data={financeData ?? null} isLoading={financeLoading}
                  currency={currency} canView={canViewFinance} />
              )}
              {visibleSections.includes('customers') && (
                <CustomersSection data={customerData ?? null} isLoading={customerLoading} currency={currency} />
              )}
              {visibleSections.includes('stock') && (
                <StockSection data={stockData ?? null} isLoading={stockLoading} currency={currency} />
              )}
              {visibleSections.includes('logistics') && (
                <LogisticsSection data={logisticsData ?? null} isLoading={logisticsLoading} currency={currency} />
              )}
            </div>
          </div>
        )}

        {/* ── Workspace tab ── */}
        {activeTab === 'workspace' && <WorkspacePage />}

        {/* ── Notifications tab ── */}
        {activeTab === 'notifications' && (
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
  const n = name || 'there';
  if (h < 12) return `Good morning, ${n} ☀️`;
  if (h < 17) return `Good afternoon, ${n} 👋`;
  return `Good evening, ${n} 🌙`;
}
