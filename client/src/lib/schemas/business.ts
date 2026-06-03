import { z } from "zod";

// ── Step 1: Identity ─────────────────────────────────────────
export const stepIdentitySchema = z.object({
  business_key: z
    .string()
    .regex(
      /^[a-z][a-z0-9_]{1,30}$/,
      "Lowercase, letters/digits/underscores, must start with a letter",
    ),
  display_name: z.string().min(1, "Required").max(80),
  legal_name: z.string().min(1, "Required").max(120),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  website: z.string().url("Must be a valid URL").optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  tin: z.string().optional().or(z.literal("")),
  cac_number: z.string().optional().or(z.literal("")),
});
export type StepIdentityValues = z.infer<typeof stepIdentitySchema>;

// ── Step 2: Branding ─────────────────────────────────────────
export const stepBrandingSchema = z.object({
  logo_path: z.string().optional().or(z.literal("")),
  accent_colour: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex like #C9A86C"),
  secondary_colour:    z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a hex like #F5F0EB').optional().or(z.literal('')),
  mission_statement: z.string().max(280).optional().or(z.literal("")),
  brand_fonts:         z.object({
    heading: z.string().optional().or(z.literal('')),
    body:    z.string().optional().or(z.literal('')),
  }).optional(),
  social_links:        z.object({
    instagram: z.string().url('Must be a valid URL').optional().or(z.literal('')),
    facebook:  z.string().url('Must be a valid URL').optional().or(z.literal('')),
    tiktok:    z.string().url('Must be a valid URL').optional().or(z.literal('')),
    twitter:   z.string().url('Must be a valid URL').optional().or(z.literal('')),
    youtube:   z.string().url('Must be a valid URL').optional().or(z.literal('')),
    linkedin:  z.string().url('Must be a valid URL').optional().or(z.literal('')),
  }).optional(),
  email_footer_text:   z.string().max(500).optional().or(z.literal('')),
});
export type StepBrandingValues = z.infer<typeof stepBrandingSchema>;

// ── Step 3: Financial ────────────────────────────────────────
export const stepFinancialSchema = z.object({
  default_currency: z.string().length(3),
  fiscal_year_start: z.number().int().min(1).max(12),
  vat_rate: z.number().min(0).max(1, "Use a decimal 0–1, e.g. 0.075 for 7.5%"),
  wht_rate: z.number().min(0).max(1, "Use a decimal 0–1, e.g. 0.05 for 5%"),
  vat_number: z.string().optional().or(z.literal("")),
});
export type StepFinancialValues = z.infer<typeof stepFinancialSchema>;

// ── Step 4: Localisation (payment methods, cash rules) ───────
export const stepLocalisationSchema = z.object({
  payment_methods: z.record(z.string(), z.boolean()).default({}),
  cash_handling_rules: z
    .object({
      require_supervisor_approval_above: z.number().min(0).optional(),
      require_double_count_above: z.number().min(0).optional(),
    })
    .optional(),
});
export type StepLocalisationValues = z.infer<typeof stepLocalisationSchema>;

// ── Step 5: Provisioning ──────────────────────────────────────
export const stepProvisioningSchema = z.object({
  provision_schema: z.boolean(),
  prefix: z
    .string()
    .regex(/^[A-Z]{2,5}$/, "2–5 uppercase letters")
    .optional()
    .or(z.literal("")),
});
export type StepProvisioningValues = z.infer<typeof stepProvisioningSchema>;

// ── Combined create payload ──────────────────────────────────
export const businessCreateSchema = stepIdentitySchema
  .merge(stepBrandingSchema)
  .merge(stepFinancialSchema)
  .merge(stepLocalisationSchema)
  .merge(stepProvisioningSchema) // now merges fine — no .refine() on it
  .refine(
    (v) => !v.provision_schema || (!!v.prefix && /^[A-Z]{2,5}$/.test(v.prefix)),
    {
      message:
        "A 2–5 letter document prefix is required when provisioning a new schema",
      path: ["prefix"],
    },
  );
export type BusinessCreateValues = z.infer<typeof businessCreateSchema>;

// ── Edit (Profile tab) ───────────────────────────────────────
export const profilePatchSchema = stepIdentitySchema.omit({
  business_key: true,
});
export type ProfilePatchValues = z.infer<typeof profilePatchSchema>;

// ── Edit (Branding tab) ──────────────────────────────────────
export const brandingPatchSchema = stepBrandingSchema;
export type BrandingPatchValues = z.infer<typeof brandingPatchSchema>;

// ── Edit (Financial tab) ─────────────────────────────────────
export const financialPatchSchema = stepFinancialSchema;
export type FinancialPatchValues = z.infer<typeof financialPatchSchema>;
