// ── services/loyalty/loyalty.ts ───────────────────────────────────────────────
// API wrappers for the Loyalty module — tiers, leaderboard, per-contact
// balances, manual award and redemption.

import { api } from "@services/api";
import type {
  LoyaltyTier,
  ContactLoyalty,
  LoyaltyLeaderRow,
  LoyaltyStats,
} from "@typedefs/loyalty";
import type {
  CreateTierValues,
  AwardPointsValues,
  RedeemPointsValues,
} from "@lib/constants/loyaltyConstants";

// ── Tiers ─────────────────────────────────────────────────────────────────────
export async function listTiers(): Promise<LoyaltyTier[]> {
  try {
    const { data } = await api.get<{ data: LoyaltyTier[] }>("/loyalty/tiers");
    return data.data ?? [];
  } catch {
    return [];
  }
}

export async function createTier(
  values: CreateTierValues,
): Promise<LoyaltyTier> {
  const { data } = await api.post<LoyaltyTier>("/loyalty/tiers", values);
  return data;
}

export async function updateTier(
  id: string,
  values: Partial<CreateTierValues>,
): Promise<LoyaltyTier> {
  const { data } = await api.patch<LoyaltyTier>(`/loyalty/tiers/${id}`, values);
  return data;
}

export async function deleteTier(id: string): Promise<void> {
  await api.delete(`/loyalty/tiers/${id}`);
}

export async function reorderTiers(
  tiers: Array<{ tier_id: string; display_order: number }>,
): Promise<void> {
  await api.post("/loyalty/tiers/reorder", {
    order: tiers.map((t) => ({
      tier_id: t.tier_id,
      position: t.display_order,
    })),
  });
}

// ── Stats & leaderboard ───────────────────────────────────────────────────────
export async function getLoyaltyStats(): Promise<LoyaltyStats | null> {
  try {
    const { data } = await api.get<LoyaltyStats>("/loyalty/stats");
    return data;
  } catch {
    return null;
  }
}

export async function getLeaderboard(limit = 20): Promise<LoyaltyLeaderRow[]> {
  try {
    const { data } = await api.get<{ data: LoyaltyLeaderRow[] }>(
      "/loyalty/leaderboard",
      {
        params: { limit },
      },
    );
    return data.data ?? [];
  } catch {
    return [];
  }
}

// ── Per-contact ───────────────────────────────────────────────────────────────
export async function getContactLoyalty(
  contactId: string,
  params: { limit?: number } = {},
): Promise<ContactLoyalty | null> {
  try {
    const { data } = await api.get<ContactLoyalty>(
      `/loyalty/contact/${contactId}`,
      { params },
    );
    return data;
  } catch {
    return null;
  }
}

export async function manualAward(
  contactId: string,
  values: AwardPointsValues,
) {
  const { data } = await api.post(
    `/loyalty/contact/${contactId}/award`,
    values,
  );
  return data;
}

export async function redeemPoints(
  contactId: string,
  values: RedeemPointsValues,
) {
  const { data } = await api.post(
    `/loyalty/contact/${contactId}/redeem`,
    values,
  );
  return data;
}
