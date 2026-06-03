import { z } from "zod";

export const bankAccountSchema = z.object({
  business: z.string().min(1),
  bank_name: z.string().min(1, "Required"),
  account_name: z.string().min(1, "Required"),
  account_number: z.string().min(6, "Too short").max(20, "Too long"),
  sort_code: z.string().optional().or(z.literal("")),
  currency: z.string().length(3),
  is_primary: z.boolean().optional(),
  paystack_recipient_code: z.string().optional().or(z.literal("")),
  flutterwave_bank_code: z.string().optional().or(z.literal("")),
});
export type BankAccountValues = z.infer<typeof bankAccountSchema>;
