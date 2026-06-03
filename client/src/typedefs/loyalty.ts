export type TransactionType =
  | "earned"
  | "redeemed"
  | "bonus"
  | "adjustment"
  | "expired";

export interface LoyaltyTier {
  tier_id: string;
  tier_name: string;
  min_points: number;
  max_points: number | null;
  benefits: Record<string, unknown>;
  colour: string;
  display_order: number;
  updated_at?: string;
}

export interface LoyaltyTransaction {
  transaction_id: string;
  transaction_type: TransactionType;
  points: number;
  reference_type?: string | null;
  reference_id?: string | null;
  notes?: string | null;
  expires_at?: string | null;
  created_at: string;
}

export interface ContactLoyalty {
  contact_id: string;
  balance: number;
  tier: LoyaltyTier | null;
  transactions: LoyaltyTransaction[];
}

export interface LoyaltyLeaderRow {
  contact_id: string;
  display_name: string;
  primary_phone?: string | null;
  priority_level: string;
  balance: number;
}

export interface TierDistribution {
  tier_id: string;
  tier_name: string;
  colour: string;
  member_count: number;
}

export interface LoyaltyStats {
  total_issued: number;
  total_redeemed: number;
  active_contacts: number;
  tier_distribution: TierDistribution[];
  config: LoyaltyConfig;
}

export interface LoyaltyConfig {
  points_per_naira?: number;
  expiry_months?: number;
  notify_on_tier_upgrade?: boolean;
  tier_display_in_receipt?: boolean;
}

// ── LoyaltyInfo ───────────────────────────────────────────────────────────────
// Compact loyalty summary used by the POS customer panel.
export interface LoyaltyInfo {
  contact_id: string;
  balance: number;
  tier: LoyaltyTier | null;
  transactions?: LoyaltyTransaction[];
}
