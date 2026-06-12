/**
 * RoleDashboards — building blocks for persona-specific dashboard layouts.
 *
 * TodayHeroCard   — live "today so far" numbers, refetches every 60s.
 * QuickActions    — permission-gated shortcut buttons. Actions declare the
 *                   permission they need, so any role (existing or newly
 *                   created) automatically sees only the actions it can use.
 * MyRecentSales   — last 10 orders created by the signed-in user.
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart,
  Package,
  Truck,
  ReceiptText,
  BarChart3,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { getTodaySummary, getMyRecentSales } from "@services/dashboard";
import { usePermissions } from "@hooks/usePermissions";
import { useBusinessStore } from "@stores/useBusinessStore";
import { fmtMoney } from "@lib/format";
import { cn } from "@lib/cn";

// ── Today hero card ───────────────────────────────────────────────────────────

export function TodayHeroCard({ currency }: { currency: string }) {
  const active = useBusinessStore((s) => s.active);
  const { data: today, isLoading } = useQuery({
    queryKey: ["dash", "today", active],
    queryFn: getTodaySummary,
    refetchInterval: 60_000, // live counter — refresh every minute
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-brand-accent/20 bg-brand-accent/5 px-5 py-6 animate-pulse h-28" />
    );
  }
  if (!today) return null;

  return (
    <div className="rounded-2xl border border-brand-accent/20 bg-brand-accent/5 px-5 py-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-brand-smoke">Today so far</p>
          <p className="font-display text-4xl font-light text-brand-accent tabular-nums mt-1">
            {fmtMoney(today.revenue, currency)}
          </p>
        </div>
        <div className="flex flex-wrap gap-6">
          <div className="text-center">
            <p className="font-display text-2xl font-light text-brand-cream tabular-nums">
              {today.transaction_count}
            </p>
            <p className="text-[10px] text-brand-smoke uppercase tracking-widest">
              Transactions
            </p>
          </div>
          <div className="text-center">
            <p className="font-display text-2xl font-light text-brand-cream tabular-nums">
              {today.order_count}
            </p>
            <p className="text-[10px] text-brand-smoke uppercase tracking-widest">
              Orders
            </p>
          </div>
          <div className="text-center">
            <p className="font-display text-2xl font-light text-brand-cream tabular-nums">
              {today.new_customers}
            </p>
            <p className="text-[10px] text-brand-smoke uppercase tracking-widest">
              New Customers
            </p>
          </div>
          {today.top_product && (
            <div className="text-center">
              <p className="text-sm font-semibold text-brand-cream truncate max-w-[140px]">
                {today.top_product.name}
              </p>
              <p className="text-[10px] text-brand-smoke uppercase tracking-widest">
                Top Product · {today.top_product.units} units
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Quick actions ─────────────────────────────────────────────────────────────

interface QuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown only if the user has this permission — keeps the row correct
   *  for any role, including ones created later in the role editor. */
  permission: { module: string; action?: string };
  primary?: boolean;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "New Sale", href: "/pos", icon: ShoppingCart, permission: { module: "pos", action: "view" }, primary: true },
  { label: "Quick Sale", href: "/sales/orders/new", icon: Zap, permission: { module: "sales", action: "create" } },
  { label: "Check Stock", href: "/stock", icon: Package, permission: { module: "stock", action: "view" } },
  { label: "View Deliveries", href: "/logistics", icon: Truck, permission: { module: "logistics", action: "view" } },
  { label: "Approve Expenses", href: "/expenses", icon: ReceiptText, permission: { module: "expenses", action: "approve" } },
  { label: "View Reports", href: "/reports", icon: BarChart3, permission: { module: "reports", action: "view" } },
];

export function QuickActions({ max = 5 }: { max?: number }) {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();

  const actions = QUICK_ACTIONS.filter((a) =>
    hasPermission(a.permission.module, a.permission.action),
  ).slice(0, max);

  if (!actions.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map(({ label, href, icon: Icon, primary }) => (
        <button
          key={href + label}
          onClick={() => navigate(href)}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors border",
            primary
              ? "bg-brand-accent text-brand-black border-brand-accent hover:bg-brand-accent/90"
              : "bg-brand-charcoal text-brand-cream border-white/10 hover:border-brand-accent/40",
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

// ── My recent sales ───────────────────────────────────────────────────────────

export function MyRecentSales({ currency }: { currency: string }) {
  const navigate = useNavigate();
  const active = useBusinessStore((s) => s.active);
  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["dash", "my-recent-sales", active],
    queryFn: getMyRecentSales,
    refetchInterval: 60_000,
  });

  return (
    <section>
      <h2 className="text-sm font-semibold text-brand-cream mb-3">
        My Recent Sales
      </h2>
      {isLoading ? (
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal h-40 animate-pulse" />
      ) : sales.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal px-5 py-8 text-center">
          <p className="text-sm text-brand-smoke">
            No sales yet today — your transactions will appear here.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/5 bg-brand-charcoal divide-y divide-white/5 overflow-hidden">
          {sales.map((s) => (
            <button
              key={s.order_id}
              onClick={() => navigate(`/sales/orders/${s.order_id}`)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-brand-graphite/30 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-sm text-brand-cream truncate">
                  {s.customer_name || "Walk-in customer"}
                </p>
                <p className="text-[11px] text-brand-smoke">
                  {s.order_number} ·{" "}
                  {new Date(s.created_at).toLocaleTimeString("en-NG", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <p className="text-sm font-medium text-brand-accent tabular-nums whitespace-nowrap">
                {fmtMoney(Number(s.total_amount), currency)}
              </p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
