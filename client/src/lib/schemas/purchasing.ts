import { z } from "zod";

// ── Supplier ──
export const supplierInviteSchema = z.object({
  // Either link existing contact OR create new
  contact_id: z.string().uuid().optional().or(z.literal("")),
  // New-contact fields:
  display_name: z.string().max(120).optional().or(z.literal("")),
  company_name: z.string().max(120).optional().or(z.literal("")),
  email: z.string().email("Invalid email"),
  primary_phone: z
    .string()
    .regex(/^[+0-9()\-\s]{6,20}$/)
    .optional()
    .or(z.literal("")),
  whatsapp_number: z
    .string()
    .regex(/^[+0-9()\-\s]{6,20}$/)
    .optional()
    .or(z.literal("")),
  // Supplier-specific:
  payment_terms_days: z.number().int().min(0).max(180).default(30),
  preferred_currency: z.string().length(3).default("USD"),
  lead_time_days: z.number().int().min(0).optional(),
  notes: z.string().max(500).optional().or(z.literal("")),
});
export type SupplierInviteValues = z.infer<typeof supplierInviteSchema>;

// ── RFQ ──
export const rfqLineSchema = z.object({
  product_id: z.string().uuid().optional().or(z.literal("")),
  description: z.string().min(1, "Required").max(300),
  quantity_needed: z.number().int().min(1, "At least 1"),
  target_price: z.number().min(0).optional(),
  notes: z.string().max(500).optional().or(z.literal("")),
});
export type RFQLineValues = z.infer<typeof rfqLineSchema>;

export const rfqCreateSchema = z.object({
  title: z.string().min(1, "Required").max(180),
  response_deadline: z.string().optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  invited_supplier_ids: z
    .array(z.string().uuid())
    .min(1, "Pick at least one supplier"),
  lines: z.array(rfqLineSchema).min(1, "Add at least one line item"),
});
export type RFQCreateValues = z.infer<typeof rfqCreateSchema>;

// ── Supplier quote (submitted via the public portal) ──
export const quoteSubmissionSchema = z.object({
  token: z.string().min(1, "Portal token required"),
  responses: z
    .array(
      z.object({
        rfq_line_id: z.string().uuid(),
        unit_price: z.number().min(0),
        currency: z.string().length(3),
        lead_time_days: z.number().int().min(0).optional(),
        valid_until: z.string().optional().or(z.literal("")),
        notes: z.string().max(500).optional().or(z.literal("")),
      }),
    )
    .min(1),
});
export type QuoteSubmissionValues = z.infer<typeof quoteSubmissionSchema>;

// ── Purchase Order ──
export const poLineSchema = z.object({
  product_id: z.string().uuid().optional().or(z.literal("")),
  quantity_ordered: z.number().int().min(1),
  unit_price: z.number().min(0),
  description: z.string().max(300).optional().or(z.literal("")),
});
export type POLineValues = z.infer<typeof poLineSchema>;

export const poCreateSchema = z.object({
  supplier_id: z.string().uuid("Pick a supplier"),
  rfq_id: z.string().uuid().optional().or(z.literal("")),
  expected_delivery: z.string().optional().or(z.literal("")),
  delivery_address: z.string().max(500).optional().or(z.literal("")),
  shipping_cost: z.number().min(0).default(0),
  import_duty: z.number().min(0).default(0),
  other_charges: z.number().min(0).default(0),
  currency: z.string().length(3).default("USD"),
  exchange_rate: z.preprocess(
    (v) => (v === "" || (typeof v === "number" && Number.isNaN(v)) ? undefined : v),
    z.number().min(0).optional(),
  ),
  notes: z.string().max(2000).optional().or(z.literal("")),
  lines: z.array(poLineSchema).min(1, "Add at least one product"),
});
export type POCreateValues = z.infer<typeof poCreateSchema>;

// ── Goods Receipt ──
export const grLineSchema = z
  .object({
    po_line_id: z.string().uuid(),
    quantity_received: z.number().int().min(0),
    quantity_accepted: z.number().int().min(0),
    quantity_rejected: z.number().int().min(0).default(0),
    rejection_reason: z.string().optional().or(z.literal("")),
  })
  .refine(
    (v) => v.quantity_accepted + v.quantity_rejected === v.quantity_received,
    {
      message: "Accepted + rejected must equal received",
      path: ["quantity_received"],
    },
  )
  .refine(
    (v) =>
      v.quantity_rejected === 0 ||
      (v.rejection_reason && v.rejection_reason.trim().length > 0),
    {
      message: "Add a reason when rejecting goods",
      path: ["rejection_reason"],
    },
  );
export type GRLineValues = z.infer<typeof grLineSchema>;

export const grnSchema = z.object({
  receiving_location_id: z.string().uuid().optional().or(z.literal("")),
  notes: z.string().max(1000).optional().or(z.literal("")),
  lines: z.array(grLineSchema).min(1),
});
export type GRNValues = z.infer<typeof grnSchema>;

// ── Supplier Bill ──
export const billCreateSchema = z.object({
  supplier_id: z.string().uuid(),
  po_id: z.string().uuid().optional().or(z.literal("")),
  supplier_invoice_number: z.string().min(1).max(60),
  invoice_date: z.string().min(1),
  due_date: z.string().min(1),
  amount: z.number().min(0),
  currency: z.string().length(3),
  notes: z.string().max(1000).optional().or(z.literal("")),
});
export type BillCreateValues = z.infer<typeof billCreateSchema>;
