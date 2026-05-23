// ── PaymentSheet.tsx ───────────────────────────────────────────────────────────
import { useState } from 'react';
import { Plus, Trash2 as Trash } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { Modal } from '@components/ui/Modal';
import { Button } from '@components/ui/Button';
import { usePOSStore } from '@stores/posStore';
import { POS_PAYMENT_META } from '@lib/constants/posConstants';
import { fmtMoney as fmtMoneyPS } from '@lib/format';
import { cn } from '@lib/cn';
import type { PaymentSplitInput, CartTotals, POSPaymentMethod } from '@typedefs/pos';

interface PaymentSheetProps {
  open:        boolean;
  onClose:     () => void;
  totals:      CartTotals;
  currency?:   string;
  onConfirm:   (payments: PaymentSplitInput[]) => void;
  isLoading?:  boolean;
}

export function PaymentSheet({
  open,
  onClose,
  totals,
  currency = 'NGN',
  onConfirm,
  isLoading = false,
}: PaymentSheetProps) {
  const { loyaltyInfo, customer } = usePOSStore((s) => ({
    loyaltyInfo: s.loyaltyInfo,
    customer:    s.customer,
  }));

  const [splits, setSplits] = useState<PaymentSplitInput[]>([
    { id: uuid(), method: 'cash', amount: totals.total },
  ]);

  const totalPaid = splits.reduce((s, p) => s + (p.amount || 0), 0);
  const change    = Math.max(0, totalPaid - totals.total);
  const shortfall = Math.max(0, totals.total - totalPaid);
  const isReady   = totalPaid >= totals.total;

  function addSplit() {
    setSplits([...splits, { id: uuid(), method: 'bank_transfer', amount: shortfall }]);
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
              Change: {fmtMoneyPS(change, currency)}
            </span>
          )}
          <div className="flex gap-3 ml-auto">
            <Button variant="ghost" onClick={onClose} disabled={isLoading}>
              Back
            </Button>
            <Button
              onClick={() => isReady && onConfirm(splits)}
              disabled={!isReady || isLoading}
              loading={isLoading}
            >
              Confirm {fmtMoneyPS(totals.total, currency)}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Total due */}
        <div className="rounded-lg bg-orika-graphite/40 px-4 py-3 flex justify-between items-center">
          <span className="text-sm text-orika-smoke">Total Due</span>
          <span className="font-display text-xl font-extrabold text-orika-gold">
            {fmtMoneyPS(totals.total, currency)}
          </span>
        </div>

        {/* Loyalty redemption hint */}
        {loyaltyInfo && loyaltyInfo.balance > 0 && customer && (
          <div className="rounded-lg border border-white/5 bg-orika-graphite/20 px-3 py-2 text-xs text-orika-smoke">
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
                <div className="grid grid-cols-4 gap-1.5">
                  {(Object.keys(POS_PAYMENT_META) as POSPaymentMethod[]).map((method) => {
                    const m = POS_PAYMENT_META[method];
                    const M = m.icon;
                    return (
                      <button
                        key={method}
                        type="button"
                        onClick={() => updateSplit(split.id, { method })}
                        className={cn(
                          'flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-center transition-all',
                          split.method === method
                            ? 'border-orika-gold/60 bg-orika-gold/5 text-orika-gold'
                            : 'border-black/10 text-orika-smoke hover:border-black/20',
                        )}
                      >
                        <M className="h-4 w-4" />
                        <span className="text-[9px] leading-tight">{m.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Amount + optional ref */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-orika-smoke">₦</span>
                    <input
                      type="number"
                      step="0.01"
                      value={split.amount}
                      onChange={(e) => updateSplit(split.id, { amount: parseFloat(e.target.value) || 0 })}
                      className="w-full rounded border border-black/10 py-2 pl-5 pr-2 text-right text-sm text-orika-black tabular-nums focus:border-orika-gold/40 focus:outline-none"
                    />
                  </div>
                  {POS_PAYMENT_META[split.method].requiresRef && (
                    <input
                      type="text"
                      placeholder="Ref / terminal #"
                      value={split.reference ?? ''}
                      onChange={(e) => updateSplit(split.id, { reference: e.target.value })}
                      className="flex-1 rounded border border-black/10 px-2 py-2 text-sm focus:border-orika-gold/40 focus:outline-none"
                    />
                  )}
                  {splits.length > 1 && (
                    <button
                      onClick={() => removeSplit(split.id)}
                      className="text-orika-smoke hover:text-red-500 transition-colors"
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
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-black/20 py-2 text-xs text-orika-smoke hover:border-orika-gold/30 hover:text-orika-gold transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add payment method — {fmtMoneyPS(shortfall, currency)} remaining
          </button>
        )}

        {/* Cash change */}
        {change > 0 && (
          <div className="rounded-lg border border-green-500/30 bg-green-900/10 px-4 py-3 flex justify-between">
            <span className="text-sm text-green-300">Give change</span>
            <span className="font-semibold text-green-300">{fmtMoneyPS(change, currency)}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}