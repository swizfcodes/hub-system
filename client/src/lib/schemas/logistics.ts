// ── lib/schemas/logistics.ts ──────────────────────────────────────────────────
import { z } from "zod";

export const deliveryAddressSchema = z.object({
  line1: z.string().min(3, "Street address required"),
  area: z.string().optional().or(z.literal("")),
  city: z.string().min(1, "City required"),
  state: z.string().min(1, "State required"),
  country: z.string().optional().default("Nigeria"),
  landmark: z.string().optional().or(z.literal("")),
  recipient_name: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
});

export const createDeliverySchema = z.object({
  reference_type: z.enum(["pos_transaction", "sales_order"]),
  reference_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  delivery_address: deliveryAddressSchema,
  courier: z.enum(["relay", "chowdeck", "gigl", "manual"]),
  delivery_fee: z.number().min(0).optional().default(0),
  fee_borne_by: z
    .enum(["customer", "business", "split"])
    .optional()
    .default("customer"),
});
export type CreateDeliveryValues = z.infer<typeof createDeliverySchema>;

export const markFailedSchema = z.object({
  failure_reason: z.string().min(3, "Reason required").max(500),
});
export type MarkFailedValues = z.infer<typeof markFailedSchema>;

export const markReturnedSchema = z.object({
  notes: z.string().max(500).optional().or(z.literal("")),
});
export type MarkReturnedValues = z.infer<typeof markReturnedSchema>;

export const signatureSubmitSchema = z.object({
  customer_signature: z
    .string()
    .startsWith("data:image/png;base64,", "Draw customer signature"),
  driver_signature: z
    .string()
    .startsWith("data:image/png;base64,", "Draw driver signature"),
  customer_name: z.string().optional().or(z.literal("")),
  driver_name: z.string().optional().or(z.literal("")),
});
export type SignatureSubmitValues = z.infer<typeof signatureSubmitSchema>;
