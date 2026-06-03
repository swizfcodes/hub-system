"use strict";

// ─────────────────────────────────────────────────────────────
// BUSINESS CONFIG
// One row per business line. Created when a business is added,
// updated whenever profile / branding / financial settings change.
// ─────────────────────────────────────────────────────────────

async function listBusinesses(client, { includeInactive = false } = {}) {
  const { rows } = await client.query(
    `SELECT business_key, display_name, legal_name, accent_colour,
            default_currency, is_active, created_at, updated_at
     FROM shared.business_config
     WHERE ($1::BOOLEAN OR is_active = true)
     ORDER BY created_at ASC`,
    [includeInactive],
  );
  return rows;
}

async function findBusinessByKey(client, businessKey) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM shared.business_config WHERE business_key = $1`,
    [businessKey],
  );
  return row || null;
}

async function insertBusiness(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.business_config
       (business_key, display_name, legal_name, address, phone, email, website,
        tin, cac_number, logo_path, accent_colour, secondary_colour, fiscal_year_start,
        default_currency, vat_number, vat_rate, wht_rate,
        mission_statement, brand_fonts, social_links, email_footer_text,
        cash_handling_rules, payment_methods, loyalty_settings)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
     RETURNING *`,
    [
      data.business_key,
      data.display_name,
      data.legal_name,
      data.address || null,
      data.phone || null,
      data.email || null,
      data.website || null,
      data.tin || null,
      data.cac_number || null,
      data.logo_path || null,
      data.accent_colour || "#2563EB",
      data.secondary_colour || "#F5F0EB",
      data.fiscal_year_start || 1,
      data.default_currency || "NGN",
      data.vat_number || null,
      data.vat_rate ?? 0.075,
      data.wht_rate ?? 0.05,
      data.mission_statement || null,
      JSON.stringify(data.brand_fonts || {}),
      JSON.stringify(data.social_links || {}),
      data.email_footer_text || null,
      JSON.stringify(data.cash_handling_rules || {}),
      JSON.stringify(data.payment_methods || {}),
      JSON.stringify(data.loyalty_settings || {}),
    ],
  );
  return row;
}

async function updateBusiness(client, businessKey, fields) {
  // Build dynamic SET clause — only update keys actually provided.
  const allowed = [
    "display_name",
    "legal_name",
    "address",
    "phone",
    "email",
    "website",
    "tin",
    "cac_number",
    "logo_path",
    "accent_colour",
    "secondary_colour",
    "fiscal_year_start",
    "default_currency",
    "vat_number",
    "vat_rate",
    "wht_rate",
    "mission_statement",
    "brand_fonts",
    "social_links",
    "email_footer_text",
    "cash_handling_rules",
    "payment_methods",
    "loyalty_settings",
    "is_active",
  ];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] === undefined) continue;
    if (
      ["brand_fonts", "social_links", "cash_handling_rules", "payment_methods", "loyalty_settings"].includes(key)
    ) {
      sets.push(`${key} = $${i++}::jsonb`);
      values.push(JSON.stringify(fields[key]));
    } else {
      sets.push(`${key} = $${i++}`);
      values.push(fields[key]);
    }
  }
  if (!sets.length) return findBusinessByKey(client, businessKey);
  sets.push(`updated_at = now()`);
  values.push(businessKey);
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.business_config
     SET ${sets.join(", ")}
     WHERE business_key = $${i}
     RETURNING *`,
    values,
  );
  return row || null;
}

async function deactivateBusiness(client, businessKey) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.business_config
     SET is_active = false, updated_at = now()
     WHERE business_key = $1
     RETURNING business_key, is_active`,
    [businessKey],
  );
  return row || null;
}

/**
 * Atomically grant a user access to a business by appending the key to
 * shared.users.permitted_businesses — but only if it isn't already there
 * (NOT ('*' = ANY(...)) guards the owner wildcard; the array containment
 * check avoids duplicates). Returns the updated user row, or the unchanged
 * row if the key was already permitted.
 */
