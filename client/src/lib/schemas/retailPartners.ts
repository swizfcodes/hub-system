// ── lib/schemas/retailPartners.ts ─────────────────────────────────────────────
import { z } from "zod";

export const createPartnerSchema = z.object({
  contact_id: z.string().uuid("Select a contact"),
  partner_code: z
    .string()
    .min(2, "Code required")
    .max(20)
    .regex(/^[A-Z0-9_-]+$/, "Uppercase letters, numbers, dashes only"),
  arrangement_type: z.enum(["consignment", "wholesale", "both"]),
  consignment_margin_pct: z.number().min(0).max(100).optional().default(0),
  wholesale_discount_pct: z.number().min(0).max(100).optional().default(0),
  payment_terms_days: z.number().int().min(0).optional().default(30),
  settlement_cycle: z
    .enum(["weekly", "biweekly", "monthly"])
    .optional()
    .default("monthly"),
  credit_limit: z.number().min(0).optional().default(0),
  notes: z.string().max(1000).optional().or(z.literal("")),
});
export type CreatePartnerValues = z.infer<typeof createPartnerSchema>;

export const consignmentItemSchema = z.object({
  product_id: z.string().uuid("Select a product"),
  quantity: z.number().int().min(1, "Min 1"),
  agreed_price: z.number().min(0.01, "Price required"),
});

export const sendConsignmentSchema = z.object({
  from_location_id: z.string().uuid("Select a source location"),
  sent_date: z.string().optional(),
  items: z.array(consignmentItemSchema).min(1, "Add at least one item"),
});
export type SendConsignmentValues = z.infer<typeof sendConsignmentSchema>;

export const recallSchema = z.object({
  return_to_location_id: z.string().uuid("Select return location"),
  quantity: z.number().int().min(1).optional(),
});
export type RecallValues = z.infer<typeof recallSchema>;

export const reportSaleSchema = z.object({
  consignment_id: z.string().uuid("Select a consignment line"),
  quantity_sold: z.number().int().min(1, "Min 1"),
  sale_price: z.number().min(0.01, "Sale price required"),
  sale_date: z.string().min(1, "Date required"),
  notes: z.string().optional().or(z.literal("")),
});
export type ReportSaleValues = z.infer<typeof reportSaleSchema>;

export const generateSettlementSchema = z.object({
  period_start: z.string().min(1, "Start date required"),
  period_end: z.string().min(1, "End date required"),
});
export type GenerateSettlementValues = z.infer<typeof generateSettlementSchema>;

export const wholesaleItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1),
  unit_price: z.number().min(0.01),
});

export const wholesaleDispatchSchema = z.object({
  from_location_id: z.string().uuid("Select source location"),
  items: z.array(wholesaleItemSchema).min(1),
});
export type WholesaleDispatchValues = z.infer<typeof wholesaleDispatchSchema>;
