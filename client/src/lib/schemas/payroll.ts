import { z } from "zod";

const currentYear = new Date().getFullYear();

export const initiateRunSchema = z.object({
  period_month: z.number().int().min(1).max(12),
  period_year: z
    .number()
    .int()
    .min(currentYear - 5)
    .max(currentYear + 5),
});
export type InitiateRunValues = z.infer<typeof initiateRunSchema>;

export const commissionRuleSchema = z.object({
  rule_type: z.enum(["percentage_of_sales", "fixed_per_item", "tiered"]),
  rate: z.number().min(0).max(100).optional(),
  profile_id: z.string().uuid().optional().or(z.literal("")),
  role_id: z.string().uuid().optional().or(z.literal("")),
  applicable_to: z.string().optional().default("all"),
  tiers: z
    .array(
      z.object({
        threshold: z.number().min(0),
        rate: z.number().min(0).max(100),
      }),
    )
    .optional(),
});
export type CommissionRuleValues = z.infer<typeof commissionRuleSchema>;
