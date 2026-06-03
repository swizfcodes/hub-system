"use strict";

const { withSharedContext } = require("../../config/db");
const businesses = require("../../config/businesses");
const auditService = require("../../shared/audit/audit.service");
const repo = require("./settings.repository");

// ─────────────────────────────────────────────────────────────
// BUSINESS CONFIG
// ─────────────────────────────────────────────────────────────

async function listBusinesses({ includeInactive = false } = {}) {
  return withSharedContext((client) =>
    repo.listBusinesses(client, { includeInactive }),
  );
}

async function getBusiness(businessKey) {
  return withSharedContext(async (client) => {
    const row = await repo.findBusinessByKey(client, businessKey);
    if (!row)
      throw Object.assign(new Error("Business not found"), { status: 404 });
    return row;
  });
}

/**
 * Create a new business line. This is a privileged operation —
 * only system administrators should be able to call it.
 *
 * Note: this only adds the business_config row. The per-business
 * schema (e.g. `watches`) must be created by a migration run by
 * the DBA OR by scripts/bootstrapBusiness.js. The new business is
 * automatically added to the in-memory active-business cache after
 * this insert, so it becomes valid for routing immediately — but
 * any request for it will fail until the schema exists.
 */
async function createBusiness(data, user) {
  return withSharedContext(async (client) => {
    if (!/^[a-z][a-z0-9_]{1,30}$/.test(data.business_key)) {
      throw Object.assign(
        new Error(
          "business_key must be lowercase alphanumeric/underscore, starting with a letter",
        ),
        { status: 400 },
      );
    }
    const existing = await repo.findBusinessByKey(client, data.business_key);
    if (existing) {
      throw Object.assign(new Error("Business key already exists"), {
        status: 409,
      });
    }
    const row = await repo.insertBusiness(client, data);

    // Grant the creating user access to the new business so it appears in
    // their switcher immediately. Owner accounts (permitted_businesses = ['*'])
    // are skipped by the repo's wildcard guard. The caller's token still
    // carries the old permitted list, so the frontend must refresh /auth/me
    // (or switch-business) after this returns.
    if (user?.user_id) {
      await repo.grantBusinessToUser(client, user.user_id, data.business_key);
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: data.business_key,
      module: "settings",
      action: "create",
      table: "shared.business_config",
      recordId: row.config_id,
      after: row,
    });
    // Push to the in-memory active-business cache so subsequent
    // requests (validation, sockets, cron jobs) see the new business
    // without waiting for the next periodic refresh.
    if (row.is_active !== false) {
      businesses.addToCache(row);
    }
    return row;
  });
}

/**
 * Full bootstrap — creates the PostgreSQL schema, applies all template
 * migrations, inserts the business_config row, seeds document_numbering,
 * and refreshes the cache. This is the "web equivalent" of running
 * scripts/bootstrapBusiness.js from the command line.
 *
 * Required fields: business_key, display_name, legal_name, prefix.
 *
 * Throws on:
 *   - invalid business_key format
 *   - existing schema or business_config row
 *   - any migration failure (the partial schema is dropped automatically)
 *
 * Permission gate is in the route layer — only owner / system admin
 * roles should be able to call this.
 */