async function grantBusinessToUser(client, userId, businessKey) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.users
     SET permitted_businesses = array_append(permitted_businesses, $2)
     WHERE user_id = $1
       AND NOT (permitted_businesses @> ARRAY[$2]::TEXT[])
       AND NOT ('*' = ANY(permitted_businesses))
     RETURNING user_id, default_business, permitted_businesses`,
    [userId, businessKey],
  );
  return row || null;
}


// ─────────────────────────────────────────────────────────────
// BANK ACCOUNTS
// ─────────────────────────────────────────────────────────────

async function listBankAccounts(client, { business, includeInactive = false }) {
  const { rows } = await client.query(
    `SELECT account_id, business, bank_name, account_name, account_number,
            sort_code, currency, is_primary, paystack_recipient_code,
            flutterwave_bank_code, is_active, created_at, updated_at
     FROM shared.bank_accounts
     WHERE ($1::TEXT IS NULL OR business = $1)
       AND ($2::BOOLEAN OR is_active = true)
     ORDER BY is_primary DESC, bank_name ASC`,
    [business || null, includeInactive],
  );
  return rows;
}

async function findBankAccountById(client, accountId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM shared.bank_accounts WHERE account_id = $1`,
    [accountId],
  );
  return row || null;
}

async function insertBankAccount(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.bank_accounts
       (business, bank_name, account_name, account_number, sort_code,
        currency, is_primary, paystack_recipient_code, flutterwave_bank_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      data.business,
      data.bank_name,
      data.account_name,
      data.account_number,
      data.sort_code || null,
      data.currency || "NGN",
      data.is_primary || false,
      data.paystack_recipient_code || null,
      data.flutterwave_bank_code || null,
    ],
  );
  return row;
}

async function clearPrimaryBankAccount(client, business, currency) {
  // Used when a new account is marked primary — ensure only one
  // primary per (business, currency) combination.
  await client.query(
    `UPDATE shared.bank_accounts
     SET is_primary = false, updated_at = now()
     WHERE business = $1 AND currency = $2 AND is_primary = true`,
    [business, currency],
  );
}

async function updateBankAccount(client, accountId, fields) {
  const allowed = [
    "bank_name",
    "account_name",
    "account_number",
    "sort_code",
    "currency",
    "is_primary",
    "paystack_recipient_code",
    "flutterwave_bank_code",
    "is_active",
  ];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] === undefined) continue;
    sets.push(`${key} = $${i++}`);
    values.push(fields[key]);
  }
  if (!sets.length) return findBankAccountById(client, accountId);
  sets.push(`updated_at = now()`);
  values.push(accountId);
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.bank_accounts
     SET ${sets.join(", ")}
     WHERE account_id = $${i}
     RETURNING *`,
    values,
  );
  return row || null;
}

async function deactivateBankAccount(client, accountId) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.bank_accounts
     SET is_active = false, updated_at = now()
     WHERE account_id = $1
     RETURNING account_id, is_active`,
    [accountId],
  );
  return row || null;
}

// ─────────────────────────────────────────────────────────────
// TAX RATES
// ─────────────────────────────────────────────────────────────

async function listTaxRates(client, { business, activeOnly = true }) {
  const { rows } = await client.query(
    `SELECT tax_id, business, tax_name, tax_type, rate, applies_to,
            is_active, effective_from, effective_to, created_at
     FROM shared.tax_rates
     WHERE ($1::TEXT IS NULL OR business = $1)
       AND ($2::BOOLEAN = false OR is_active = true)
     ORDER BY tax_type ASC, effective_from DESC`,
    [business || null, activeOnly],
  );
  return rows;
}

async function insertTaxRate(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.tax_rates
       (business, tax_name, tax_type, rate, applies_to,
        is_active, effective_from, effective_to)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      data.business,
      data.tax_name,
      data.tax_type,
      data.rate,
      data.applies_to,
      data.is_active !== false,
      data.effective_from,
      data.effective_to || null,
    ],
  );
  return row;
}

async function updateTaxRate(client, taxId, fields) {
  const allowed = [
    "tax_name",
    "tax_type",
    "rate",
    "applies_to",
    "is_active",
    "effective_from",
    "effective_to",
  ];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] === undefined) continue;
    sets.push(`${key} = $${i++}`);
    values.push(fields[key]);
  }
  if (!sets.length) return null;
  values.push(taxId);
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.tax_rates
     SET ${sets.join(", ")}
     WHERE tax_id = $${i}
     RETURNING *`,
    values,
  );
  return row || null;
}

async function deactivateTaxRate(client, taxId) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.tax_rates
     SET is_active = false
     WHERE tax_id = $1
     RETURNING tax_id, is_active`,
    [taxId],
  );
  return row || null;
}

