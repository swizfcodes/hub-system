import { z } from "zod";

// All schemas use stable input=output types — no .default() mid-schema.
// Defaults live in useForm's defaultValues to avoid input/output drift.

// ── Quote line ────────────────────────────────────────────────────────────────

export const quoteLineSchema = z.object({
  product_id: z.string().uuid("Select a product"),
  description: z.string().min(1, "Description required").max(300),
  // coerce: HTML inputs and pg NUMERIC columns both return strings; coerce
  // normalises them to numbers before Zod validates, eliminating the
  // "Expected number, received string" error on form submission.
  quantity: z.coerce.number().int().min(1, "At least 1"),
  unit_price: z.coerce.number().min(0, "Price must be 0 or more"),
  discount_pct: z.coerce.number().min(0).max(100),
});
export type QuoteLineValues = z.infer<typeof quoteLineSchema>;

// ── Create quotation ──────────────────────────────────────────────────────────

export const createQuotationSchema = z.object({
  contact_id: z.string().uuid("Select a customer"),
  deal_id: z.string().uuid().optional().or(z.literal("")),
  assigned_to: z.string().uuid().optional().or(z.literal("")),
  valid_until: z.string().min(1, "Expiry date required"),
  payment_terms: z.string().max(500).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  terms_conditions: z.string().max(5000).optional().or(z.literal("")),
  // Order-level discount
  order_discount_type: z.enum(["percentage", "fixed"]).optional(),
  order_discount_value: z.number().min(0).optional(),
  // VAT — omitting or true applies the business VAT rate; false = zero-rated
  apply_vat: z.boolean().optional(),
  lines: z.array(quoteLineSchema).min(1, "Add at least one line item"),
});
export type CreateQuotationValues = z.infer<typeof createQuotationSchema>;

// ── Update quotation (draft only — limited fields) ────────────────────────────

export const updateQuotationSchema = z.object({
  valid_until: z.string().min(1).optional(),
  payment_terms: z.string().max(500).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
  terms_conditions: z.string().max(5000).optional().or(z.literal("")),
});
export type UpdateQuotationValues = z.infer<typeof updateQuotationSchema>;

// ── Send quotation ────────────────────────────────────────────────────────────

export const sendQuotationSchema = z.object({
  channel: z.enum(["email", "whatsapp"]),
});
export type SendQuotationValues = z.infer<typeof sendQuotationSchema>;

// ── Confirm quotation to order ────────────────────────────────────────────────

export const confirmQuotationSchema = z.object({
  fulfilment_type: z.enum(["walk_in", "delivery"]),
  // Delivery address — required when fulfilment_type = 'delivery'
  delivery_address: z.string().max(500).optional().or(z.literal("")),
  delivery_notes: z.string().max(500).optional().or(z.literal("")),
});
export type ConfirmQuotationValues = z.infer<typeof confirmQuotationSchema>;

// ── Record payment ────────────────────────────────────────────────────────────

export const recordPaymentSchema = z.object({
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  payment_method: z.enum([
    "bank_transfer",
    "pos_card",
    "cash",
    "paystack",
    "stripe",
  ]),
  payment_date: z.string().optional().or(z.literal("")),
  reference: z.string().max(200).optional().or(z.literal("")),
  paystack_reference: z.string().max(200).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
});
export type RecordPaymentValues = z.infer<typeof recordPaymentSchema>;

// ── Hand to logistics ─────────────────────────────────────────────────────────

export const handToLogisticsSchema = z.object({
  delivery_address: z.string().min(5, "Enter a delivery address"),
  delivery_notes: z.string().max(500).optional().or(z.literal("")),
  courier_preference: z.enum(["chowdeck", "gigl", "manual"]),
  contact_phone: z.string().min(7, "Phone number required"),
});
export type HandToLogisticsValues = z.infer<typeof handToLogisticsSchema>;

// ── Discount approval review ──────────────────────────────────────────────────

export const discountApprovalSchema = z.object({
  notes: z.string().max(500).optional().or(z.literal("")),
});
export type DiscountApprovalValues = z.infer<typeof discountApprovalSchema>;

// ── Generate invoice from order ───────────────────────────────────────────────

export const generateInvoiceSchema = z.object({
  due_date: z.string().min(1, "Due date required"),
  payment_instructions: z.string().max(1000).optional().or(z.literal("")),
});
export type GenerateInvoiceValues = z.infer<typeof generateInvoiceSchema>;
