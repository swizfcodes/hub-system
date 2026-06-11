import { cn } from "@lib/cn";

interface Props {
  onHand: number;
  reorderLevel?: number;
  available?: number;
  compact?: boolean;
  className?: string;
}

/**
 * Stock level visual indicator. Tone shifts by ratio against reorder_level:
 *   0          → danger (out of stock)
 *   <= reorder → warn (low)
 *   <= 1.5x    → neutral (healthy)
 *   else       → sage (well-stocked)
 */
export function StockLevelBadge({
  onHand,
  reorderLevel = 0,
  available,
  compact,
  className,
}: Props) {
  const out = onHand <= 0;
  const low = !out && reorderLevel > 0 && onHand <= reorderLevel;
  const healthy = !out && !low;

  const tone = out ? "danger" : low ? "warn" : healthy ? "sage" : "neutral";
  const cls = {
    danger: "bg-state-danger/15 text-state-danger border-state-danger/30",
    warn: "bg-state-warn/15 text-state-warn border-state-warn/30",
    sage: "bg-accent2/15 text-accent2 border-accent2/30",
    neutral: "bg-brand-graphite/40 text-brand-cloud border-brand-graphite",
  }[tone];

  const label = out
    ? "Out of stock"
    : low
      ? `Low (${onHand})`
      : `${onHand} on hand`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium tabular-nums",
        compact ? "px-2 py-0.5 text-[0.6rem]" : "px-2.5 py-1 text-[0.65rem]",
        cls,
        className,
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          tone === "danger"
            ? "bg-state-danger animate-pulse"
            : tone === "warn"
              ? "bg-state-warn"
              : tone === "sage"
                ? "bg-accent2"
                : "bg-brand-cloud",
        )}
      />
      {label}
      {available != null && available !== onHand && (
        <span className="text-brand-smoke">· {available} avail.</span>
      )}
    </span>
  );
}
