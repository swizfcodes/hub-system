import { z } from 'zod';

export const audienceFilterSchema = z.object({
  contact_type:         z.array(z.string()).optional(),
  priority_level:       z.string().optional().or(z.literal('')),
  tags:                 z.array(z.string()).optional(),
  has_whatsapp:         z.boolean().optional(),
  has_email:            z.boolean().optional(),
  exclude_unsubscribed: z.boolean().optional().default(true),
  last_purchase_days:   z.number().int().min(0).optional(),
});

export const createCampaignSchema = z.object({
  campaign_name: z.string().min(1, 'Campaign name required').max(200),
  campaign_type: z.enum(['email', 'whatsapp']),
  subject_line:  z.string().max(200).optional().or(z.literal('')),
  from_name:     z.string().max(100).optional().or(z.literal('')),
  html_content:  z.string().min(1, 'Content required'),
  audience_filter: audienceFilterSchema.optional().default({}),
});
export type CreateCampaignValues = z.infer<typeof createCampaignSchema>;

export const scheduleCampaignSchema = z.object({
  scheduled_at: z.string().min(1, 'Schedule date required'),
});
export type ScheduleCampaignValues = z.infer<typeof scheduleCampaignSchema>;

export const saveSegmentSchema = z.object({
  name:        z.string().min(1, 'Segment name required').max(100),
  description: z.string().max(500).optional().or(z.literal('')),
  filter:      audienceFilterSchema,
});
export type SaveSegmentValues = z.infer<typeof saveSegmentSchema>;
