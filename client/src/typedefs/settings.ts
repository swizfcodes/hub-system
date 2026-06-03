// Type contracts mirroring backend shared.* tables.
// Source of truth for these contracts lives in:
//   hub-system/modules/settings/settings.repository.js
//   hub-system/shared/permissions/permissions.repository.js

export interface Business {
  config_id?: string;
  business_key: string;
  display_name: string;
  legal_name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  tin?: string | null;
  cac_number?: string | null;
  logo_path?: string | null;
  accent_colour: string;
  secondary_colour?: string | null;
  fiscal_year_start: number;
  default_currency: string;
  vat_number?: string | null;
  vat_rate: number;
  wht_rate: number;
  mission_statement?: string | null;
  brand_fonts?: Record<string, string>;
  social_links?: Record<string, string>;
  email_footer_text?: string | null;
  cash_handling_rules?: Record<string, unknown>;
  payment_methods?: Record<string, unknown>;
  loyalty_settings?: Record<string, unknown>;
  campaign_settings?: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BusinessCreatePayload extends Partial<Business> {
  business_key: string;
  display_name: string;
  legal_name: string;
  // When true, backend will additionally create the Postgres schema + run migrations.
  provision_schema?: boolean;
  prefix?: string; // required when provision_schema = true
}

export interface BankAccount {
  account_id: string;
  business: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  sort_code?: string | null;
  currency: string;
  is_primary: boolean;
  paystack_recipient_code?: string | null;
  flutterwave_bank_code?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type TaxType = "sales" | "purchases" | "payroll";
export type TaxAppliesTo = "all" | "goods" | "services" | "salaries" | "basic";

export interface TaxRate {
  tax_id: string;
  business: string;
  tax_name: string;
  tax_type: TaxType;
  rate: number;
  applies_to: TaxAppliesTo;
  is_active: boolean;
  effective_from: string;
  effective_to?: string | null;
  created_at: string;
}

export interface CurrencyRate {
  rate_id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  source: string;
  valid_at: string;
  created_at: string;
}

export type FieldType =
  | "text"
  | "number"
  | "decimal"
  | "date"
  | "boolean"
  | "select"
  | "multi_select";

export type EntityType =
  | "product"
  | "contact"
  | "supplier"
  | "retail_partner"
  | "deal"
  | "invoice";

export interface CustomField {
  field_id: string;
  business: string;
  entity_type: EntityType;
  field_key: string;
  field_label: string;
  field_type: FieldType;
  options: string[];
  is_required: boolean;
  is_active: boolean;
  visible_to_roles: string[];
  display_order: number;
  created_at: string;
}

export interface PipelineStage {
  stage_id: string;
  business: string;
  pipeline_type: string; // 'crm' | 'sales' | future...
  stage_key: string;
  stage_label: string;
  display_order: number;
  is_terminal: boolean;
  is_positive_terminal: boolean | null;
  colour: string;
}

export interface DocumentSequence {
  seq_id: string;
  business: string;
  document_type: string;
  prefix: string;
  next_number: number;
  padding: number;
}
