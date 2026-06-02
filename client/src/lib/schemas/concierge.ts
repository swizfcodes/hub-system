import { z } from "zod";

export const preferenceSchema = z.object({
  preference_key: z
    .string()
    .min(1, "Required")
    .max(60)
    .regex(/^[a-z0-9_]+$/, "Lowercase, digits, underscores only"),
  preference_value: z.string().min(1, "Required").max(280),
  notes: z.string().max(500).optional().or(z.literal("")),
});
export type PreferenceValues = z.infer<typeof preferenceSchema>;

export const MILESTONE_TYPES = [
  "birthday",
  "wedding_anniversary",
  "business_anniversary",
  "graduation",
  "other",
] as const;

export const milestoneSchema = z.object({
  milestone_type: z.enum(MILESTONE_TYPES),
  milestone_date: z.string().min(1, "Required"),
  notes: z.string().max(500).optional().or(z.literal("")),
});
export type MilestoneValues = z.infer<typeof milestoneSchema>;