async function createBusinessWithSchema(data, user) {
  // Lazy require to avoid loading the bootstrap script (and pulling
  // in the full migration template list) on cold starts that don't
  // need it.
  const bootstrap = require("../../scripts/bootstrapBusiness").bootstrap;

  const row = await bootstrap({
    key: data.business_key,
    displayName: data.display_name,
    legalName: data.legal_name,
    prefix: data.prefix,
    currency: data.default_currency,
    vatRate: data.vat_rate,
    whtRate: data.wht_rate,
    accentColour: data.accent_colour,
    secondaryColour: data.secondary_colour,
    fiscalYearStart: data.fiscal_year_start,
    missionStatement: data.mission_statement,
    brandFonts: data.brand_fonts,
    socialLinks: data.social_links,
    emailFooterText: data.email_footer_text,
    cashHandlingRules: data.cash_handling_rules,
    paymentMethods: data.payment_methods,
  });

  // Log under the new business's audit trail — including the bootstrap
  // action so a compliance review can answer "who provisioned this?".
  // Also grant the creating user access to the new business so it shows
  // in their switcher (the repo skips owner '*' accounts automatically).
  await withSharedContext(async (client) => {
    if (user?.user_id) {
      await repo.grantBusinessToUser(client, user.user_id, row.business_key);
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: row.business_key,
      module: "settings",
      action: "bootstrap",
      table: "shared.business_config",
      recordId: row.config_id,
      after: row,
      metadata: {
        sensitive: true,
        reason: "new business provisioning — schema + tables + seed data",
      },
    });
  });

  return row;
}

async function updateBusiness(businessKey, fields, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findBusinessByKey(client, businessKey);
    if (!before)
      throw Object.assign(new Error("Business not found"), { status: 404 });
    // Disallow renaming the business_key — it's the routing key everywhere.
    if (fields.business_key && fields.business_key !== businessKey) {
      throw Object.assign(new Error("business_key cannot be changed"), {
        status: 400,
      });
    }
    if (
      fields.fiscal_year_start !== undefined &&
      (fields.fiscal_year_start < 1 || fields.fiscal_year_start > 12)
    ) {
      throw Object.assign(
        new Error("fiscal_year_start must be between 1 and 12"),
        { status: 400 },
      );
    }
    const after = await repo.updateBusiness(client, businessKey, fields);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: businessKey,
      module: "settings",
      action: "update",
      table: "shared.business_config",
      recordId: before.config_id,
      before,
      after,
    });
    return after;
  });
}

async function deactivateBusiness(businessKey, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findBusinessByKey(client, businessKey);
    if (!before)
      throw Object.assign(new Error("Business not found"), { status: 404 });
    const after = await repo.deactivateBusiness(client, businessKey);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: businessKey,
      module: "settings",
      action: "deactivate",
      table: "shared.business_config",
      recordId: before.config_id,
      before: { is_active: before.is_active },
      after,
    });
    // Drop from the in-memory cache so it stops appearing in active-
    // business lists. Existing requests already in-flight are
    // unaffected.
    businesses.removeFromCache(businessKey);
    return after;
  });
}

// ─────────────────────────────────────────────────────────────
// BANK ACCOUNTS
// ─────────────────────────────────────────────────────────────

async function listBankAccounts(query) {
  return withSharedContext((client) =>
    repo.listBankAccounts(client, {
      business: query.business,
      includeInactive: query.includeInactive === "true",
    }),
  );
}

async function getBankAccount(accountId) {
  return withSharedContext(async (client) => {
    const row = await repo.findBankAccountById(client, accountId);
    if (!row)
      throw Object.assign(new Error("Bank account not found"), { status: 404 });
    return row;
  });
}

async function createBankAccount(data, user) {
  return withSharedContext(async (client) => {
    if (data.is_primary) {
      await repo.clearPrimaryBankAccount(
        client,
        data.business,
        data.currency || "NGN",
      );
    }
    const row = await repo.insertBankAccount(client, data);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: data.business,
      module: "settings",
      action: "create",
      table: "shared.bank_accounts",
      recordId: row.account_id,
      after: { ...row, account_number: maskAccountNumber(row.account_number) },
    });
    return row;
  });
}

async function updateBankAccount(accountId, fields, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findBankAccountById(client, accountId);
    if (!before)
      throw Object.assign(new Error("Bank account not found"), { status: 404 });
    if (fields.is_primary) {
      await repo.clearPrimaryBankAccount(
        client,
        before.business,
        fields.currency || before.currency,
      );
    }
    const after = await repo.updateBankAccount(client, accountId, fields);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: before.business,
      module: "settings",
      action: "update",
      table: "shared.bank_accounts",
      recordId: accountId,
      before: {
        ...before,
        account_number: maskAccountNumber(before.account_number),
      },
      after: {
        ...after,
        account_number: maskAccountNumber(after.account_number),
      },
    });
    return after;
  });
}

