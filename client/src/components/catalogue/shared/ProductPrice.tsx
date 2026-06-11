import { fmtMoney } from "@lib/format";
import { cn } from "@lib/cn";

interface Props {
  cost?: number | null;
  selling: number;
  currency?: string;
  size?: "sm" | "md";
  hideCost?: boolean;
  className?: string;
}

export function ProductPrice({
  cost,
  selling,
  currency = "NGN",
  size = "sm",
  hideCost,
  className,
}: Props) {
  const margin =
    cost && selling > 0 ? ((selling - cost) / selling) * 100 : null;
  return (
    <div
      className={cn(
        size === "md" ? "space-y-0.5" : "flex items-baseline gap-2",
        className,
      )}
    >
      <span
        className={cn(
          "font-mono text-brand-accent tabular-nums",
          size === "md" ? "text-lg" : "text-sm",
        )}
      >
        {fmtMoney(selling, currency)}
      </span>
      {!hideCost && cost != null && (
        <span
          className={cn(
            "font-mono text-brand-smoke",
            size === "md" ? "text-xs" : "text-[0.65rem]",
          )}
        >
          cost {fmtMoney(cost, currency)}
          {margin != null && (
            <span
              className={cn(
                "ml-1",
                margin > 30
                  ? "text-accent2"
                  : margin > 10
                    ? "text-state-warn"
                    : "text-state-danger",
              )}
            >
              · {margin.toFixed(0)}%
            </span>
          )}
        </span>
      )}
    </div>
  );
}
