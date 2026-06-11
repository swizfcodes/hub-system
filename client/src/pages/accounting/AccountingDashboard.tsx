import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  TrendingDown,
  Banknote,
  AlertCircle,
  BookOpen,
  Scale,
  FileText,
  CreditCard,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import { Badge } from "@components/ui/Badge";
import { getDashboard } from "@services/accounting";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtMoney, fmtDate } from "@lib/format";
import { Topbar } from "@components/shell/Topbar";

export default function AccountingDashboard() {
  const navigate = useNavigate();
  const { currency } = useActiveBusiness();

  const { data: dash, isLoading } = useQuery({
    queryKey: ["accounting-dashboard"],
    queryFn: getDashboard,
    refetchInterval: 5 * 60_000,
  });

  const netPositive = (dash?.net_profit_mtd ?? 0) >= 0;

  return (
    <>
      <Topbar
        title="Accounting"
        subtitle="Journals · Reports · Reconciliation"
      />
      <div className="px-4 sm:px-8 py-6 max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Accounting"
          subtitle="Financial overview — all journals, reports, and reconciliation in one place."
          crumbs={[{ label: "Hub", to: "/" }, { label: "Accounting" }]}
        />

        {/* KPI strip */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard
              label="Revenue MTD"
              value={fmtMoney(dash?.revenue_mtd ?? 0, currency)}
              icon={TrendingUp}
              color="#2ECC71"
            />
            <KpiCard
              label="Expenses MTD"
              value={fmtMoney(dash?.expenses_mtd ?? 0, currency)}
              icon={TrendingDown}
              color="#E67E22"
            />
            <KpiCard
              label="Net Profit MTD"
              value={fmtMoney(Math.abs(dash?.net_profit_mtd ?? 0), currency)}
              sub={!netPositive ? "Net Loss" : undefined}
              icon={Scale}
              color={netPositive ? "#C9A86C" : "#E74C3C"}
            />
            <KpiCard
              label="Cash Position"
              value={fmtMoney(dash?.cash_position ?? 0, currency)}
              icon={Banknote}
              color="#4E9AF1"
            />
          </div>
        )}

        {/* Status alerts */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Open period */}
          <div className="rounded-2xl border border-white/5 bg-brand-charcoal px-5 py-4">
            <p className="text-xs uppercase tracking-widest text-brand-smoke mb-2">
              Current Fiscal Period
            </p>
            {dash?.open_period ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-brand-cream">
                    {dash.open_period.name}
                  </p>
                  <p className="text-xs text-brand-smoke">
                    {fmtDate(dash.open_period.start_date)} —{" "}
                    {fmtDate(dash.open_period.end_date)}
                  </p>
                </div>
                <Badge tone="sage" size="xs" dot>
                  Open
                </Badge>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-400">
                <AlertCircle className="h-4 w-4" />
                <p className="text-sm">
                  No open fiscal period — journals cannot post
                </p>
              </div>
            )}
          </div>

          {/* Unreconciled items */}
          <div className="rounded-2xl border border-white/5 bg-brand-charcoal px-5 py-4">
            <p className="text-xs uppercase tracking-widest text-brand-smoke mb-2">
              Bank Reconciliation
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display text-2xl font-light text-brand-cream">
                  {dash?.unreconciled_count ?? 0}
                </p>
                <p className="text-xs text-brand-smoke">unreconciled items</p>
              </div>
              {(dash?.unreconciled_count ?? 0) > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate("/accounting/reconciliation")}
                >
                  Reconcile
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Quick navigation */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke mb-4">
            Accounting Modules
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              {
                label: "Chart of Accounts",
                icon: BookOpen,
                to: "/accounting/accounts",
              },
              {
                label: "Journal Entries",
                icon: FileText,
                to: "/accounting/journals",
              },
              {
                label: "Financial Reports",
                icon: Scale,
                to: "/accounting/reports",
              },
              {
                label: "Bank Reconciliation",
                icon: CreditCard,
                to: "/accounting/reconciliation",
              },
              {
                label: "Fiscal Periods",
                icon: AlertCircle,
                to: "/accounting/periods",
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.to}
                  onClick={() => navigate(item.to)}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-white/5 bg-brand-charcoal p-5 hover:border-brand-accent/30 hover:bg-brand-accent/5 transition-all text-center group"
                >
                  <Icon className="h-6 w-6 text-brand-smoke group-hover:text-brand-accent transition-colors" />
                  <p className="text-xs text-brand-cloud group-hover:text-brand-cream transition-colors">
                    {item.label}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof TrendingUp;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-brand-charcoal px-5 py-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-3.5 w-3.5" style={{ color }} />
        <p className="text-[0.65rem] uppercase tracking-widest text-brand-smoke">
          {label}
        </p>
      </div>
      <p
        className="font-display text-xl font-light tabular-nums"
        style={{ color }}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-red-400 mt-0.5">{sub}</p>}
    </div>
  );
}
