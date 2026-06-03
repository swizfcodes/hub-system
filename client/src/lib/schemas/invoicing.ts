import { z } from "zod";

// ── Create invoice ────────────────────────────────────────────────────────────

export const invoiceLineSchema = z.object({
  product_id: z.string().uuid().optional().or(z.literal("")),
  description: z.string().min(1, "Description required"),
  quantity: z.number().int().min(1, "Min quantity is 1"),
  unit_price: z.number().min(0, "Unit price must be positive"),
  discount_amount: z.number().min(0).optional().default(0),
  vat_rate: z.number().min(0).max(1).optional(),
});

export const createInvoiceSchema = z.object({
  contact_id: z.string().uuid("Select a customer"),
  invoice_type: z
    .enum(["standard", "proforma", "retail_partner_settlement"])
    .default("standard"),
  due_date: z.string().min(1, "Due date required"),
  discount_total: z.number().min(0).optional().default(0),
  currency: z.string().length(3).optional().default("NGN"),
  notes: z.string().max(1000).optional().or(z.literal("")),
  payment_instructions: z.string().max(500).optional().or(z.literal("")),
  lines: z.array(invoiceLineSchema).min(1, "At least one line required"),
});
export type CreateInvoiceValues = z.infer<typeof createInvoiceSchema>;

// ── Record payment ────────────────────────────────────────────────────────────

export const recordPaymentSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  payment_method: z.enum([
    "bank_transfer",
    "pos_card",
    "cash",
    "paystack",
    "flutterwave",
  ]),
  payment_date: z.string().optional(),
  reference: z.string().max(200).optional().or(z.literal("")),
  paystack_reference: z.string().max(200).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
  is_confirmed: z.boolean().optional().default(true),
});
export type RecordPaymentValues = z.infer<typeof recordPaymentSchema>;

// ── Send invoice ──────────────────────────────────────────────────────────────

export const sendInvoiceSchema = z.object({
  channel: z.enum(["email", "whatsapp"]),
});
export type SendInvoiceValues = z.infer<typeof sendInvoiceSchema>;

// ── Create credit note ────────────────────────────────────────────────────────

export const creditNoteLineSchema = z.object({
  product_id: z.string().uuid().optional().or(z.literal("")),
  description: z.string().min(1, "Description required"),
  quantity: z.number().int().min(1),
  unit_price: z.number().min(0.01, "Price required"),
});

export const createCreditNoteSchema = z.object({
  reason: z.string().min(3, "Reason required").max(500),
  lines: z.array(creditNoteLineSchema).min(1, "At least one line required"),
});
export type CreateCreditNoteValues = z.infer<typeof createCreditNoteSchema>;

// ── Write-off ─────────────────────────────────────────────────────────────────

export const writeOffSchema = z.object({
  reason: z.string().min(5, "Provide a reason for the write-off").max(500),
});
export type WriteOffValues = z.infer<typeof writeOffSchema>;
