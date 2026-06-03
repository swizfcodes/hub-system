import { z } from "zod";

export const documentSequenceSchema = z.object({
  business: z.string().min(1),
  document_type: z.string().min(1, "Required"),
  prefix: z
    .string()
    .regex(
      /^[A-Z][A-Z0-9-]*$/,
      "Uppercase alphanumeric with dashes (e.g. JWL-INV)",
    ),
  next_number: z.number().int().min(1).optional(),
  padding: z.number().int().min(1).max(10).default(4),
});
export type DocumentSequenceValues = z.infer<typeof documentSequenceSchema>;

export const resetSequenceSchema = z.object({
  next_number: z.number().int().min(1, "Must be at least 1"),
  reset_reason: z
    .string()
    .min(10, "Please explain (≥10 chars) why this sequence is being reset"),
});
export type ResetSequenceValues = z.infer<typeof resetSequenceSchema>;
