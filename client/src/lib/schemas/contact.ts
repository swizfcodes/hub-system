import { z } from "zod";

export const CONTACT_TYPES = [
  "customer",
  "supplier",
  "staff",
  "retail_partner",
] as const;
export const PRIORITY_LEVELS = ["vip", "regular", "new"] as const;
export const CONTACT_SOURCES = [
  "walk_in",
  "social_media",
  "referral",
  "website",
  "event",
] as const;

const phoneRegex = /^[+0-9()\-\s]{6,20}$/;

// ── Quick-add: the 10-second capture path ──
export const quickAddSchema = z.object({
  display_name: z.string().min(1, "Required").max(120),
  contact_type: z.array(z.enum(CONTACT_TYPES)).min(1, "Pick at least one type"),
  primary_phone: z.string().regex(phoneRegex, "Looks like an invalid phone"),
  whatsapp_number: z.string().regex(phoneRegex).optional().or(z.literal("")),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  visible_to: z.array(z.string()).min(1, "Pick at least one business"),
  priority_level: z.enum(PRIORITY_LEVELS).default("regular"),
  // The "How they found us" select has an empty placeholder option, so an
  // untouched optional field submits "" — which a bare .optional() enum
  // rejects and silently blocks save. Accept "" and strip it in the payload.
  source: z.enum(CONTACT_SOURCES).optional().or(z.literal("")),
  birthday_month: z.coerce.number().int().min(1).max(12).optional().or(z.literal("")),
  birthday_day: z.coerce.number().int().min(1).max(31).optional().or(z.literal("")),
});
export type QuickAddValues = z.infer<typeof quickAddSchema>;

// ── Full create / edit ──
export const contactPatchSchema = z.object({
  display_name: z.string().min(1).max(120),
  first_name: z.string().max(80).optional().or(z.literal("")),
  last_name: z.string().max(80).optional().or(z.literal("")),
  company_name: z.string().max(120).optional().or(z.literal("")),
  primary_phone: z.string().regex(phoneRegex),
  whatsapp_number: z.string().regex(phoneRegex).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  priority_level: z.enum(PRIORITY_LEVELS),
  source: z.enum(CONTACT_SOURCES).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  birthday_month: z.coerce.number().int().min(1).max(12).optional().or(z.literal("")),
  birthday_day: z.coerce.number().int().min(1).max(31).optional().or(z.literal("")),
});
export type ContactPatchValues = z.infer<typeof contactPatchSchema>;

// ── Address modal ──
export const addressSchema = z.object({
  address_type: z
    .enum(["delivery", "billing", "office", "home", "other"])
    .default("delivery"),
  line1: z.string().min(1, "Required"),
  line2: z.string().optional().or(z.literal("")),
  area: z.string().optional().or(z.literal("")),
  city: z.string().min(1, "Required"),
  state: z.string().min(1, "Required"),
  country: z.string().default("Nigeria"),
  landmark: z.string().optional().or(z.literal("")),
  recipient_name: z.string().optional().or(z.literal("")),
  recipient_phone: z.string().regex(phoneRegex).optional().or(z.literal("")),
  is_default: z.boolean().default(false),
});
export type AddressValues = z.infer<typeof addressSchema>;
