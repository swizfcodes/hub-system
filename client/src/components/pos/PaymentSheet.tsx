// ── PaymentSheet.tsx ───────────────────────────────────────────────────────────
import { useState, useEffect } from "react";
import { Plus, Trash2 as Trash } from "lucide-react";
import { v4 as uuid } from "uuid";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { NumberField } from "@components/ui/NumberField";
import { usePOSStore } from "@stores/posStore";
import { POS_PAYMENT_META } from "@lib/constants/posConstants";
import { cn } from "@lib/cn";
import { getLatestRate } from "@services/settings/currencyRates";
import type {
  PaymentSplitInput,
  CartTotals,
  POSPaymentMethod,
} from "@typedefs/pos";

const CURRENCIES = ["NGN", "USD", "GBP", "EUR"] as const;
const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: "₦",
  USD: "$",
  GBP: "£",
  EUR: "€",
};

interface PaymentSheetProps {
  open: boolean;
  onClose: () => void;
  totals: CartTotals;
  currency?: string;
  onConfirm: (
    payments: PaymentSplitInput[],
    saleCurrency: string,
    exchangeRate: number | null,
    changeHandling: "return" | "keep",
  ) => void;
  isLoading?: boolean;
}

export function PaymentSheet({
  open,
  onClose,
  totals,
  currency: _baseCurrency = "NGN",
  onConfirm,
  isLoading = false,
}: PaymentSheetProps) {
  const { loyaltyInfo, customer } = usePOSStore((s) => ({
    loyaltyInfo: s.loyaltyInfo,
    customer: s.customer,
  }));

  const [splits, setSplits] = useState<PaymentSplitInput[]>([
    { id: uuid(), method: "cash", amount: totals.total },
  ]);
  const [saleCurrency, setSaleCurrency] = useState("NGN");
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [changeHandling, setChangeHandling] = useState<"return" | "keep">(
    "return",
  );

  // Fetch rate when a foreign currency is selected
  useEffect(() => {
    if (saleCurrency === "NGN") {
      setExchangeRate(null);
      return;
    }
    let cancelled = false;
    setRateLoading(true);
    getLatestRate(saleCurrency, "NGN")
      .then((r) => {
        if (!cancelled) setExchangeRate(r?.rate ?? null);
      })
      .catch(() => {
        if (!cancelled) setExchangeRate(null);
      })
      .finally(() => {
        if (!cancelled) setRateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [saleCurrency]);

  const displayCurrency = saleCurrency;
  const symbol = CURRENCY_SYMBOLS[displayCurrency] || displayCurrency;

  // When foreign currency, show the foreign equivalent of the NGN total
  const displayTotal =
    saleCurrency !== "NGN" && exchangeRate && exchangeRate > 0
      ? Math.round((totals.total / exchangeRate) * 100) / 100
      : totals.total;

  const totalPaid = splits.reduce((s, p) => s + (p.amount || 0), 0);
  const change = Math.max(0, totalPaid - displayTotal);
  const shortfall = Math.max(0, displayTotal - totalPaid);
  const isReady = totalPaid >= displayTotal;

  // Reset splits when currency changes
  useEffect(() => {
    setSplits([{ id: uuid(), method: "cash", amount: displayTotal }]);
  }, [displayTotal]);

  function addSplit() {
    setSplits([
      ...splits,
      { id: uuid(), method: "bank_transfer", amount: shortfall },
    ]);
  }

  function removeSplit(id: string) {
    if (splits.length === 1) return;
    setSplits(splits.filter((s) => s.id !== id));
  }

  function updateSplit(id: string, patch: Partial<PaymentSplitInput>) {
    setSplits(splits.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Payment"
      size="md"
      surface="light"
      footer={
        <div className="flex items-center justify-between gap-3">
          {change > 0 && (
            <span className="text-sm font-semibold text-green-400">
              Change: {symbol}{change.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
            </span>
          )}
          <div className="flex gap-3 ml-auto">
            <Button variant="ghost" onClick={onClose} disabled={isLoading}>
              Back
            </Button>
            <Button
              onClick={() =>
                isReady &&
                onConfirm(
                  splits,
                  saleCurrency,
                  exchangeRate,
                  change > 0 ? changeHandling : "return",
                )
              }
              disabled={
                !isReady ||
                isLoading ||
                (saleCurrency !== "NGN" && !exchangeRate)
              }
              loading={isLoading}
            >
              Confirm {symbol}
              {displayTotal.toLocaleString("en-NG", {
                minimumFractionDigits: 2,
              })}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Total due */}
        <div className="rounded-lg bg-brand-graphite/40 px-4 py-3 flex justify-between items-center">
          <span className="text-sm text-brand-smoke">Total Due</span>
          <span className="font-display text-xl font-extrabold text-brand-accent">
            {symbol}
            {displayTotal.toLocaleString("en-NG", {
              minimumFractionDigits: 2,
            })}
          </span>
        </div>

        {/* Currency selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-brand-smoke">Paying in:</span>
          <div className="flex gap-1">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSaleCurrency(c)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-all",
                  saleCurrency === c
                    ? "bg-brand-accent/10 border border-brand-accent/60 text-brand-accent"
                    : "border border-black/10 text-brand-smoke hover:border-black/20",
                )}
              >
                {CURRENCY_SYMBOLS[c]} {c}
              </button>
            ))}
          </div>
        </div>

        {/* Exchange rate info */}
        {saleCurrency !== "NGN" && (
          <div className="rounded-lg border border-brand-accent/20 bg-brand-accent/5 px-3 py-2 text-xs">
            {rateLoading ? (
              <span className="text-brand-smoke">Fetching rate...</span>
            ) : exchangeRate ? (
              <span className="text-brand-accent">
                1 {saleCurrency} = ₦
                {exchangeRate.toLocaleString("en-NG", {
                  maximumFractionDigits: 2,
                })}{" "}
                &middot; NGN total: ₦
                {totals.total.toLocaleString("en-NG", {
                  minimumFractionDigits: 2,
                })}
              </span>
            ) : (
              <span className="text-red-400">
                No rate available for {saleCurrency}. Check Settings &rarr;
                Currency Rates.
              </span>
            )}
          </div>
        )}

        {/* Loyalty redemption hint */}
        {loyaltyInfo && loyaltyInfo.balance > 0 && customer && (
          <div className="rounded-lg border border-white/5 bg-brand-graphite/20 px-3 py-2 text-xs text-brand-smoke">
            Customer has {loyaltyInfo.balance.toLocaleString()} loyalty points —
            apply via the loyalty discount on checkout before confirming.
          </div>
        )}

        {/* Payment splits */}
        <div className="space-y-3">
          {splits.map((split) => {
            return (
              <div key={split.id} className="space-y-2">
                {/* Method selector */}
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    Object.keys(POS_PAYMENT_META) as POSPaymentMethod[]
                  ).map((method) => {
                    const m = POS_PAYMENT_META[method];
                    const M = m.icon;
                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => updateSplit(split.id, { method })}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-center transition-all",
                          split.method === method
                            ? "border-brand-accent/60 bg-brand-accent/5 text-brand-accent"
                            : "border-black/10 text-brand-smoke hover:border-black/20",
                        )}
                      >
                        <M className="h-4 w-4" />
                        <span className="text-[9px] leading-tight">
                          {m.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Amount + optional ref */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-brand-smoke">
                      {symbol}
                    </span>
                    <NumberField
                      decimal
                      surface="light"
                      value={split.amount}
                      onValueChange={(v) =>
                        updateSplit(split.id, { amount: v ?? 0 })
                      }
                      className="w-full rounded border border-black/10 bg-white py-2 pl-5 pr-2 text-right text-sm font-normal text-brand-black tabular-nums shadow-none focus:border-brand-accent/40 focus:ring-0"
                    />
                  </div>
                  {POS_PAYMENT_META[split.method].requiresRef && (
                    <input
                      type="text"
                      placeholder="Ref / terminal #"
                      value={split.reference ?? ""}
                      onChange={(e) =>
                        updateSplit(split.id, { reference: e.target.value })
                      }
                      className="flex-1 rounded border border-black/10 px-2 py-2 text-sm focus:border-brand-accent/40 focus:outline-none"
                    />
                  )}
                  {splits.length > 1 && (
                    <button
                      onClick={() => removeSplit(split.id)}
                      className="text-brand-smoke hover:text-red-500 transition-colors"
                    >
                      <Trash className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add another method */}
        {shortfall > 0 && (
          <button
            type="button"
            onClick={addSplit}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-black/20 py-2 text-xs text-brand-smoke hover:border-brand-accent/30 hover:text-brand-accent transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add payment method — {symbol}
            {shortfall.toLocaleString("en-NG", { minimumFractionDigits: 2 })}{" "}
            remaining
          </button>
        )}

        {/* Overpayment handling */}
        {change > 0 && (
          <div className="space-y-2 rounded-lg border border-green-500/30 bg-green-900/10 px-4 py-3">
            <div className="flex justify-between">
              <span className="text-sm text-green-300">
                Overpayment ({symbol}
                {change.toLocaleString("en-NG", { minimumFractionDigits: 2 })})
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setChangeHandling("return")}
                className={cn(
                  "rounded-md px-3 py-2 text-xs font-medium transition-all",
                  changeHandling === "return"
                    ? "border border-green-500/60 bg-green-500/10 text-green-300"
                    : "border border-black/10 text-brand-smoke hover:border-black/20",
                )}
              >
                Return change
              </button>
              <button
                type="button"
                onClick={() => setChangeHandling("keep")}
                className={cn(
                  "rounded-md px-3 py-2 text-xs font-medium transition-all",
                  changeHandling === "keep"
                    ? "border border-green-500/60 bg-green-500/10 text-green-300"
                    : "border border-black/10 text-brand-smoke hover:border-black/20",
                )}
              >
                Keep (other income)
              </button>
            </div>
            <p className="text-xs text-brand-smoke/70">
              {changeHandling === "return"
                ? saleCurrency === "NGN"
                  ? `Give ${symbol}${change.toLocaleString("en-NG", { minimumFractionDigits: 2 })} back to the customer.`
                  : `Give change back — recorded as ₦${(
                      change * (exchangeRate || 1)
                    ).toLocaleString("en-NG", { minimumFractionDigits: 2 })} equivalent.`
                : "Overpayment is retained and booked as other income."}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
