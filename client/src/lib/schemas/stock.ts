import { z } from "zod";

// All schemas use stable input=output types (no .default()) so useForm generics
// don't suffer the input/output drift documented in the errors PDF.

export const ADJUSTMENT_TYPES = [
  "count",
  "write_off",
  "damage",
  "found",
  "correction",
] as const;
export const MOVEMENT_TYPES = [
  "received",
  "sold",
  "pos_sale",
  "returned_from_customer",
  "returned_to_supplier",
  "transferred_out",
  "transferred_in",
  "consigned_out",
  "consigned_returned",
  "reserved",
  "reservation_released",
  "written_off",
  "damaged",
  "sample",
  "adjustment",
] as const;

// ── Adjustment ──
export const adjustmentSchema = z.object({
  product_id: z.string().uuid(),
  location_id: z.string().uuid(),
  adjustment_type: z.enum(ADJUSTMENT_TYPES),
  quantity_before: z.number().int().min(0),
  quantity_after: z.number().int().min(0),
  reason: z.string().min(5, "Add a brief reason (≥5 chars)").max(500),
});
export type AdjustmentValues = z.infer<typeof adjustmentSchema>;

// ── Transfer ──
export const transferLineSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1, "At least 1"),
});
export const transferCreateSchema = z
  .object({
    from_location_id: z.string().uuid(),
    to_location_id: z.string().uuid(),
    notes: z.string().max(500).optional().or(z.literal("")),
    lines: z.array(transferLineSchema).min(1, "Pick at least one product"),
  })
  .refine((v) => v.from_location_id !== v.to_location_id, {
    message: "From and To must differ",
    path: ["to_location_id"],
  });
export type TransferCreateValues = z.infer<typeof transferCreateSchema>;

// ── Manual stock exit (gift, sample, write-off, etc.) ──
export const manualExitSchema = z.object({
  product_id: z.string().uuid(),
  from_location_id: z.string().uuid(),
  quantity: z.number().int().min(1),
  movement_type: z.enum([
    "sample",
    "consigned_out",
    "written_off",
    "damaged",
    "returned_to_supplier",
  ]),
  reason: z.string().min(5, "Explain why (≥5 chars)").max(500),
  batch_id: z.string().uuid().optional().or(z.literal("")),
});
export type ManualExitValues = z.infer<typeof manualExitSchema>;

// ── Reservation ──
export const reservationCreateSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1),
  reserved_for: z.string().uuid().optional().or(z.literal("")), // contact_id
  crm_deal_id: z.string().uuid().optional().or(z.literal("")),
  expires_at: z.string().min(1, "Required"),
  notes: z.string().max(500).optional().or(z.literal("")),
});
export type ReservationCreateValues = z.infer<typeof reservationCreateSchema>;

// ── Quality check ──
export const qcSchema = z.object({
  product_id: z.string().uuid(),
  check_type: z.enum(["incoming", "periodic", "return", "pre_consignment"]),
  result: z.enum(["pass", "fail", "conditional"]),
  notes: z.string().max(1000).optional().or(z.literal("")),
});
export type QcValues = z.infer<typeof qcSchema>;

// ── Batch / Lot ──
export const batchCreateSchema = z.object({
  product_id: z.string().uuid(),
  batch_number: z.string().min(1, "Required").max(60),
  manufactured_date: z.string().optional().or(z.literal("")),
  expiry_date: z.string().optional().or(z.literal("")),
  initial_quantity: z.number().int().min(1),
  location_id: z.string().uuid().optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
});
export type BatchCreateValues = z.infer<typeof batchCreateSchema>;

// ── Count session row (UI-only schema, used to validate inline edits) ──
export const countRowSchema = z.object({
  product_id: z.string().uuid(),
  counted: z.number().int().min(0).nullable(),
  notes: z.string().max(280).optional().or(z.literal("")),
});
export type CountRowValues = z.infer<typeof countRowSchema>;

// ── Manufacturer / SKU (Catalogue extension) ──
export const manufacturerSchema = z
  .object({
    manufacturer_name: z.string().max(120).optional().or(z.literal("")),
    manufacturer_code: z.string().max(60).optional().or(z.literal("")),
    auto_generate_sku: z.boolean(),
  })
  .refine(
    (v) =>
      v.auto_generate_sku ||
      (v.manufacturer_code && v.manufacturer_code.length > 0),
    {
      message: 'Provide a manufacturer code or tick "auto-generate"',
      path: ["manufacturer_code"],
    },
  );
export type ManufacturerValues = z.infer<typeof manufacturerSchema>;
