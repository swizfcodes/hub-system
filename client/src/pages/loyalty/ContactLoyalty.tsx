/**
 * ContactLoyalty — standalone page AND embeddable component.
 *
 * Standalone: /loyalty/contact/:contactId
 * Embedded:   import ContactLoyaltyPanel from '@pages/loyalty/ContactLoyalty'
 *             and use <ContactLoyaltyPanel contactId={id} />
 */
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@components/ui/Skeleton";
import {
  PointsCard,
  TransactionList,
  TierBadge,
  RedeemModal,
  AwardModal,
} from "@components/loyalty/LoyaltyComponents";
import { getContactLoyalty, listTiers } from "@services/loyalty";
import { useActiveBusiness } from "@hooks/useActiveBusiness";

// ── Standalone page ───────────────────────────────────────────────────────────

export default function ContactLoyaltyPage() {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();

  if (!contactId) return null;

  return (
    <div className="px-4 sm:px-8 py-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="text-brand-smoke hover:text-brand-cream transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold text-brand-cream">
          Customer Loyalty
        </h1>
      </div>
      <ContactLoyaltyPanel contactId={contactId} />
    </div>
  );
}

// ── Embeddable panel ──────────────────────────────────────────────────────────

export function ContactLoyaltyPanel({
  contactId,
  canApprove = false,
}: {
  contactId: string;
  canApprove?: boolean;
}) {
  const { business } = useActiveBusiness();
  const [showRedeem, setShowRedeem] = useState(false);
  const [showAward, setShowAward] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["contact-loyalty", contactId],
    queryFn: () => getContactLoyalty(contactId, { limit: 30 }),
    enabled: !!contactId,
    refetchInterval: 30_000,
  });

  const { data: allTiers = [] } = useQuery({
    queryKey: ["loyalty-tiers", business],
    queryFn: listTiers,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-8 text-center rounded-2xl border border-white/5">
        <p className="text-sm text-brand-smoke">
          No loyalty data for this customer.
        </p>
      </div>
    );
  }

  const { balance, tier, transactions } = data;

  // Find next tier
  const nextTier =
    allTiers
      .filter((t) => t.min_points > balance)
      .sort((a, b) => a.min_points - b.min_points)[0] ?? null;

  const ptsToNextTier = nextTier ? nextTier.min_points - balance : null;

  return (
    <div className="space-y-4">
      {/* Points card */}
      <PointsCard
        balance={balance}
        tier={tier}
        onRedeem={() => setShowRedeem(true)}
        onAward={() => setShowAward(true)}
        canApprove={canApprove}
      />

      {/* Next tier nudge */}
      {ptsToNextTier !== null && nextTier && (
        <div className="rounded-xl border border-brand-accent/15 bg-brand-accent/5 px-4 py-3 text-sm">
          <span className="text-brand-smoke">
            {ptsToNextTier.toLocaleString()} more points to reach{" "}
          </span>
          <TierBadge tier={nextTier} size="xs" />
        </div>
      )}

      {/* Benefits */}
      {tier && Object.keys(tier.benefits ?? {}).length > 0 && (
        <div className="rounded-xl border border-white/5 bg-brand-charcoal px-4 py-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
            Current Benefits
          </p>
          <div className="space-y-1">
            {Object.entries(tier.benefits).map(([key, val]) => (
              <div
                key={key}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-brand-cloud capitalize">
                  {key.replace(/_/g, " ")}
                </span>
                <span className="text-brand-cream font-medium">
                  {typeof val === "boolean" ? (val ? "✓" : "✗") : String(val)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction history */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-smoke">
          Transaction History
        </p>
        <TransactionList transactions={transactions} />
      </div>

      {/* Modals */}
      <RedeemModal
        open={showRedeem}
        onClose={() => setShowRedeem(false)}
        contactId={contactId}
        balance={balance}
      />
      <AwardModal
        open={showAward}
        onClose={() => setShowAward(false)}
        contactId={contactId}
      />
    </div>
  );
}
