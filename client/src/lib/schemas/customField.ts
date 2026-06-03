import { z } from "zod";

export const FIELD_TYPES = [
  "text",
  "number",
  "decimal",
  "date",
  "boolean",
  "select",
  "multi_select",
] as const;
export const ENTITY_TYPES = [
  "product",
  "contact",
  "supplier",
  "retail_partner",
  "deal",
  "invoice",
] as const;

export const customFieldSchema = z
  .object({
    business: z.string().min(1),
    entity_type: z.enum(ENTITY_TYPES),
    field_key: z
      .string()
      .regex(
        /^[a-z][a-z0-9_]*$/,
        "Lowercase letters, digits, underscores; start with a letter",
      ),
    field_label: z.string().min(1, "Required"),
    field_type: z.enum(FIELD_TYPES),
    options: z.array(z.string()).default([]),
    is_required: z.boolean().default(false),
    visible_to_roles: z.array(z.string()).default([]),
    display_order: z.number().int().min(0).default(0),
  })
  .refine(
    (v) =>
      !(["select", "multi_select"] as string[]).includes(v.field_type) ||
      v.options.length > 0,
    {
      message: "Select / multi-select fields need at least one option",
      path: ["options"],
    },
  );
export type CustomFieldValues = z.infer<typeof customFieldSchema>;
