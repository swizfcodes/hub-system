/**
 * DashboardSections — all six KPI sections for the dashboard tab.
 * Pure numbers — no charts (Q8: A).
 * Finance section blurred for non-approve users (Q9: blend D+B).
 */
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { KpiCard, StatRow } from "@components/dashboard/KpiCard";
import { Skeleton } from "@components/ui/Skeleton";
import { fmtMoney } from "@lib/format";
import type {
  SalesDashboard,
  FinanceDashboard,
  StockDashboard,
  CustomerDashboard,
  LogisticsDashboard,
} from "@typedefs/dashboard";

interface SectionProps {
  isLoading: boolean;
  currency: string;
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  href,
  children,
  isLoading,
}: {
  title: string;
  icon: string;
  href: string;
  isLoading: boolean;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <h3 className="text-sm font-semibold text-brand-cream">{title}</h3>
        </div>
        <button
          onClick={() => navigate(href)}
          className="flex items-center gap-1 text-xs text-brand-accent hover:underline"
        >
          Details <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

// ── Sales Section ─────────────────────────────────────────────────────────────

export function SalesSection({
  data,
  isLoading,
  currency,
}: SectionProps & { data: SalesDashboard | null }) {
  if (!data && !isLoading) return null;

  const rev = data?.revenue;
  const top5 = data?.top_products?.slice(0, 5) ?? [];

  return (
    <Section
      title="Sales"
      icon="📈"
      href="/reports/sales/by_period"
      isLoading={isLoading}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="MTD Revenue"
          value={rev?.total_amount ?? 0}
          type="currency"
          currency={currency}
          size="lg"
        />
        <KpiCard
          label="Invoices"
          value={rev?.invoice_count ?? 0}
          type="number"
        />
        <KpiCard
          label="Avg Order Value"
          value={rev?.avg_order_value ?? 0}
          type="currency"
          currency={currency}
        />
        <KpiCard
          label="Collected"
          value={rev?.total_collected ?? 0}
          type="currency"
          currency={currency}
        />
      </div>

      {/* Top products */}
      {top5.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal px-4 py-3 space-y-1">
          <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-2">
            Top Products
          </p>
          {top5.map((p, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0"
            >
              <p className="text-xs text-brand-cream truncate max-w-[200px]">
                {p.description}
              </p>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-xs text-brand-smoke">
                  {p.units_sold} units
                </span>
                <span className="text-xs font-semibold text-brand-cream tabular-nums">
                  {fmtMoney(p.revenue, currency)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment methods */}
      {(data?.payment_methods?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal px-4 py-3">
          <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-2">
            Payment Methods
          </p>
          {data!.payment_methods.map((m, i) => (
            <StatRow
              key={i}
              label={m.payment_method || "Other"}
              value={m.total_amount}
              type="currency"
              currency={currency}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

// ── Finance Section ───────────────────────────────────────────────────────────

export function FinanceSection({
  data,
  isLoading,
  currency,
  canView,
}: SectionProps & { data: FinanceDashboard | null; canView: boolean }) {
  const ive = data?.income_vs_expense;
  const ar = data?.ar_ageing;
  const banks = data?.bank_balances ?? [];

  return (
    <Section
      title="Finance"
      icon="💰"
      href="/reports/finance/profit_and_loss"
      isLoading={isLoading}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Income (MTD)"
          value={ive?.income ?? 0}
          type="currency"
          currency={currency}
          restricted={!canView}
        />
        <KpiCard
          label="Expenses (MTD)"
          value={ive?.expenses ?? 0}
          type="currency"
          currency={currency}
          restricted={!canView}
        />
        <KpiCard
          label="Net Profit"
          value={ive?.net ?? 0}
          type="currency"
          currency={currency}
          restricted={!canView}
          alertColor={canView && ive && ive.net < 0 ? "#EF4444" : undefined}
        />
        <KpiCard
          label="AR Outstanding"
          value={ar?.total ?? 0}
          type="currency"
          currency={currency}
          alertColor={ar && ar.total > 0 ? "#F97316" : undefined}
          sub={ar ? `${ar.invoice_count} invoices` : undefined}
        />
      </div>

      {/* AR ageing breakdown */}
      {ar && canView && (
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal px-4 py-3">
          <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-2">
            AR Ageing
          </p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            <StatRow
              label="Current"
              value={ar.current ?? 0}
              type="currency"
              currency={currency}
            />
            <StatRow
              label="1–30 days"
              value={ar["1_30"] ?? 0}
              type="currency"
              currency={currency}
              accent={ar["1_30"] > 0 ? "#F97316" : undefined}
            />
            <StatRow
              label="31–60 days"
              value={ar["31_60"] ?? 0}
              type="currency"
              currency={currency}
              accent={ar["31_60"] > 0 ? "#F97316" : undefined}
            />
            <StatRow
              label="90+ days"
              value={ar["90plus"] ?? 0}
              type="currency"
              currency={currency}
              accent={ar["90plus"] > 0 ? "#EF4444" : undefined}
            />
          </div>
        </div>
      )}

      {/* Bank balances */}
      {banks.length > 0 && canView && (
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal px-4 py-3">
          <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-2">
            Bank Balances
          </p>
          {banks.map((b) => (
            <StatRow
              key={b.account_id}
              label={`${b.bank_name} — ${b.account_name}`}
              value={b.running_balance}
              type="currency"
              currency={currency}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

// ── Customers Section ─────────────────────────────────────────────────────────

export function CustomersSection({
  data,
  isLoading,
  currency,
}: SectionProps & { data: CustomerDashboard | null }) {
  const summary = data?.summary;
  const nvr = data?.new_vs_returning;
  const top5 = data?.top_customers?.slice(0, 5) ?? [];
  const pipeline = data?.pipeline_health ?? [];

  return (
    <Section
      title="Customers & CRM"
      icon="👥"
      href="/reports/sales/by_customer"
      isLoading={isLoading}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Total Customers"
          value={summary?.total_customers ?? 0}
          type="number"
        />
        <KpiCard
          label="VIP Customers"
          value={summary?.vip_count ?? 0}
          type="number"
          alertColor={summary?.vip_count ? "#C9A86C" : undefined}
        />
        <KpiCard
          label="New This Period"
          value={summary?.new_this_period ?? 0}
          type="number"
        />
        <KpiCard
          label="Returning"
          value={nvr?.returning_customers ?? 0}
          type="number"
          sub={nvr ? `${nvr.new_customers} new` : undefined}
        />
      </div>

      {/* Top customers */}
      {top5.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal px-4 py-3">
          <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-2">
            Top Customers
          </p>
          {top5.map((c) => (
            <div
              key={c.contact_id}
              className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0"
            >
              <div>
                <p className="text-xs text-brand-cream">{c.display_name}</p>
                <p className="text-[10px] text-brand-smoke">
                  {c.order_count} orders
                </p>
              </div>
              <span className="text-xs font-semibold text-brand-cream tabular-nums">
                {fmtMoney(c.lifetime_value, currency)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Pipeline health */}
      {pipeline.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal px-4 py-3">
          <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-2">
            Deal Pipeline
          </p>
          {pipeline.map((p) => (
            <StatRow
              key={p.stage}
              label={p.stage.replace(/_/g, " ")}
              value={p.total_value}
              type="currency"
              currency={currency}
              accent="#7B68EE"
            />
          ))}
        </div>
      )}
    </Section>
  );
}

// ── Stock Section ─────────────────────────────────────────────────────────────

export function StockSection({
  data,
  isLoading,
  currency,
}: SectionProps & { data: StockDashboard | null }) {
  const tv = data?.total_value;
  const lowCount = parseInt(String(data?.low_stock?.low_stock_count ?? 0));
  const topMov = data?.top_moving?.slice(0, 5) ?? [];

  return (
    <Section
      title="Inventory"
      icon="📦"
      href="/reports/stock/valuation"
      isLoading={isLoading}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Total SKUs"
          value={tv?.total_products ?? 0}
          type="number"
        />
        <KpiCard
          label="Cost Value"
          value={tv?.total_cost_value ?? 0}
          type="currency"
          currency={currency}
        />
        <KpiCard
          label="Retail Value"
          value={tv?.total_retail_value ?? 0}
          type="currency"
          currency={currency}
        />
        <KpiCard
          label="Low Stock Alerts"
          value={lowCount}
          type="number"
          alertColor={lowCount > 0 ? "#EF4444" : "#2D6A4F"}
          onClick={() => (window.location.href = "/reports/stock/low_stock")}
        />
      </div>

      {topMov.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal px-4 py-3">
          <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-2">
            Top Moving (Last 30 days)
          </p>
          {topMov.map((p) => (
            <div
              key={p.sku}
              className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0"
            >
              <p className="text-xs text-brand-cream truncate">{p.name}</p>
              <span className="text-xs font-semibold text-brand-accent tabular-nums">
                {p.units_out} units
              </span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ── Logistics Section ─────────────────────────────────────────────────────────

export function LogisticsSection({
  data,
  isLoading,
  currency: _currency,
}: SectionProps & { data: LogisticsDashboard | null }) {
  const s = data?.summary;
  const active = data?.active_deliveries?.slice(0, 5) ?? [];

  return (
    <Section
      title="Logistics"
      icon="🚚"
      href="/reports/delivery/performance"
      isLoading={isLoading}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <KpiCard
          label="Pending"
          value={s?.pending ?? 0}
          type="number"
          alertColor={s && s.pending > 10 ? "#F97316" : undefined}
        />
        <KpiCard label="In Transit" value={s?.in_transit ?? 0} type="number" />
        <KpiCard
          label="Delivered"
          value={s?.delivered ?? 0}
          type="number"
          alertColor="#2D6A4F"
        />
        <KpiCard
          label="Failed"
          value={s?.failed ?? 0}
          type="number"
          alertColor={s && s.failed > 0 ? "#EF4444" : undefined}
        />
        <KpiCard
          label="Avg Hours"
          value={s ? parseFloat(String(s.avg_delivery_hours)).toFixed(1) : "—"}
          type="text"
        />
      </div>

      {active.length > 0 && (
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal px-4 py-3">
          <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke mb-2">
            Active Deliveries
          </p>
          {active.map((d) => (
            <div
              key={d.delivery_id}
              className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0"
            >
              <div>
                <p className="text-xs text-brand-cream">{d.delivery_number}</p>
                <p className="text-[10px] text-brand-smoke">{d.contact_name}</p>
              </div>
              <span className="text-[10px] rounded-full px-2 py-0.5 bg-brand-graphite text-brand-smoke capitalize">
                {d.status.replace(/_/g, " ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
