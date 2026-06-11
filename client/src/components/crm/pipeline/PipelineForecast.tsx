import { useMemo } from "react";
import { Card } from "@components/ui/Card";
import { Skeleton } from "@components/ui/Skeleton";
import { fmtMoney, fmtPercent } from "@lib/format";
import type { PipelineStageWithDeals } from "@typedefs/crm";

interface Props {
  pipeline?: PipelineStageWithDeals[];
  loading?: boolean;
  currency?: string;
}

/**
 * Forecast view — funnel-style breakdown by stage with weighted values
 * and stage-level conversion estimates.
 *
 * For deeper analytics (win rate over time, sales-cycle length) we'd
 * call a dedicated `/api/crm/forecast` endpoint — not built on the
 * backend yet, so this view computes from the in-memory pipeline.
 */
export function PipelineForecast({
  pipeline,
  loading,
  currency = "NGN",
}: Props) {
  const rows = useMemo(() => {
    return (pipeline ?? []).map((s) => {
      const deals = s.deals;
      const totalValue = s.total_value || 0;
      const weighted = deals.reduce(
        (sum, d) =>
          sum +
          Number(d.expected_value || 0) * (Number(d.probability ?? 50) / 100),
        0,
      );
      const avgProb = deals.length
        ? deals.reduce((sum, d) => sum + (d.probability ?? 50), 0) /
          deals.length
        : 0;
      return { ...s, count: deals.length, totalValue, weighted, avgProb };
    });
  }, [pipeline]);

  if (loading) return <Skeleton className="h-96" />;

  const maxValue = Math.max(1, ...rows.map((r) => r.totalValue));
  const grandWeighted = rows.reduce((sum, r) => sum + r.weighted, 0);
  const grandTotal = rows.reduce((sum, r) => sum + r.totalValue, 0);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Big
            label="Total pipeline"
            value={fmtMoney(grandTotal, currency)}
            hint={`${rows.reduce((n, r) => n + r.count, 0)} deals across ${rows.length} stages`}
          />
          <Big
            label="Weighted forecast"
            value={fmtMoney(grandWeighted, currency)}
            hint="probability × value"
            tone="gold"
          />
          <Big
            label="Conversion confidence"
            value={fmtPercent(grandTotal ? grandWeighted / grandTotal : 0, 1)}
            hint="weighted / total"
          />
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-display text-xl text-brand-cream mb-4">By stage</h3>
        <div className="space-y-3">
          {rows.map((r) => {
            const bar = (r.totalValue / maxValue) * 100;
            return (
              <div key={r.stage_key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <div className="inline-flex items-center gap-2 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: r.colour }}
                    />
                    <span className="font-semibold text-brand-cream truncate">
                      {r.stage_label}
                    </span>
                    <span className="text-brand-smoke">·</span>
                    <span className="text-brand-smoke">
                      {r.count} deal{r.count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-brand-cream">
                      {fmtMoney(r.totalValue, currency)}
                    </div>
                    <div className="text-[0.6rem] text-brand-smoke">
                      weighted {fmtMoney(r.weighted, currency)} · avg{" "}
                      {Math.round(r.avgProb)}%
                    </div>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-brand-graphite overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${bar}%`, background: r.colour }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Big({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "gold";
}) {
  return (
    <div>
      <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
        {label}
      </div>
      <div
        className={`text-3xl font-display mt-1 tabular-nums ${tone === "gold" ? "text-brand-accent" : "text-brand-cream"}`}
      >
        {value}
      </div>
      {hint && (
        <div className="text-[0.65rem] text-brand-smoke mt-1">{hint}</div>
      )}
    </div>
  );
}