async function deactivateBankAccount(accountId, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findBankAccountById(client, accountId);
    if (!before)
      throw Object.assign(new Error("Bank account not found"), { status: 404 });
    const after = await repo.deactivateBankAccount(client, accountId);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: before.business,
      module: "settings",
      action: "deactivate",
      table: "shared.bank_accounts",
      recordId: accountId,
      before: { is_active: before.is_active },
      after,
    });
    return after;
  });
}

function maskAccountNumber(num) {
  if (!num || num.length < 4) return "****";
  return `****${num.slice(-4)}`;
}

// ─────────────────────────────────────────────────────────────
// TAX RATES
// ─────────────────────────────────────────────────────────────

async function listTaxRates(query) {
  return withSharedContext((client) =>
    repo.listTaxRates(client, {
      business: query.business,
      activeOnly: query.activeOnly !== "false",
    }),
  );
}

async function createTaxRate(data, user) {
  return withSharedContext(async (client) => {
    if (data.rate < 0 || data.rate > 1) {
      throw Object.assign(
        new Error(
          "Tax rate must be a decimal between 0 and 1 (e.g. 0.075 for 7.5%)",
        ),
        { status: 400 },
      );
    }
    const row = await repo.insertTaxRate(client, data);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: data.business,
      module: "settings",
      action: "create",
      table: "shared.tax_rates",
      recordId: row.tax_id,
      after: row,
    });
    return row;
  });
}

async function updateTaxRate(taxId, fields, user) {
  return withSharedContext(async (client) => {
    if (fields.rate !== undefined && (fields.rate < 0 || fields.rate > 1)) {
      throw Object.assign(
        new Error("Tax rate must be a decimal between 0 and 1"),
        { status: 400 },
      );
    }
    const after = await repo.updateTaxRate(client, taxId, fields);
    if (!after)
      throw Object.assign(new Error("Tax rate not found"), { status: 404 });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: after.business,
      module: "settings",
      action: "update",
      table: "shared.tax_rates",
      recordId: taxId,
      after,
    });
    return after;
  });
}

async function deactivateTaxRate(taxId, user) {
  return withSharedContext(async (client) => {
    const after = await repo.deactivateTaxRate(client, taxId);
    if (!after)
      throw Object.assign(new Error("Tax rate not found"), { status: 404 });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      module: "settings",
      action: "deactivate",
      table: "shared.tax_rates",
      recordId: taxId,
      after,
    });
    return after;
  });
}

// ─────────────────────────────────────────────────────────────
// CURRENCY RATES
// ─────────────────────────────────────────────────────────────

async function listCurrencyRates(query) {
  return withSharedContext((client) =>
    repo.listCurrencyRates(client, {
      from: query.from,
      to: query.to,
      limit: parseInt(query.limit) || 50,
    }),
  );
}

async function getLatestRate(fromCurrency, toCurrency = "NGN") {
  return withSharedContext((client) =>
    repo.findLatestRate(client, fromCurrency, toCurrency),
  );
}

async function createCurrencyRate(data, user) {
  return withSharedContext(async (client) => {
    if (data.rate <= 0) {
      throw Object.assign(new Error("Currency rate must be positive"), {
        status: 400,
      });
    }
    const row = await repo.insertCurrencyRate(client, {
      ...data,
      source: data.source || "manual",
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      module: "settings",
      action: "create",
      table: "shared.currency_rates",
      recordId: row.rate_id,
      after: row,
    });
    return row;
  });
}

// ─────────────────────────────────────────────────────────────
// CUSTOM FIELDS
// ─────────────────────────────────────────────────────────────

const ALLOWED_FIELD_TYPES = [
  "text",
  "number",
  "decimal",
  "date",
  "boolean",
  "select",
  "multi_select",
];
const ALLOWED_ENTITY_TYPES = [
  "product",
  "contact",
  "supplier",
  "retail_partner",
  "deal",
  "invoice",
];

