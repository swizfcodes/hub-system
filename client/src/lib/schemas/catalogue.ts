import { z } from "zod";

const webSchema = z
  .object({
    // All fields are optional at the type level.
    // superRefine below enforces the required ones only when is_published = true.
    slug: z.string().optional().or(z.literal("")),
    scent_family: z.string().optional().or(z.literal("")),
    format: z.string().optional().or(z.literal("")),
    size_ml: z.coerce.number().int().positive().optional().catch(undefined),
    top_notes: z.string().optional(),
    heart_notes: z.string().optional(),
    base_notes: z.string().optional(),
    web_description: z.string().optional(),
    is_published: z.boolean().optional(),
  })
  .superRefine((web, ctx) => {
    if (web.is_published !== true) return; // not publishing — nothing required
    if (!web.slug)
      ctx.addIssue({
        code: "custom",
        path: ["slug"],
        message: "URL slug is required to publish",
      });
    if (!web.scent_family)
      ctx.addIssue({
        code: "custom",
        path: ["scent_family"],
        message: "Scent family is required to publish",
      });
    if (!web.format)
      ctx.addIssue({
        code: "custom",
        path: ["format"],
        message: "Format is required to publish",
      });
    if (!web.size_ml)
      ctx.addIssue({
        code: "custom",
        path: ["size_ml"],
        message: "Size (ml) is required to publish",
      });
  })
  .optional();

export const productCreateSchema = z
  .object({
    sku: z
      .string()
      .min(1, "Required")
      .max(60)
      .regex(/^[A-Z0-9-]+$/i, "Letters, digits, dashes only"),
    name: z.string().min(1, "Required").max(180),
    description: z.string().max(2000).optional().or(z.literal("")),
    web: webSchema,
    category_id: z.string().uuid().optional().or(z.literal("")),
    // coerce: pg NUMERIC columns arrive as strings; empty inputs give NaN via
    // valueAsNumber. z.coerce.number() handles both without silent failures.
    cost_price: z.coerce.number().min(0).default(0).catch(0),
    selling_price: z.coerce.number().min(0).default(0).catch(0),
    min_selling_price: z.coerce.number().min(0).optional().catch(undefined),
    currency: z.string().length(3).default("NGN"),
    weight_grams: z.coerce.number().min(0).optional().catch(undefined),
    custom_fields: z.record(z.string(), z.unknown()).default({}),
    reorder_level: z.coerce.number().int().min(0).default(0).catch(0),
    reorder_quantity: z.coerce.number().int().min(0).default(0).catch(0),
    // Accounting overrides (backend-pending — see PROCUREMENT_PATCH_NOTES.md)
    income_account_id: z.string().uuid().optional().or(z.literal("")),
    inventory_account_id: z.string().uuid().optional().or(z.literal("")),
    cogs_account_id: z.string().uuid().optional().or(z.literal("")),
  })
  .refine(
    (v) => !v.min_selling_price || v.min_selling_price <= v.selling_price,
    {
      message: "Minimum selling price must be ≤ selling price",
      path: ["min_selling_price"],
    },
  );
export type ProductCreateValues = z.infer<typeof productCreateSchema>;

export const categorySchema = z.object({
  name: z.string().min(1, "Required").max(120),
  parent_category_id: z.string().uuid().optional().or(z.literal("")),
  description: z.string().max(500).optional().or(z.literal("")),
  display_order: z.number().int().min(0).default(0),
});
export type CategoryValues = z.infer<typeof categorySchema>;

export const LOCATION_TYPES = [
  "warehouse",
  "showroom",
  "pos_terminal",
  "retail_partner",
  "transit",
] as const;

export const locationSchema = z.object({
  name: z.string().min(1, "Required").max(120),
  location_type: z.enum(LOCATION_TYPES),
  partner_id: z.string().uuid().optional().or(z.literal("")),
  address: z.string().max(500).optional().or(z.literal("")),
});
export type LocationValues = z.infer<typeof locationSchema>;

// Quick-add product (used inside RFQ + PO flows — Q2 answer B)
export const quickAddProductSchema = z.object({
  sku: z.string().min(1).max(60),
  name: z.string().min(1).max(180),
  category_id: z.string().uuid().optional().or(z.literal("")),
  selling_price: z.number().min(0).optional(),
  cost_price: z.number().min(0).optional(),
  currency: z.string().length(3).default("NGN"),
});
export type QuickAddProductValues = z.infer<typeof quickAddProductSchema>;
