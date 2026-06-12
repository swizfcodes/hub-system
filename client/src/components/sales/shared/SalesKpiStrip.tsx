import {
  TrendingUp,
  FileText,
  CheckCircle,
  AlertCircle,
  DollarSign,
} from "lucide-react";
import { Skeleton } from "@components/ui/Skeleton";
import { fmtMoney } from "@lib/format";
import type { SalesKpis } from "@typedefs/sales";

interface Props {
  kpis: SalesKpis | undefined;
  isLoading: boolean;
  currency?: string;
}

interface KpiCardProps {
  label: string;
  value: string;
  icon: typeof TrendingUp;
  accent?: "gold" | "sage" | "danger" | "default";
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent = "default",
}: KpiCardProps) {
  const accentColor = {
    gold: "#C9A86C",
    sage: "#8B9D77",
    danger: "#C0392B",
    default: "#C5BEB1",
  }[accent];

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/5 bg-brand-charcoal px-4 py-4 sm:px-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-widest text-brand-smoke">
          {label}
        </span>
        <Icon className="h-4 w-4" style={{ color: accentColor }} />
      </div>
      <span
        className="font-display text-xl font-extrabold sm:text-2xl"
        style={{ color: accentColor === "#C5BEB1" ? "#F0EBE2" : accentColor }}
      >
        {value}
      </span>
    </div>
  );
}

export function SalesKpiStrip({ kpis, isLoading, currency = "NGN" }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!kpis) return null;

  const cards: KpiCardProps[] = [
    {
      label: "Pipeline Value",
      value: fmtMoney(kpis.pipeline_value, currency),
      icon: TrendingUp,
      accent: "gold",
    },
    {
      label: "Open Quotes",
      value: String(kpis.open_quotes),
      icon: FileText,
      accent: "default",
    },
    {
      label: "Confirmed MTD",
      value: String(kpis.confirmed_this_month),
      icon: CheckCircle,
      accent: "sage",
    },
    {
      label: "Overdue Invoices",
      value: String(kpis.overdue_invoices),
      icon: AlertCircle,
      accent: kpis.overdue_invoices > 0 ? "danger" : "default",
    },
    {
      label: "Revenue MTD",
      value: fmtMoney(kpis.revenue_this_month, currency),
      icon: DollarSign,
      accent: "sage",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <KpiCard key={card.label} {...card} />
      ))}
    </div>
  );
}
