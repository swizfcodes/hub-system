// ── lib/schemas/accounting.ts ─────────────────────────────────────────────────
import { z } from "zod";

export const createAccountSchema = z.object({
  account_code: z.string().min(1).max(20),
  account_name: z.string().min(2).max(200),
  account_type: z.enum(["asset", "liability", "equity", "income", "expense"]),
  account_subtype: z.string().optional().or(z.literal("")),
  parent_account_id: z.string().uuid().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
});
export type CreateAccountValues = z.infer<typeof createAccountSchema>;

export const journalLineSchema = z
  .object({
    account_id: z.string().uuid("Select an account"),
    debit: z.number().min(0),
    credit: z.number().min(0),
    description: z.string().optional().or(z.literal("")),
    fx_rate: z.number().positive().optional(),
    original_currency: z.string().length(3).optional().or(z.literal("")),
    original_amount: z.number().positive().optional(),
  })
  .refine((l) => l.debit > 0 !== l.credit > 0, {
    message: "Each line must have either a debit OR a credit, not both",
  });

export const createJournalSchema = z.object({
  entry_date: z.string().min(1, "Date required"),
  description: z.string().min(3, "Description required"),
  lines: z.array(journalLineSchema).min(2, "At least 2 lines required"),
});
export type CreateJournalValues = z.infer<typeof createJournalSchema>;

export const dateRangeSchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});