// ─────────────────────────────────────────────────────────────
// CURRENCY RATES
// Mostly read-only from the API — the syncCurrencyRates cron job
// writes new rows. Admins can manually post an override when an
// external feed is unavailable.
// ─────────────────────────────────────────────────────────────

async function listCurrencyRates(client, { from, to, limit = 50 } = {}) {
  const { rows } = await client.query(
    `SELECT rate_id, from_currency, to_currency, rate, source,
            valid_at, created_at
     FROM shared.currency_rates
     WHERE ($1::TEXT IS NULL OR from_currency = $1)
       AND ($2::TEXT IS NULL OR to_currency = $2)
     ORDER BY valid_at DESC
     LIMIT $3`,
    [from || null, to || null, limit],
  );
  return rows;
}

async function findLatestRate(client, fromCurrency, toCurrency = "NGN") {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM shared.currency_rates
     WHERE from_currency = $1 AND to_currency = $2
     ORDER BY valid_at DESC LIMIT 1`,
    [fromCurrency, toCurrency],
  );
  return row || null;
}

async function insertCurrencyRate(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.currency_rates
       (from_currency, to_currency, rate, source, valid_at)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [
      data.from_currency,
      data.to_currency || "NGN",
      data.rate,
      data.source || "manual",
      data.valid_at || new Date().toISOString(),
    ],
  );
  return row;
}

// ─────────────────────────────────────────────────────────────
// CUSTOM FIELD DEFINITIONS
// Per-business, per-entity (product, contact, etc.) field definitions.
// Jewelry uses Metal Type, Stone Type, Weight; Diffusers use Fragrance
// Family, Burn Time, Volume — both stored here.
// ─────────────────────────────────────────────────────────────

async function listCustomFields(
  client,
  { business, entityType, activeOnly = true },
) {
  const { rows } = await client.query(
    `SELECT field_id, business, entity_type, field_key, field_label,
            field_type, options, is_required, is_active, visible_to_roles,
            display_order, created_at
     FROM shared.custom_field_defs
     WHERE ($1::TEXT IS NULL OR business = $1)
       AND ($2::TEXT IS NULL OR entity_type = $2)
       AND ($3::BOOLEAN = false OR is_active = true)
     ORDER BY entity_type ASC, display_order ASC, field_label ASC`,
    [business || null, entityType || null, activeOnly],
  );
  return rows;
}

async function findCustomFieldById(client, fieldId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM shared.custom_field_defs WHERE field_id = $1`,
    [fieldId],
  );
  return row || null;
}

async function insertCustomField(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.custom_field_defs
       (business, entity_type, field_key, field_label, field_type,
        options, is_required, is_active, visible_to_roles, display_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      data.business,
      data.entity_type,
      data.field_key,
      data.field_label,
      data.field_type,
      JSON.stringify(data.options || []),
      data.is_required || false,
      data.is_active !== false,
      data.visible_to_roles || [],
      data.display_order || 0,
    ],
  );
  return row;
}

async function updateCustomField(client, fieldId, fields) {
  const allowed = [
    "field_label",
    "field_type",
    "options",
    "is_required",
    "is_active",
    "visible_to_roles",
    "display_order",
  ];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] === undefined) continue;
    if (key === "options") {
      sets.push(`${key} = $${i++}::jsonb`);
      values.push(JSON.stringify(fields[key]));
    } else {
      sets.push(`${key} = $${i++}`);
      values.push(fields[key]);
    }
  }
  if (!sets.length) return findCustomFieldById(client, fieldId);
  values.push(fieldId);
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.custom_field_defs
     SET ${sets.join(", ")}
     WHERE field_id = $${i}
     RETURNING *`,
    values,
  );
  return row || null;
}

async function deleteCustomField(client, fieldId) {
  // Soft-delete — products may still reference this field key.
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.custom_field_defs
     SET is_active = false
     WHERE field_id = $1
     RETURNING field_id, is_active`,
    [fieldId],
  );
  return row || null;
}

// ─────────────────────────────────────────────────────────────
// PIPELINE STAGE DEFINITIONS
// CRM pipeline stages per business — e.g. jewelry uses Viewing /
// Offer Sent / Payment Pending; diffusers use Sample Sent / Bulk Order.
// ─────────────────────────────────────────────────────────────

