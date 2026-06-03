import { z } from "zod";

export const TASK_STATUSES = [
  "inbox",
  "today",
  "this_week",
  "this_month",
  "later",
  "done",
  "cancelled",
] as const;
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const taskCreateSchema = z.object({
  business: z.string().min(1),
  title: z.string().min(1, "Required").max(180),
  description: z.string().max(2000).optional().or(z.literal("")),
  status: z.enum(TASK_STATUSES).default("inbox"),
  priority: z.enum(TASK_PRIORITIES).default("normal"),
  assigned_to: z.string().uuid().optional().or(z.literal("")),
  due_at: z.string().optional().or(z.literal("")),
  reference_type: z.string().optional().or(z.literal("")),
  reference_id: z.string().uuid().optional().or(z.literal("")),
});
export type TaskCreateValues = z.infer<typeof taskCreateSchema>;
