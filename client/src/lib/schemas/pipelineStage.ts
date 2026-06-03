import { z } from "zod";

export const pipelineStageSchema = z.object({
  business: z.string().min(1),
  pipeline_type: z.string().min(1),
  stage_key: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, "Lowercase, digits, underscores"),
  stage_label: z.string().min(1, "Required"),
  display_order: z.number().int().min(0).default(0),
  is_terminal: z.boolean().default(false),
  is_positive_terminal: z.boolean().nullable().default(null),
  colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex like #34D399"),
});
export type PipelineStageValues = z.infer<typeof pipelineStageSchema>;