async function listPipelineStages(client, { business, pipelineType }) {
  const { rows } = await client.query(
    `SELECT stage_id, business, pipeline_type, stage_key, stage_label,
            display_order, is_terminal, is_positive_terminal, colour
     FROM shared.pipeline_stage_defs
     WHERE ($1::TEXT IS NULL OR business = $1)
       AND ($2::TEXT IS NULL OR pipeline_type = $2)
     ORDER BY business ASC, pipeline_type ASC, display_order ASC`,
    [business || null, pipelineType || null],
  );
  return rows;
}

async function findStageById(client, stageId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM shared.pipeline_stage_defs WHERE stage_id = $1`,
    [stageId],
  );
  return row || null;
}

async function insertPipelineStage(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.pipeline_stage_defs
       (business, pipeline_type, stage_key, stage_label,
        display_order, is_terminal, is_positive_terminal, colour)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      data.business,
      data.pipeline_type,
      data.stage_key,
      data.stage_label,
      data.display_order || 0,
      data.is_terminal || false,
      data.is_positive_terminal || null,
      data.colour || "#64748B",
    ],
  );
  return row;
}

async function updatePipelineStage(client, stageId, fields) {
  const allowed = [
    "stage_label",
    "display_order",
    "is_terminal",
    "is_positive_terminal",
    "colour",
  ];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] === undefined) continue;
    sets.push(`${key} = $${i++}`);
    values.push(fields[key]);
  }
  if (!sets.length) return findStageById(client, stageId);
  values.push(stageId);
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.pipeline_stage_defs
     SET ${sets.join(", ")}
     WHERE stage_id = $${i}
     RETURNING *`,
    values,
  );
  return row || null;
}

async function deletePipelineStage(client, stageId) {
  const result = await client.query(
    `DELETE FROM shared.pipeline_stage_defs WHERE stage_id = $1`,
    [stageId],
  );
  return result.rowCount > 0;
}

// ─────────────────────────────────────────────────────────────
// DOCUMENT NUMBERING SEQUENCES
// Read-only most of the time. Admins can change prefix or padding
// (rare) and reset next_number (very rare, audit-logged).
// ─────────────────────────────────────────────────────────────

async function listDocumentSequences(client, { business } = {}) {
  const { rows } = await client.query(
    `SELECT seq_id, business, document_type, prefix, next_number, padding
     FROM shared.document_numbering
     WHERE ($1::TEXT IS NULL OR business = $1)
     ORDER BY business ASC, document_type ASC`,
    [business || null],
  );
  return rows;
}

async function findDocumentSequence(client, business, documentType) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM shared.document_numbering
     WHERE business = $1 AND document_type = $2`,
    [business, documentType],
  );
  return row || null;
}

async function upsertDocumentSequence(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.document_numbering
       (business, document_type, prefix, next_number, padding)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (business, document_type) DO UPDATE
     SET prefix = EXCLUDED.prefix,
         padding = EXCLUDED.padding
     RETURNING *`,
    [
      data.business,
      data.document_type,
      data.prefix,
      data.next_number || 1,
      data.padding || 4,
    ],
  );
  return row;
}

async function updateDocumentSequence(client, seqId, fields) {
  // next_number override is restricted and audit-logged in service layer.
  const allowed = ["prefix", "next_number", "padding"];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] === undefined) continue;
    sets.push(`${key} = $${i++}`);
    values.push(fields[key]);
  }
  if (!sets.length) return null;
  values.push(seqId);
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.document_numbering
     SET ${sets.join(", ")}
     WHERE seq_id = $${i}
     RETURNING *`,
    values,
  );
  return row || null;
}

module.exports = {
  // business config
  listBusinesses,
  findBusinessByKey,
  insertBusiness,
  updateBusiness,
  deactivateBusiness,
  grantBusinessToUser,
  // bank accounts
  listBankAccounts,
  findBankAccountById,
  insertBankAccount,
  clearPrimaryBankAccount,
  updateBankAccount,
  deactivateBankAccount,
  // tax rates
  listTaxRates,
  insertTaxRate,
  updateTaxRate,
  deactivateTaxRate,
  // currency rates
  listCurrencyRates,
  findLatestRate,
  insertCurrencyRate,
  // custom fields
  listCustomFields,
  findCustomFieldById,
  insertCustomField,
  updateCustomField,
  deleteCustomField,
  // pipeline stages
  listPipelineStages,
  findStageById,
  insertPipelineStage,
  updatePipelineStage,
  deletePipelineStage,
  // document numbering
  listDocumentSequences,
  findDocumentSequence,
  upsertDocumentSequence,
  updateDocumentSequence,
};
