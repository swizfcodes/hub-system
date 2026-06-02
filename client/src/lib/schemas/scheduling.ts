import { z } from "zod";

export const createEventSchema = z.object({
  title: z.string().min(1, "Title required").max(200),
  event_type: z.enum([
    "meeting",
    "viewing",
    "appointment",
    "delivery",
    "task",
    "reminder",
    "other",
  ]),
  start_at: z.string().min(1, "Start time required"),
  end_at: z.string().min(1, "End time required"),
  all_day: z.boolean().optional().default(false),
  location: z.string().max(300).optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  recurrence_rule: z.string().optional().or(z.literal("")),
  reference_type: z.string().optional().or(z.literal("")),
  reference_id: z.string().uuid().optional().or(z.literal("")),
  is_private: z.boolean().optional().default(false),
});
export type CreateEventValues = z.infer<typeof createEventSchema>;

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title required").max(300),
  description: z.string().max(2000).optional().or(z.literal("")),
  status: z
    .enum([
      "inbox",
      "today",
      "this_week",
      "this_month",
      "later",
      "done",
      "cancelled",
    ])
    .default("inbox"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  assigned_to: z.string().uuid().optional().or(z.literal("")),
  due_at: z.string().optional().or(z.literal("")),
  reminder_minutes: z.string().optional().or(z.literal("")),
  reference_type: z.string().optional().or(z.literal("")),
  reference_id: z.string().uuid().optional().or(z.literal("")),
  is_personal: z.boolean().optional().default(false),
});
export type CreateTaskValues = z.infer<typeof createTaskSchema>;
