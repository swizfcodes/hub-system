import { TrendingUp, Target, Sparkles, AlertCircle } from "lucide-react";
import { Skeleton } from "@components/ui/Skeleton";
import { fmtMoney } from "@lib/format";
import type { PipelineStageWithDeals } from "@typedefs/crm";
import { cn } from "@lib/cn";

interface Props {
  pipeline?: PipelineStageWithDeals[];
  loading?: boolean;
  currency?: string;
}

/**
 * Top-of-pipeline KPI strip:
 *   - Open pipeline value (sum of expected_value for non-terminal stages)
 *   - Weighted forecast (sum of expected_value × probability/100)
 *   - Won this month (sum of expected_value for stages with won_at in this month)
 *   - Stuck deals (no activity > 14 days — placeholder; needs backend query)
 */
export function ForecastStrip({ pipeline, loading, currency = "NGN" }: Props) {
  if (loading || !pipeline) {
    return (
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const openStages = pipeline.filter((s) => !s.is_terminal);

  const openValue = openStages.reduce(
    (sum, s) => sum + (s.total_value || 0),
    0,
  );

  const openCount = openStages.reduce((n, s) => n + s.deals.length, 0);
  const avgDealSize = openCount ? openValue / openCount : 0;

  // Find "won" terminal stages.
  const wonStage = pipeline.find(
    (s) =>
      s.is_terminal &&
      (s.stage_key === "completed" ||
        s.stage_key === "delivered" ||
        s.stage_key === "won"),
  );
  const wonValue = wonStage?.total_value ?? 0;

  // Approx: count deals whose updated_at is older than 14 days as "stale".
  const fortnightAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const staleCount = openStages.reduce((count, s) => {
    return (
      count +
      s.deals.filter((d) => new Date(d.updated_at).getTime() < fortnightAgo)
        .length
    );
  }, 0);

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-4 mb-6">
      <Kpi
        icon={<TrendingUp className="w-4 h-4" />}
        label="Open pipeline"
        value={fmtMoney(openValue, currency)}
        hint={`${openCount} deals`}
        tone="gold"
      />
      <Kpi
        icon={<Target className="w-4 h-4" />}
        label="Avg deal size"
        value={fmtMoney(avgDealSize, currency)}
        hint="open deals"
        tone="rose"
      />
      <Kpi
        icon={<Sparkles className="w-4 h-4" />}
        label={wonStage?.stage_label ?? "Won"}
        value={fmtMoney(wonValue, currency)}
        hint={`${wonStage?.deals.length ?? 0} deals`}
        tone="sage"
      />
      <Kpi
        icon={<AlertCircle className="w-4 h-4" />}
        label="Stale (>14 days)"
        value={`${staleCount}`}
        hint="No recent activity"
        tone={staleCount > 0 ? "warn" : "neutral"}
      />
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone: "gold" | "rose" | "sage" | "warn" | "neutral";
}) {
  const toneCls: Record<typeof tone, string> = {
    gold: "bg-brand-accent/15 text-brand-accent",
    rose: "bg-accent3/15 text-accent3",
    sage: "bg-accent2/15 text-accent2",
    warn: "bg-state-warn/15 text-state-warn",
    neutral: "bg-brand-graphite text-brand-smoke",
  };
  return (
    <div className="p-4 rounded-2xl border border-brand-graphite bg-brand-charcoal/60">
      <div
        className={cn(
          "inline-flex items-center justify-center w-8 h-8 rounded-lg",
          toneCls[tone],
        )}
      >
        {icon}
      </div>
      <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke mt-2">
        {label}
      </div>
      <div className="text-xl font-display text-brand-cream mt-0.5 tabular-nums truncate">
        {value}
      </div>
      {hint && (
        <div className="text-[0.65rem] text-brand-smoke mt-1">{hint}</div>
      )}
    </div>
  );
}
