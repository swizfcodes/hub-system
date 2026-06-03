// typedefs/loyalty.ts

export interface LoyaltyTier {
  tier_id: string;
  tier_name: string;
  min_points: number;
  max_points: number | null;
  benefits: Record<string, unknown>;
  colour: string;
  display_order: number;
}

export interface LoyaltyTransaction {
  transaction_id: string;
  transaction_type: "earned" | "redeemed" | "bonus" | "adjustment" | "expired";
  points: number;
  reference_type?: string | null;
  reference_id?: string | null;
  notes?: string | null;
  expires_at?: string | null;
  created_at: string;
}

export interface LoyaltyInfo {
  contact_id: string;
  balance: number;
  tier: LoyaltyTier | null;
  transactions?: LoyaltyTransaction[];
}
