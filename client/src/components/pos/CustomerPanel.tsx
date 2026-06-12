// ── CustomerPanel.tsx ──────────────────────────────────────────────────────────
import { useEffect } from "react";
import { Star } from "lucide-react";
import { usePOSStore } from "@stores/posStore";
import { ContactSearchInput } from "@components/shared/ContactSearchInput";
import { getLoyaltyInfo } from "@services/pos/transactions";
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

  useEffect(() => {
    if (!customer) {
      setLoyaltyInfo(null);
      return;
    }
    getLoyaltyInfo(customer.contact_id).then(setLoyaltyInfo);
  }, [customer?.contact_id]);

  return (
    <div className="flex flex-col gap-3">
      <ContactSearchInput
        value={customer}
        onChange={setCustomer}
        label="Customer"
        required
      />

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
