import { cn } from "@lib/cn";
import { fmtMoney } from "@lib/format";
import type { QuotationLine, OrderLine, InvoiceLine } from "@typedefs/sales";

type AnyLine = QuotationLine | OrderLine | InvoiceLine;

interface Totals {
  subtotal: number;
  discount_total: number;
  vat_amount: number;
  total_amount: number;
}

interface Props {
  lines: AnyLine[];
  totals: Totals;
  currency?: string;
  compact?: boolean;
  className?: string;
}

function hasDiscount(line: AnyLine): boolean {
  if ("discount_pct" in line) return line.discount_pct > 0;
  if ("discount_amount" in line) return (line.discount_amount ?? 0) > 0;
  return false;
}

function getDiscount(line: AnyLine): number {
  if ("discount_pct" in line) return line.discount_amount ?? 0;
  if ("discount_amount" in line) return line.discount_amount ?? 0;
  return 0;
}

export function LineItemsTable({
  lines,
  totals,
  currency = "NGN",
  compact = false,
  className,
}: Props) {
  const showDiscount = lines.some(hasDiscount);

  return (
    <div className={cn("w-full", className)}>
      {/* Table — scrollable on mobile */}
      <div className="overflow-x-auto rounded-lg border border-white/5">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-white/5 bg-brand-graphite/40">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest text-brand-smoke">
                Description
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest text-brand-smoke">
                Qty
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest text-brand-smoke">
                Unit Price
              </th>
              {showDiscount && (
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest text-brand-smoke">
                  Discount
                </th>
              )}
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest text-brand-smoke">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {lines.map((line, i) => (
              <tr
                key={"line_id" in line ? line.line_id : i}
                className="bg-brand-charcoal transition-colors hover:bg-brand-graphite/20"
              >
                <td
                  className={cn(
                    "px-4 text-brand-cream",
                    compact ? "py-2.5" : "py-3",
                  )}
                >
                  {line.description}
                </td>
                <td
                  className={cn(
                    "px-4 text-right tabular-nums text-brand-cloud",
                    compact ? "py-2.5" : "py-3",
                  )}
                >
                  {line.quantity}
                </td>
                <td
                  className={cn(
                    "px-4 text-right tabular-nums text-brand-cloud",
                    compact ? "py-2.5" : "py-3",
                  )}
                >
                  {fmtMoney(line.unit_price, currency)}
                </td>
                {showDiscount && (
                  <td
                    className={cn(
                      "px-4 text-right tabular-nums text-brand-smoke",
                      compact ? "py-2.5" : "py-3",
                    )}
                  >
                    {getDiscount(line) > 0
                      ? `−${fmtMoney(getDiscount(line), currency)}`
                      : "—"}
                  </td>
                )}
                <td
                  className={cn(
                    "px-4 text-right tabular-nums font-medium text-brand-cream",
                    compact ? "py-2.5" : "py-3",
                  )}
                >
                  {fmtMoney(line.line_total, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals block */}
      <div className="mt-3 flex justify-end">
        <div className="w-full max-w-xs space-y-2 rounded-lg border border-white/5 bg-brand-graphite/30 px-4 py-3">
          <TotalsRow
            label="Subtotal"
            value={fmtMoney(totals.subtotal, currency)}
            currency={currency}
          />
          {totals.discount_total > 0 && (
            <TotalsRow
              label="Discount"
              value={`−${fmtMoney(totals.discount_total, currency)}`}
              currency={currency}
              muted
            />
          )}
          {totals.vat_amount > 0 && (
            <TotalsRow
              label="VAT (7.5%)"
              value={fmtMoney(totals.vat_amount, currency)}
              currency={currency}
              muted
            />
          )}
          <div className="border-t border-white/10 pt-2">
            <TotalsRow
              label="Total"
              value={fmtMoney(totals.total_amount, currency)}
              currency={currency}
              bold
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TotalsRow({
  label,
  value,
  muted = false,
  bold = false,
}: {
  label: string;
  value: string;
  currency: string;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span
        className={cn(
          "text-xs",
          muted ? "text-brand-smoke" : "text-brand-cloud",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          bold
            ? "text-sm font-semibold text-brand-cream"
            : muted
              ? "text-xs text-brand-smoke"
              : "text-sm text-brand-cream",
        )}
      >
        {value}
      </span>
    </div>
  );
}
