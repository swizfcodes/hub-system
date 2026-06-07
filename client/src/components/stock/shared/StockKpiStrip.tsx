import {
  Package,
  AlertCircle,
  Lock,
  Truck,
  TrendingDown,
  ClipboardCheck,
} from "lucide-react";
import { Skeleton } from "@components/ui/Skeleton";
import { fmtMoney } from "@lib/format";
import { cn } from "@lib/cn";

interface Props {
  loading?: boolean;
  totalValue?: number;
  totalUnits?: number;
  lowStockCount?: number;
  outOfStockCount?: number;
  activeReservations?: number;
  pendingTransfers?: number;
  pendingQC?: number;
  currency?: string;
}

export function StockKpiStrip(p: Props) {
  if (p.loading) {
    return (
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-6 mb-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-6 mb-6">
      <Kpi
        tone="gold"
        icon={<Package className="w-4 h-4" />}
        label="Stock value"
        value={fmtMoney(p.totalValue ?? 0, p.currency ?? "NGN")}
        hint={`${p.totalUnits ?? 0} units total`}
      />
      <Kpi
        tone="warn"
        icon={<AlertCircle className="w-4 h-4" />}
        label="Low stock"
        value={String(p.lowStockCount ?? 0)}
        hint="Below reorder level"
      />
      <Kpi
        tone="danger"
        icon={<TrendingDown className="w-4 h-4" />}
        label="Out of stock"
        value={String(p.outOfStockCount ?? 0)}
        hint="Zero on hand"
      />
      <Kpi
        tone="rose"
        icon={<Lock className="w-4 h-4" />}
        label="Active reservations"
        value={String(p.activeReservations ?? 0)}
        hint="Held for deals"
      />
      <Kpi
        tone="info"
        icon={<Truck className="w-4 h-4" />}
        label="Pending transfers"
        value={String(p.pendingTransfers ?? 0)}
        hint="In transit"
      />
      <Kpi
        tone="sage"
        icon={<ClipboardCheck className="w-4 h-4" />}
        label="QC pending"
        value={String(p.pendingQC ?? 0)}
        hint="Incoming + ad-hoc"
      />
    </div>
  );
}

function Kpi({
  tone,
  icon,
  label,
  value,
  hint,
}: {
  tone: "gold" | "rose" | "sage" | "warn" | "info" | "danger";
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  const toneCls = {
    gold: "bg-orika-gold/15 text-orika-gold",
    rose: "bg-bejewelled-rose/15 text-bejewelled-rose",
    sage: "bg-living-sage/15 text-living-sage",
    warn: "bg-state-warn/15 text-state-warn",
    info: "bg-state-info/15 text-state-info",
    danger: "bg-state-danger/15 text-state-danger",
  }[tone];
  return (
    <div className="p-4 rounded-2xl border border-orika-graphite bg-orika-charcoal/60">
      <div
        className={cn(
          "inline-flex items-center justify-center w-8 h-8 rounded-lg",
          toneCls,
        )}
      >
        {icon}
      </div>
      <div className="text-[0.6rem] uppercase tracking-widest text-orika-smoke mt-2">
        {label}
      </div>
      <div className="text-xl font-display text-orika-cream mt-0.5 tabular-nums truncate">
        {value}
      </div>
      {hint && (
        <div className="text-[0.65rem] text-orika-smoke mt-1">{hint}</div>
      )}
    </div>
  );
}
