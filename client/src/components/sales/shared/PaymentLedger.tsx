import { CreditCard, ExternalLink } from "lucide-react";
import { fmtMoney, fmtDate } from "@lib/format";
import { PAYMENT_METHOD_META } from "@lib/constants/salesConstants";
import { Skeleton } from "@components/ui/Skeleton";
import type { InvoicePayment, Receipt } from "@typedefs/sales";
import { openReceiptPdf } from "@services/sales/receipts";

interface Props {
  payments: InvoicePayment[];
  receipts: Receipt[];
  currency?: string;
  isLoading?: boolean;
}

export function PaymentLedger({
  payments,
  receipts,
  currency = "NGN",
  isLoading = false,
}: Props) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  if (!payments.length) {
    return (
      <p className="py-4 text-center text-sm text-brand-smoke">
        No payments recorded yet.
      </p>
    );
  }

  // Map receipts by payment_id for quick lookup
  const receiptMap = new Map<string, Receipt>();
  for (const r of receipts) {
    if (r.payment_id) receiptMap.set(r.payment_id, r);
  }

  return (
    <div className="divide-y divide-white/5 rounded-lg border border-white/5 overflow-hidden">
      {payments.map((payment) => {
        const meta = PAYMENT_METHOD_META[payment.payment_method];
        const receipt = receiptMap.get(payment.payment_id);
        const Icon = meta?.icon ?? CreditCard;

        return (
          <div
            key={payment.payment_id}
            className="flex items-center justify-between gap-4 bg-brand-charcoal px-4 py-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-graphite">
                <Icon className="h-4 w-4 text-brand-accent" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-brand-cream">
                  {meta?.label ?? payment.payment_method}
                </p>
                <p className="text-xs text-brand-smoke">
                  {fmtDate(payment.payment_date)}
                  {payment.reference ? ` · ${payment.reference}` : ""}
                  {!payment.is_confirmed && (
                    <span className="ml-2 rounded-full bg-amber-900/30 px-1.5 py-0.5 text-xs text-amber-400">
                      Unconfirmed
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <span className="font-display text-sm font-semibold text-brand-accent tabular-nums">
                {fmtMoney(payment.amount, currency)}
              </span>
              {receipt && (
                <button
                  onClick={() => openReceiptPdf(receipt.receipt_id)}
                  className="flex items-center gap-1 text-xs text-brand-smoke transition-colors hover:text-brand-accent"
                  title={`Receipt ${receipt.receipt_number}`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    {receipt.receipt_number}
                  </span>
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
