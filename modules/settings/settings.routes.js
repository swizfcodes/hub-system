"use strict";

const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./settings.service");

// ─────────────────────────────────────────────────────────────
// BUSINESS CONFIG
// ─────────────────────────────────────────────────────────────

router.get("/businesses", can("settings", "view"), async (req, res, next) => {
  try {
    res.json(
      await service.listBusinesses({
        includeInactive: req.query.includeInactive === "true",
      }),
    );
  } catch (e) {
    next(e);
  }
});

router.get(
  "/businesses/:key",
  param("key").isString().notEmpty(),
  validate,
  can("settings", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getBusiness(req.params.key));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/businesses",
  body("business_key").isString().notEmpty(),
  body("display_name").isString().notEmpty(),
  body("legal_name").isString().notEmpty(),
  body("email").optional().isEmail(),
  body("vat_rate").optional().isFloat({ min: 0, max: 1 }),
  body("wht_rate").optional().isFloat({ min: 0, max: 1 }),
  body("fiscal_year_start").optional().isInt({ min: 1, max: 12 }),
  body("provision_schema").optional().isBoolean(),
  body("prefix")
    .if(body("provision_schema").equals("true"))
    .matches(/^[A-Z]{2,5}$/)
    .withMessage(
      "prefix must be 2-5 uppercase letters when provision_schema is true",
    ),
  validate,
  can("settings", "create"),
  async (req, res, next) => {
    try {
      // Two paths:
      //   - provision_schema=true → full bootstrap (schema + migrations
      //     + config + document_numbering + cache update). Requires
      //     `prefix` field. This is the "admin from settings screen"
      //     path that fulfils Module 18's promise.
      //   - default → config row only (use when schema is created
      //     externally, e.g. during initial seed via migrate.js).
      if (req.body.provision_schema === true) {
        const row = await service.createBusinessWithSchema(req.body, req.user);
        return res.status(201).json(row);
      }
      res.status(201).json(await service.createBusiness(req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/businesses/:key",
  param("key").isString().notEmpty(),
  body("email").optional().isEmail(),
  body("vat_rate").optional().isFloat({ min: 0, max: 1 }),
  body("wht_rate").optional().isFloat({ min: 0, max: 1 }),
  body("fiscal_year_start").optional().isInt({ min: 1, max: 12 }),
  validate,
  can("settings", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.updateBusiness(req.params.key, req.body, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  "/businesses/:key",
  param("key").isString().notEmpty(),
  validate,
  can("settings", "delete"),
  async (req, res, next) => {
    try {
      res.json(await service.deactivateBusiness(req.params.key, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// BANK ACCOUNTS
// ─────────────────────────────────────────────────────────────

router.get(
  "/bank-accounts",
  can("settings", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listBankAccounts(req.query));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/bank-accounts/:id",
  param("id").isUUID(),
  validate,
  can("settings", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getBankAccount(req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/bank-accounts",
  body("business").isString().notEmpty(),
  body("bank_name").isString().notEmpty(),
  body("account_name").isString().notEmpty(),
  body("account_number").isString().notEmpty(),
  body("currency").optional().isString().isLength({ min: 3, max: 3 }),
  body("is_primary").optional().isBoolean(),
  validate,
  can("settings", "create"),
  async (req, res, next) => {
    try {
      res.status(201).json(await service.createBankAccount(req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/bank-accounts/:id",
  param("id").isUUID(),
  validate,
  can("settings", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.updateBankAccount(req.params.id, req.body, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  "/bank-accounts/:id",
  param("id").isUUID(),
  validate,
  can("settings", "delete"),
  async (req, res, next) => {
    try {
      res.json(await service.deactivateBankAccount(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// TAX RATES
// ─────────────────────────────────────────────────────────────

router.get("/tax-rates", can("settings", "view"), async (req, res, next) => {
  try {
    res.json(await service.listTaxRates(req.query));
  } catch (e) {
    next(e);
  }
});

router.post(
  "/tax-rates",
  body("business").isString().notEmpty(),
  body("tax_name").isString().notEmpty(),
  body("tax_type").isString().notEmpty(),
  body("rate").isFloat({ min: 0, max: 1 }),
  body("applies_to").isString().notEmpty(),
  body("effective_from").isISO8601(),
  body("effective_to").optional({ nullable: true }).isISO8601(),
  validate,
  can("settings", "create"),
  async (req, res, next) => {
    try {
      res.status(201).json(await service.createTaxRate(req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/tax-rates/:id",
  param("id").isUUID(),
  validate,
  can("settings", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.updateTaxRate(req.params.id, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  "/tax-rates/:id",
  param("id").isUUID(),
  validate,
  can("settings", "delete"),
  async (req, res, next) => {
    try {
      res.json(await service.deactivateTaxRate(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// CURRENCY RATES
// ─────────────────────────────────────────────────────────────

router.get(
  "/currency-rates",
  can("settings", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listCurrencyRates(req.query));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/currency-rates/latest",
  query("from").isString().isLength({ min: 3, max: 3 }),
  query("to").optional().isString().isLength({ min: 3, max: 3 }),
  validate,
  can("settings", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await service.getLatestRate(req.query.from, req.query.to || "NGN"),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/currency-rates",
  body("from_currency").isString().isLength({ min: 3, max: 3 }),
  body("to_currency").optional().isString().isLength({ min: 3, max: 3 }),
  body("rate").isFloat({ gt: 0 }),
  validate,
  can("settings", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.createCurrencyRate(req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// Sync Now — trigger a live fetch from exchangerate-api.com
router.post(
  "/currency-rates/sync",
  can("settings", "create"),
  async (req, res, next) => {
    try {
      const { fetchAndStoreRates } = require("../../lib/currency/rates");
      const result = await fetchAndStoreRates();
      res.json({ message: "Rates synced", ...result });
    } catch (e) {
      next(e);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// CUSTOM FIELDS
// ─────────────────────────────────────────────────────────────

router.get(
  "/custom-fields",
  can("settings", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listCustomFields(req.query));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/custom-fields",
  body("business").isString().notEmpty(),
  body("entity_type").isString().notEmpty(),
  body("field_key").isString().notEmpty(),
  body("field_label").isString().notEmpty(),
  body("field_type").isString().notEmpty(),
  validate,
  can("settings", "create"),
  async (req, res, next) => {
    try {
      res.status(201).json(await service.createCustomField(req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/custom-fields/:id",
  param("id").isUUID(),
  validate,
  can("settings", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.updateCustomField(req.params.id, req.body, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  "/custom-fields/:id",
  param("id").isUUID(),
  validate,
  can("settings", "delete"),
  async (req, res, next) => {
    try {
      res.json(await service.deleteCustomField(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// PIPELINE STAGES
// ─────────────────────────────────────────────────────────────

router.get(
  "/pipeline-stages",
  can("settings", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listPipelineStages(req.query));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/pipeline-stages",
  body("business").isString().notEmpty(),
  body("pipeline_type").isString().notEmpty(),
  body("stage_key").isString().notEmpty(),
  body("stage_label").isString().notEmpty(),
  body("display_order").optional().isInt({ min: 0 }),
  body("is_terminal").optional().isBoolean(),
  validate,
  can("settings", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.createPipelineStage(req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/pipeline-stages/:id",
  param("id").isUUID(),
  validate,
  can("settings", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.updatePipelineStage(req.params.id, req.body, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  "/pipeline-stages/:id",
  param("id").isUUID(),
  validate,
  can("settings", "delete"),
  async (req, res, next) => {
    try {
      res.json(await service.deletePipelineStage(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// DOCUMENT NUMBERING SEQUENCES
// ─────────────────────────────────────────────────────────────

router.get(
  "/document-sequences",
  can("settings", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listDocumentSequences(req.query));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/document-sequences",
  body("business").isString().notEmpty(),
  body("document_type").isString().notEmpty(),
  body("prefix").isString().notEmpty(),
  body("next_number").optional().isInt({ min: 1 }),
  body("padding").optional().isInt({ min: 1, max: 10 }),
  validate,
  can("settings", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.upsertDocumentSequence(req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/document-sequences/:id",
  param("id").isUUID(),
  body("prefix").optional().isString(),
  body("next_number").optional().isInt({ min: 1 }),
  body("padding").optional().isInt({ min: 1, max: 10 }),
  validate,
  can("settings", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.updateDocumentSequence(req.params.id, req.body, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