async function listCustomFields(query) {
  return withSharedContext((client) =>
    repo.listCustomFields(client, {
      business: query.business,
      entityType: query.entity_type,
      activeOnly: query.activeOnly !== "false",
    }),
  );
}

async function createCustomField(data, user) {
  return withSharedContext(async (client) => {
    if (!ALLOWED_FIELD_TYPES.includes(data.field_type)) {
      throw Object.assign(
        new Error(
          `field_type must be one of: ${ALLOWED_FIELD_TYPES.join(", ")}`,
        ),
        { status: 400 },
      );
    }
    if (!ALLOWED_ENTITY_TYPES.includes(data.entity_type)) {
      throw Object.assign(
        new Error(
          `entity_type must be one of: ${ALLOWED_ENTITY_TYPES.join(", ")}`,
        ),
        { status: 400 },
      );
    }
    if (!/^[a-z][a-z0-9_]*$/.test(data.field_key)) {
      throw Object.assign(
        new Error(
          "field_key must be lowercase alphanumeric/underscore, starting with a letter",
        ),
        { status: 400 },
      );
    }
    if (
      ["select", "multi_select"].includes(data.field_type) &&
      (!Array.isArray(data.options) || data.options.length === 0)
    ) {
      throw Object.assign(
        new Error("select / multi_select fields require an options array"),
        { status: 400 },
      );
    }
    const row = await repo.insertCustomField(client, data);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: data.business,
      module: "settings",
      action: "create",
      table: "shared.custom_field_defs",
      recordId: row.field_id,
      after: row,
    });
    return row;
  });
}

async function updateCustomField(fieldId, fields, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findCustomFieldById(client, fieldId);
    if (!before)
      throw Object.assign(new Error("Custom field not found"), { status: 404 });
    if (fields.field_type && !ALLOWED_FIELD_TYPES.includes(fields.field_type)) {
      throw Object.assign(new Error("Invalid field_type"), { status: 400 });
    }
    const after = await repo.updateCustomField(client, fieldId, fields);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: before.business,
      module: "settings",
      action: "update",
      table: "shared.custom_field_defs",
      recordId: fieldId,
      before,
      after,
    });
    return after;
  });
}

async function deleteCustomField(fieldId, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findCustomFieldById(client, fieldId);
    if (!before)
      throw Object.assign(new Error("Custom field not found"), { status: 404 });
    const after = await repo.deleteCustomField(client, fieldId);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: before.business,
      module: "settings",
      action: "delete",
      table: "shared.custom_field_defs",
      recordId: fieldId,
      before,
      after,
    });
    return after;
  });
}

// ─────────────────────────────────────────────────────────────
// PIPELINE STAGES
// ─────────────────────────────────────────────────────────────

async function listPipelineStages(query) {
  return withSharedContext((client) =>
    repo.listPipelineStages(client, {
      business: query.business,
      pipelineType: query.pipeline_type,
    }),
  );
}

async function createPipelineStage(data, user) {
  return withSharedContext(async (client) => {
    if (!/^[a-z][a-z0-9_]*$/.test(data.stage_key)) {
      throw Object.assign(
        new Error("stage_key must be lowercase alphanumeric/underscore"),
        { status: 400 },
      );
    }
    if (data.colour && !/^#[0-9A-Fa-f]{6}$/.test(data.colour)) {
      throw Object.assign(new Error("colour must be a hex code like #2563EB"), {
        status: 400,
      });
    }
    const row = await repo.insertPipelineStage(client, data);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: data.business,
      module: "settings",
      action: "create",
      table: "shared.pipeline_stage_defs",
      recordId: row.stage_id,
      after: row,
    });
    return row;
  });
}

