import { z } from "zod";

// ── Session ───────────────────────────────────────────────────────────────────

export const openSessionSchema = z.object({
  terminal_id: z.string().uuid("Select a terminal"),
  opening_float: z.number().min(0),
});
export type OpenSessionValues = z.infer<typeof openSessionSchema>;

export const closeSessionSchema = z.object({
  actual_cash: z.number().min(0, "Enter the cash count"),
  reconciliation_notes: z.string().max(500).optional().or(z.literal("")),
});
export type CloseSessionValues = z.infer<typeof closeSessionSchema>;

// ── Checkout ──────────────────────────────────────────────────────────────────

export const checkoutPaymentSchema = z.object({
  method: z.enum(["cash", "pos_card", "paystack", "bank_transfer"]),
  amount: z.number().min(0.01),
  reference: z.string().max(200).optional().or(z.literal("")),
  paystack_ref: z.string().max(200).optional().or(z.literal("")),
});
export type CheckoutPaymentValues = z.infer<typeof checkoutPaymentSchema>;

// Validated before submission — at least one payment, total must cover grand total
export const checkoutSchema = z.object({
  session_id: z.string().uuid(),
  contact_id: z.string().uuid().optional(),
  payments: z.array(checkoutPaymentSchema).min(1, "Add at least one payment"),
  use_points: z.number().int().min(0).optional(),
});
export type CheckoutValues = z.infer<typeof checkoutSchema>;

// ── Quick-create contact ──────────────────────────────────────────────────────

export const quickCreateContactSchema = z.object({
  display_name: z.string().min(2, "Name required"),
  primary_phone: z.string().min(7, "Phone required"),
  whatsapp_number: z.string().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
});
export type QuickCreateContactValues = z.infer<typeof quickCreateContactSchema>;

// ── Manager PIN verification ──────────────────────────────────────────────────

export const managerVerifySchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(1, "Password required"),
});
export type ManagerVerifyValues = z.infer<typeof managerVerifySchema>;

// ── Return ────────────────────────────────────────────────────────────────────

export const returnLineSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1),
});

export const returnSchema = z.object({
  lines: z.array(returnLineSchema).min(1),
  refund_method: z.enum(["cash", "bank_transfer", "pos_card"]),
  return_reason: z.string().min(3, "Reason required").max(500),
  manager_id: z.string().uuid("Manager approval required"),
});
export type ReturnValues = z.infer<typeof returnSchema>;
