// ── POSCart.tsx ────────────────────────────────────────────────────────────────
import { Trash2, AlertCircle, ChevronUp, ChevronDown } from "lucide-react";
import { usePOSStore } from "@stores/posStore";
import { fmtMoney } from "@lib/format";
import { cn } from "@lib/cn";

interface POSCartProps {
  currency?: string;
}

export function POSCart({ currency = "NGN" }: POSCartProps) {
  const { lines, updateLineQty, updateLinePrice, removeLine } = usePOSStore(
    (s) => ({
      lines: s.lines,
      updateLineQty: s.updateLineQty,
      updateLinePrice: s.updateLinePrice,
      removeLine: s.removeLine,
    }),
  );

  if (!lines.length) {
    return (
      <div className="flex flex-1 items-center justify-center py-12 text-center">
        <p className="text-sm text-orika-smoke">
          Cart is empty — add products from the search panel
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 flex-1 overflow-y-auto">
      {lines.map((line) => (
        <div
          key={line.id}
          className={cn(
            "rounded-lg border bg-orika-charcoal p-3 space-y-2",
            line.needs_approval ? "border-red-500/40" : "border-white/5",
          )}
        >
          {/* Line header */}
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-orika-cream line-clamp-2 flex-1">
              {line.description}
            </p>
            <button
              onClick={() => removeLine(line.id)}
              className="shrink-0 text-orika-smoke hover:text-red-400 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Approval warning */}
          {line.needs_approval && (
            <div className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Price below minimum ({fmtMoney(line.min_price, currency)}) —
              manager approval required
            </div>
          )}

          {/* Controls row */}
          <div className="flex items-center gap-2">
            {/* Qty */}
            <div className="flex items-center gap-1 rounded border border-white/10">
              <button
                onClick={() => updateLineQty(line.id, line.quantity - 1)}
                disabled={line.quantity <= 1}
                className="px-1.5 py-1 text-orika-smoke hover:text-orika-cream disabled:opacity-40 transition-colors"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
              <span className="min-w-[24px] text-center text-sm font-medium text-orika-cream tabular-nums">
                {line.quantity}
              </span>
              <button
                onClick={() => updateLineQty(line.id, line.quantity + 1)}
                disabled={line.quantity >= line.stock_qty}
                className="px-1.5 py-1 text-orika-smoke hover:text-orika-cream disabled:opacity-40 transition-colors"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
            </div>

            {/* Price (editable) */}
            <div className="flex-1">
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-orika-smoke">
                  ₦
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={line.unit_price}
                  onChange={(e) =>
                    updateLinePrice(line.id, parseFloat(e.target.value) || 0)
                  }
                  className={cn(
                    "w-full rounded border py-1 pl-5 pr-2 text-right text-sm tabular-nums text-orika-cream focus:outline-none",
                    line.needs_approval
                      ? "border-red-500/40 bg-red-900/10"
                      : "border-white/10 bg-orika-graphite focus:border-orika-gold/40",
                  )}
                />
              </div>
            </div>

            {/* Line total */}
            <span className="min-w-[70px] text-right text-sm font-semibold text-orika-cream tabular-nums">
              {fmtMoney(line.line_total, currency)}
            </span>
          </div>

          {/* Low stock warning */}
          {line.low_stock && !line.needs_approval && (
            <p className="text-[10px] text-amber-400">
              Low stock — {line.stock_qty} available
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
