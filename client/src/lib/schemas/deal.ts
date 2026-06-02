import { z } from "zod";

export const dealCreateSchema = z.object({
  contact_id: z.string().uuid("Pick a contact"),
  title: z.string().min(1, "Required").max(180),
  stage: z.string().min(1, "Required"),
  expected_value: z.number().min(0).optional(),
  probability: z.number().int().min(0).max(100).default(50),
  expected_close_date: z.string().optional().or(z.literal("")),
  source: z.string().optional().or(z.literal("")),
  assigned_to: z.string().uuid().optional().or(z.literal("")),
});
export type DealCreateValues = z.infer<typeof dealCreateSchema>;

export const dealPatchSchema = z.object({
  title: z.string().min(1).max(180).optional(),
  expected_value: z.number().min(0).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expected_close_date: z.string().optional().or(z.literal("")),
  source: z.string().optional().or(z.literal("")),
  assigned_to: z.string().uuid().optional().or(z.literal("")),
  lost_reason: z.string().max(280).optional().or(z.literal("")),
});
export type DealPatchValues = z.infer<typeof dealPatchSchema>;

export const ACTIVITY_TYPES = [
  "call",
  "message",
  "email",
  "store_visit",
  "quotation_sent",
  "invoice_sent",
  "payment_received",
  "note",
  "stage_change",
] as const;

export const logActivitySchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES),
  summary: z.string().min(1, "Add a brief summary").max(500),
  direction: z.enum(["inbound", "outbound"]).optional(),
});
export type LogActivityValues = z.infer<typeof logActivitySchema>;

export const dealNoteSchema = z.object({
  content: z.string().min(1, "Required").max(2000),
  is_pinned: z.boolean().default(false),
});
export type DealNoteValues = z.infer<typeof dealNoteSchema>;
