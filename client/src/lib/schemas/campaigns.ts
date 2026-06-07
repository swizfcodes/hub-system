import { z } from "zod";

// ── Audience filter — nested shape consumed by the backend compiler ───────────
// include.*  → positive criteria (who to include)
// exclude.*  → negative criteria (who to exclude)
// channel_requirements → require email / whatsapp / either ("auto")
export const audienceFilterSchema = z.object({
  include: z
    .object({
      contact_type:          z.array(z.string()).optional(),
      priority_level:        z.array(z.string()).optional(),
      tag_names:             z.array(z.string()).optional(),
      purchased_within_days: z.number().int().min(0).optional(),
      min_lifetime_spend:    z.number().min(0).optional(),
      birthday_within_days:  z.number().int().min(0).optional(),
      category_ids:          z.array(z.string()).optional(),
    })
    .optional()
    .default({}),
  exclude: z
    .object({
      unsubscribed: z.boolean().optional(),
    })
    .optional()
    .default({}),
  channel_requirements: z
    .enum(["email", "whatsapp", "auto"])
    .optional()
    .default("auto"),
}).default({
  include: {},
  exclude: { unsubscribed: true },
  channel_requirements: "auto",
});

export const createCampaignSchema = z.object({
  campaign_name: z.string().min(1, "Campaign name required").max(200),
  campaign_type: z.enum(["email", "whatsapp"]),
  subject_line:  z.string().max(200).optional().or(z.literal("")),
  from_name:     z.string().max(100).optional().or(z.literal("")),
  html_content:  z.string().min(1, "Content required"),
  audience_filter: audienceFilterSchema,
});
export type CreateCampaignValues = z.infer<typeof createCampaignSchema>;

export const scheduleCampaignSchema = z.object({
  scheduled_at: z.string().min(1, "Schedule date required"),
});
export type ScheduleCampaignValues = z.infer<typeof scheduleCampaignSchema>;

export const saveSegmentSchema = z.object({
  name: z.string().min(1, "Segment name required").max(100),
  description: z.string().max(500).optional().or(z.literal("")),
  filter: audienceFilterSchema,
});
export type SaveSegmentValues = z.infer<typeof saveSegmentSchema>;