async function updatePipelineStage(stageId, fields, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findStageById(client, stageId);
    if (!before)
      throw Object.assign(new Error("Pipeline stage not found"), {
        status: 404,
      });
    if (fields.colour && !/^#[0-9A-Fa-f]{6}$/.test(fields.colour)) {
      throw Object.assign(new Error("colour must be a hex code"), {
        status: 400,
      });
    }
    const after = await repo.updatePipelineStage(client, stageId, fields);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: before.business,
      module: "settings",
      action: "update",
      table: "shared.pipeline_stage_defs",
      recordId: stageId,
      before,
      after,
    });
    return after;
  });
}

async function deletePipelineStage(stageId, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findStageById(client, stageId);
    if (!before)
      throw Object.assign(new Error("Pipeline stage not found"), {
        status: 404,
      });
    const ok = await repo.deletePipelineStage(client, stageId);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: before.business,
      module: "settings",
      action: "delete",
      table: "shared.pipeline_stage_defs",
      recordId: stageId,
      before,
    });
    return { deleted: ok };
  });
}

// ─────────────────────────────────────────────────────────────
// DOCUMENT NUMBERING
// ─────────────────────────────────────────────────────────────

async function listDocumentSequences(query) {
  return withSharedContext((client) =>
    repo.listDocumentSequences(client, { business: query.business }),
  );
}

async function upsertDocumentSequence(data, user) {
  return withSharedContext(async (client) => {
    if (!/^[A-Z][A-Z0-9-]*$/.test(data.prefix)) {
      throw Object.assign(
        new Error(
          "prefix must be uppercase alphanumeric (with optional dashes), e.g. JWL-INV",
        ),
        { status: 400 },
      );
    }
    if (data.padding && (data.padding < 1 || data.padding > 10)) {
      throw Object.assign(new Error("padding must be between 1 and 10"), {
        status: 400,
      });
    }
    const row = await repo.upsertDocumentSequence(client, data);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: data.business,
      module: "settings",
      action: "upsert",
      table: "shared.document_numbering",
      recordId: row.seq_id,
      after: row,
    });
    return row;
  });
}

async function updateDocumentSequence(seqId, fields, user) {
  return withSharedContext(async (client) => {
    if (fields.prefix && !/^[A-Z][A-Z0-9-]*$/.test(fields.prefix)) {
      throw Object.assign(new Error("Invalid prefix format"), { status: 400 });
    }
    if (
      fields.next_number !== undefined &&
      (!Number.isInteger(fields.next_number) || fields.next_number < 1)
    ) {
      throw Object.assign(new Error("next_number must be a positive integer"), {
        status: 400,
      });
    }
    const after = await repo.updateDocumentSequence(client, seqId, fields);
    if (!after)
      throw Object.assign(new Error("Document sequence not found"), {
        status: 404,
      });
    // Resetting next_number is a sensitive operation — flagged in audit log.
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: after.business,
      module: "settings",
      action: fields.next_number !== undefined ? "reset_sequence" : "update",
      table: "shared.document_numbering",
      recordId: seqId,
      after,
      metadata:
        fields.next_number !== undefined
          ? { sensitive: true, reason: "next_number override" }
          : {},
    });
    return after;
  });
}

module.exports = {
  // business config
  listBusinesses,
  getBusiness,
  createBusiness,
  createBusinessWithSchema,
  updateBusiness,
  deactivateBusiness,
  // bank accounts
  listBankAccounts,
  getBankAccount,
  createBankAccount,
  updateBankAccount,
  deactivateBankAccount,
  // tax rates
  listTaxRates,
  createTaxRate,
  updateTaxRate,
  deactivateTaxRate,
  // currency rates
  listCurrencyRates,
  getLatestRate,
  createCurrencyRate,
  // custom fields
  listCustomFields,
  createCustomField,
  updateCustomField,
  deleteCustomField,
  // pipeline stages
  listPipelineStages,
  createPipelineStage,
  updatePipelineStage,
  deletePipelineStage,
  // document numbering
  listDocumentSequences,
  upsertDocumentSequence,
  updateDocumentSequence,
};
