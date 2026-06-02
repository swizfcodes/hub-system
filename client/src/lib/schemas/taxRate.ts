import { z } from "zod";

export const taxRateSchema = z.object({
  business: z.string().min(1),
  tax_name: z.string().min(1, "Required"),
  tax_type: z.enum(["sales", "purchases", "payroll"]),
  rate: z.number().min(0).max(1, "Use a decimal between 0 and 1"),
  applies_to: z.enum(["all", "goods", "services", "salaries", "basic"]),
  effective_from: z.string().min(1, "Required"),
  effective_to: z.string().optional().or(z.literal("")),
  is_active: z.boolean().optional(),
});
export type TaxRateValues = z.infer<typeof taxRateSchema>;
