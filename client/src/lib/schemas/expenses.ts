// ── lib/schemas/expenses.ts ───────────────────────────────────────────────────
import { z } from "zod";

export const createExpenseSchema = z.object({
  category: z.enum(
    [
      "rent",
      "transport",
      "office_supplies",
      "meals",
      "client_entertainment",
      "utilities",
      "maintenance",
      "marketing",
      "insurance",
      "professional_fees",
      "other",
    ],
    { required_error: "Select a category" },
  ),
  expense_type: z
    .enum(["reimbursement", "petty_cash", "direct_payment"])
    .default("reimbursement"),
  amount: z.number().positive("Amount must be greater than 0"),
  description: z.string().min(3, "Description required").max(500),
  expense_date: z.string().min(1, "Date required"),
  vendor_name: z.string().max(200).optional().or(z.literal("")),
  vendor_contact_id: z.string().uuid().optional().or(z.literal("")),
  currency: z.string().length(3).optional().default("NGN"),
});
export type CreateExpenseValues = z.infer<typeof createExpenseSchema>;

export const rejectExpenseSchema = z.object({
  rejection_reason: z.string().min(3, "Reason required").max(500),
});
export type RejectExpenseValues = z.infer<typeof rejectExpenseSchema>;

export const createAdvanceSchema = z.object({
  purpose: z.string().min(3, "Purpose required").max(200),
  amount_requested: z.number().positive("Amount required"),
  reason: z.string().min(3, "Reason required").max(500),
});
export type CreateAdvanceValues = z.infer<typeof createAdvanceSchema>;

export const approveAdvanceSchema = z.object({
  amount_approved: z.number().positive("Approved amount required"),
});
export type ApproveAdvanceValues = z.infer<typeof approveAdvanceSchema>;
