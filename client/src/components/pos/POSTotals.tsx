// ── POSTotals.tsx ──────────────────────────────────────────────────────────────
import { usePOSStore, computeTotals } from "@stores/posStore";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { fmtMoney as fmtMoneyTotals } from "@lib/format";
import { Select } from "@components/ui/Select";
import { NumberField } from "@components/ui/NumberField";
import type { OrderDiscount } from "@typedefs/pos";

interface POSTotalsProps {
  currency?: string;
  onCheckout: (totals: ReturnType<typeof computeTotals>) => void;
}

export function POSTotals({ currency = "NGN", onCheckout }: POSTotalsProps) {
  const {
    lines,
    orderDiscount,
    loyaltyDisc,
    setOrderDiscount,
    applyVat,
    setApplyVat,
  } = usePOSStore((s) => ({
    lines: s.lines,
    orderDiscount: s.orderDiscount,
    loyaltyDisc: s.loyaltyDisc,
    setOrderDiscount: s.setOrderDiscount,
    applyVat: s.applyVat,
    setApplyVat: s.setApplyVat,
  }));

  // vatRate comes from /settings/businesses/:key via the active-business
  // react-query cache; 0.075 fallback applies until the record loads or
  // if vat_rate is unset on the business config. When the cashier turns
  // VAT off for this sale, compute totals zero-rated.
  const { vatRate } = useActiveBusiness();
  const effectiveVatRate = applyVat ? vatRate : 0;
  const totals = computeTotals(lines, orderDiscount, loyaltyDisc, effectiveVatRate);
  const hasApproval = lines.some((l) => l.needs_approval);

  return (
    <div className="space-y-3 border-t border-white/5 pt-3">
      {/* Order discount */}
      <div className="flex items-center gap-2">
        <Select
          value={orderDiscount?.type ?? "percentage"}
          onChange={(e) =>
            setOrderDiscount({
              type: e.target.value as OrderDiscount["type"],
              value: orderDiscount?.value ?? 0,
            })
          }
          className="w-28 text-xs"
          options={[
            { value: "percentage", label: "% Discount" },
            { value: "fixed", label: "Fixed Disc" },
          ]}
        />
        <div className="w-20 shrink-0">
          <NumberField
            decimal
            surface="dark"
            value={orderDiscount?.value}
            placeholder="0"
            onValueChange={(v) =>
              setOrderDiscount({
                type: orderDiscount?.type ?? "percentage",
                value: v ?? 0,
              })
            }
            className="bg-brand-graphite px-2 py-1.5 text-right tabular-nums"
          />
        </div>
      </div>

      {/* Totals */}
      <div className="space-y-1 text-sm">
        <Row
          label="Subtotal"
          value={fmtMoneyTotals(totals.line_subtotal, currency)}
        />
        {totals.order_disc_amt > 0 && (
          <Row
            label="Discount"
            value={`−${fmtMoneyTotals(totals.order_disc_amt, currency)}`}
            muted
          />
        )}
        {totals.loyalty_disc_amt > 0 && (
          <Row
            label="Loyalty"
            value={`−${fmtMoneyTotals(totals.loyalty_disc_amt, currency)}`}
            muted
          />
        )}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setApplyVat(!applyVat)}
            className="flex items-center gap-1.5 text-brand-smoke hover:text-brand-cream transition-colors"
            title="Toggle VAT for this sale"
          >
            <span
              className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
                applyVat ? "bg-brand-accent" : "bg-brand-graphite"
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  applyVat ? "translate-x-3.5" : "translate-x-0.5"
                }`}
              />
            </span>
            {`VAT (${(vatRate * 100).toFixed(1)}%)`}
            {!applyVat && (
              <span className="text-brand-smoke/60">— exempt</span>
            )}
          </button>
          <span className="text-brand-smoke">
            {fmtMoneyTotals(totals.vat, currency)}
          </span>
        </div>
        <div className="border-t border-white/10 pt-2">
          <Row
            label="Total"
            value={fmtMoneyTotals(totals.total, currency)}
            bold
          />
        </div>
      </div>

      {hasApproval && (
        <p className="rounded-lg border border-red-500/30 bg-red-900/10 px-3 py-2 text-xs text-red-400">
          Manager approval required for discounted items
        </p>
      )}

      <button
        onClick={() => !hasApproval && onCheckout(totals)}
        disabled={!lines.length || hasApproval}
        className="w-full rounded-lg bg-brand-accent py-3 font-semibold text-brand-black transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {hasApproval
          ? "Awaiting Approval"
          : `Checkout — ${fmtMoneyTotals(totals.total, currency)}`}
      </button>
    </div>
  );
}

function Row({
  label,
  value,
  muted = false,
  bold = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className={muted ? "text-brand-smoke" : "text-brand-cloud"}>
        {label}
      </span>
      <span
        className={
          bold
            ? "font-semibold text-brand-cream"
            : muted
              ? "text-brand-smoke"
              : "text-brand-cream"
        }
      >
        {value}
      </span>
    </div>
  );
}
