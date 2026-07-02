// ── CustomerPanel.tsx ──────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { Star, UserPlus } from "lucide-react";
import { usePOSStore } from "@stores/posStore";
import { ContactSearchInput } from "@components/shared/ContactSearchInput";
import { getLoyaltyInfo } from "@services/pos/transactions";
import { getOrCreateWalkInCustomer } from "@services/contacts/contacts";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { fmtMoney } from "@lib/format";

interface CustomerPanelProps {
  currency?: string;
}

export function CustomerPanel({ currency = "NGN" }: CustomerPanelProps) {
  const { customer, loyaltyInfo, setCustomer, setLoyaltyInfo } = usePOSStore(
    (s) => ({
      customer: s.customer,
      loyaltyInfo: s.loyaltyInfo,
      setCustomer: s.setCustomer,
      setLoyaltyInfo: s.setLoyaltyInfo,
    }),
  );

  const [walkinLoading, setWalkinLoading] = useState(false);

  useEffect(() => {
    if (!customer) {
      setLoyaltyInfo(null);
      return;
    }
    getLoyaltyInfo(customer.contact_id).then(setLoyaltyInfo);
  }, [customer?.contact_id]);

  async function useWalkIn() {
    setWalkinLoading(true);
    try {
      const walkin = await getOrCreateWalkInCustomer();
      setCustomer(walkin);
    } catch (err) {
      showToast.error("Could not set walk-in customer", errMsg(err));
    } finally {
      setWalkinLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ContactSearchInput
        value={customer}
        onChange={setCustomer}
        label="Customer"
        required
      />

      {/* Walk-in fallback — attaches the reusable "Walk-in Customer" contact so
          anonymous sales still carry a name and can check out. */}
      {!customer && (
        <button
          type="button"
          onClick={useWalkIn}
          disabled={walkinLoading}
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 py-2 text-xs text-brand-smoke hover:border-brand-accent/40 hover:text-brand-accent transition-colors disabled:opacity-50"
        >
          <UserPlus className="h-3.5 w-3.5" />
          {walkinLoading ? "Setting walk-in…" : "Use walk-in customer"}
        </button>
      )}

      {/* Loyalty info */}
      {customer && loyaltyInfo && (
        <div
          className="rounded-lg border px-3 py-2.5 flex items-center gap-3"
          style={{
            borderColor: loyaltyInfo.tier
              ? `${loyaltyInfo.tier.colour}40`
              : "rgba(255,255,255,0.05)",
            backgroundColor: loyaltyInfo.tier
              ? `${loyaltyInfo.tier.colour}08`
              : "transparent",
          }}
        >
          <Star
            className="h-4 w-4 shrink-0"
            style={{ color: loyaltyInfo.tier?.colour ?? "#6B7280" }}
          />
          <div className="min-w-0">
            <p
              className="text-xs font-medium"
              style={{ color: loyaltyInfo.tier?.colour ?? "#9E9891" }}
            >
              {loyaltyInfo.tier?.tier_name ?? "No Tier"}
            </p>
            <p className="text-xs text-brand-smoke">
              {loyaltyInfo.balance.toLocaleString()} points
            </p>
          </div>
          {loyaltyInfo.balance > 0 && (
            <span className="ml-auto text-xs text-brand-smoke">
              ≈ {fmtMoney(loyaltyInfo.balance, currency)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
