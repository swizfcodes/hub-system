import { fmtMoney } from "@lib/format";
import { ProbabilityBar } from "./ProbabilityBar";

interface Props {
  value?: number | null;
  probability?: number;
  currency?: string;
  compact?: boolean;
}

export function DealValueCell({
  value,
  probability = 50,
  currency = "NGN",
  compact,
}: Props) {
  const weighted = value != null ? value * (probability / 100) : null;
  return (
    <div className={compact ? "flex items-center gap-2" : "space-y-1"}>
      <div>
        <div className="font-mono text-sm text-brand-cream">
          {fmtMoney(value, currency)}
        </div>
        {weighted != null && (
          <div className="text-[0.6rem] text-brand-smoke">
            weighted {fmtMoney(weighted, currency)}
          </div>
        )}
      </div>
      {!compact && <ProbabilityBar probability={probability} size="sm" />}
    </div>
  );
}
