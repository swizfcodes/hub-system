import { z } from "zod";
import type { TransactionType } from "@typedefs/loyalty";

export const TRANSACTION_TYPE_META: Record<
  TransactionType,
  {
    label: string;
    sign: "+" | "-" | "±";
    color: string;
    bgColor: string;
  }
> = {
  earned: {
    label: "Earned",
    sign: "+",
    color: "#2D9CDB",
    bgColor: "#2D9CDB15",
  },
  bonus: { label: "Bonus", sign: "+", color: "#C9A86C", bgColor: "#C9A86C15" },
  adjustment: {
    label: "Adjustment",
    sign: "±",
    color: "#9E9891",
    bgColor: "#9E989115",
  },
  redeemed: {
    label: "Redeemed",
    sign: "-",
    color: "#F97316",
    bgColor: "#F9731615",
  },
  expired: {
    label: "Expired",
    sign: "-",
    color: "#EF4444",
    bgColor: "#EF444415",
  },
};

export const DEFAULT_TIER_COLOURS = [
  "#B87333", // Bronze
  "#A8A9AD", // Silver
  "#C9A86C", // Gold
  "#E5E4E2", // Platinum
  "#B9F2FF", // Diamond
];

export const createTierSchema = z.object({
  tier_name: z.string().min(1, "Name required").max(80),
  min_points: z.number({ required_error: "Min points required" }).int().min(0),
  max_points: z.number().int().nullable().optional(),
  colour: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex colour")
    .default("#64748B"),
  display_order: z.number().int().min(0).optional().default(0),
  benefits: z.record(z.unknown()).optional().default({}),
});
export type CreateTierValues = z.infer<typeof createTierSchema>;

export const awardPointsSchema = z.object({
  points: z
    .number()
    .int()
    .refine((v) => v !== 0, "Points cannot be zero"),
  transaction_type: z.enum(["bonus", "adjustment"]),
  notes: z.string().max(500).optional().or(z.literal("")),
});
export type AwardPointsValues = z.infer<typeof awardPointsSchema>;

export const redeemPointsSchema = z.object({
  points: z
    .number({ required_error: "Points required" })
    .int()
    .positive("Points must be positive"),
  reference_type: z.string().optional().default("manual"),
});
export type RedeemPointsValues = z.infer<typeof redeemPointsSchema>;
