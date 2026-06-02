import { z } from "zod";

export const EVENT_TYPES = [
  "meeting",
  "call",
  "delivery",
  "pickup",
  "fitting",
  "photoshoot",
  "training",
  "review",
  "reminder",
  "other",
] as const;

export const eventCreateSchema = z
  .object({
    business: z.string().min(1),
    title: z.string().min(1, "Required").max(180),
    event_type: z.string().min(1),
    start_at: z.string().min(1, "Required"),
    end_at: z.string().min(1, "Required"),
    all_day: z.boolean().default(false),
    location: z.string().optional().or(z.literal("")),
    description: z.string().max(2000).optional().or(z.literal("")),
    recurrence_rule: z.string().optional().or(z.literal("")),
    reference_type: z.string().optional().or(z.literal("")),
    reference_id: z.string().uuid().optional().or(z.literal("")),
    force: z.boolean().optional(),
  })
  .refine((v) => new Date(v.end_at) > new Date(v.start_at), {
    message: "End must be after start",
    path: ["end_at"],
  });
export type EventCreateValues = z.infer<typeof eventCreateSchema>;
