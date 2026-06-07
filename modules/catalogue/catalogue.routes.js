"use strict";

const express = require("express");
const multer = require("multer");
const router = express.Router();
const { body, param, query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./catalogue.service");
const { buildTemplate, parseImportWorkbook } = require("./template");

// ─────────────────────────────────────────────────────────────
// modules/catalogue/catalogue.routes
//
// All catalogue master-data endpoints. Mounted at /api/catalogue.
// Resources:
//   - /categories                       — taxonomy
//   - /products                         — master catalogue
//   - /products/:id/images              — image gallery (multipart)
//   - /products/:id/suppliers           — cost catalogue per supplier
//   - /products/:id/barcodes            — internal barcodes
//   - /barcodes/lookup/:value           — POS scan resolver
//   - /products/:id/share-url           — customer-facing URL
//   - /locations                        — warehouses, showrooms, etc.
//
// Permissions key: "catalogue" — front-end admin manages who can
// edit. Stock managers typically view+create, owners get all
// actions. Add catalogue rows to shared.permissions or use the
// permissions admin API.
// ─────────────────────────────────────────────────────────────

// Multipart parser for image uploads. Mirrors documents.routes config —
// in-memory buffer, 10 MB cap (product images don't need bigger).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ─── CATEGORIES ──────────────────────────────────────────────

router.get("/categories", can("catalogue", "view"), async (req, res, next) => {
  try {
    res.json(await service.listCategories(req.business, req.query, req.user));
  } catch (err) {
    next(err);
  }
});

router.get(
  "/categories/:id",
  param("id").isUUID(),
  validate,
  can("catalogue", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getCategory(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/categories",
  body("name").isString().notEmpty(),
  body("parent_category_id").optional({ checkFalsy: true }).isUUID(),
  body("description").optional().isString(),
  body("display_order").optional().isInt({ min: 0 }),
  validate,
  can("catalogue", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.createCategory(req.business, req.body, req.user));
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/categories/:id",
  param("id").isUUID(),
  body("name").optional().isString(),
  body("parent_category_id").optional({ checkFalsy: true }).isUUID(),
  body("description").optional().isString(),
  body("display_order").optional().isInt({ min: 0 }),
  body("is_active").optional().isBoolean(),
  validate,
  can("catalogue", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.updateCategory(
          req.business,
          req.params.id,
          req.body,
          req.user,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/categories/:id",
  param("id").isUUID(),
  validate,
  can("catalogue", "delete"),
  async (req, res, next) => {
    try {
      res.json(
        await service.deleteCategory(req.business, req.params.id, req.user),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ─── PRODUCT IMPORT TEMPLATE ─────────────────────────────────

router.get(
  "/products/import-template",
  can("catalogue", "view"),
  async (req, res, next) => {
    try {
      const buffer = await buildTemplate();
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="orika_product_import_template.xlsx"',
      );
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  },
);

// ─── PRODUCT IMPORT (upload filled template) ─────────────────

router.post(
  "/products/import",
  upload.single("file"),
  can("catalogue", "create"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "file is required" });
      }
      const rows = await parseImportWorkbook(req.file.buffer);
      if (!rows.length) {
        return res.status(400).json({
          message:
            "No product rows found. Fill rows from row 5 of the Products sheet and try again.",
        });
      }
      const result = await service.importProducts(req.business, rows, req.user);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── PRODUCTS ────────────────────────────────────────────────

router.get(
  "/products",
  query("search").optional().isString(),
  query("category_id").optional().isUUID(),
  query("include_inactive").optional().isBoolean(),
  query("include_deleted").optional().isBoolean(),
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 200 }),
  validate,
  can("catalogue", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listProducts(req.business, req.query, req.user));
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/products/:id",
  param("id").isUUID(),
  validate,
  can("catalogue", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getProduct(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/products",
  body("sku").isString().notEmpty(),
  body("name").isString().notEmpty(),
  body("description").optional().isString(),
  body("category_id").optional({ checkFalsy: true }).isUUID(),
  body("cost_price").optional().isFloat({ min: 0 }),
  body("selling_price").optional().isFloat({ min: 0 }),
  body("min_selling_price").optional().isFloat({ min: 0 }),
  body("currency").optional().isLength({ min: 3, max: 3 }),
  body("weight_grams").optional().isFloat({ min: 0 }),
  body("custom_fields").optional().isObject(),
  body("reorder_level").optional().isInt({ min: 0 }),
  body("reorder_quantity").optional().isInt({ min: 0 }),
  // Optional storefront (web) block — Option A. When present, the
  // product is also published to the store in the same request.
  // Enum/required-field checks are enforced in the service; here we
  // only shape-check. slug/scent_family/format are mandatory when a
  // web block is sent on create — checked in the service layer.
  body("web").optional().isObject(),
  body("web.slug").optional().isString().notEmpty(),
  body("web.scent_family").optional().isString(),
  body("web.format").optional().isString(),
  body("web.size_ml").optional().isInt({ min: 1 }),
  body("web.images").optional().isArray(),
  body("web.web_description").optional().isString(),
  body("web.top_notes").optional().isArray(),
  body("web.heart_notes").optional().isArray(),
  body("web.base_notes").optional().isArray(),
  body("web.is_published").optional().isBoolean(),
  validate,
  can("catalogue", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.createProduct(req.business, req.body, req.user));
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/products/:id",
  param("id").isUUID(),
  body("name").optional().isString(),
  body("description").optional().isString(),
  body("category_id").optional({ checkFalsy: true }).isUUID(),
  body("cost_price").optional().isFloat({ min: 0 }),
  body("selling_price").optional().isFloat({ min: 0 }),
  body("min_selling_price").optional().isFloat({ min: 0 }),
  body("currency").optional().isLength({ min: 3, max: 3 }),
  body("weight_grams").optional().isFloat({ min: 0 }),
  body("barcode").optional().isString(),
  body("custom_fields").optional().isObject(),
  body("reorder_level").optional().isInt({ min: 0 }),
  body("reorder_quantity").optional().isInt({ min: 0 }),
  body("is_active").optional().isBoolean(),
  // Optional storefront (web) block — partial edits allowed on
  // update. Sending a web block for a product not yet published
  // publishes it (the service requires the full block in that case).
  body("web").optional().isObject(),
  body("web.slug").optional().isString().notEmpty(),
  body("web.scent_family").optional().isString(),
  body("web.format").optional().isString(),
  body("web.size_ml").optional().isInt({ min: 1 }),
  body("web.images").optional().isArray(),
  body("web.web_description").optional().isString(),
  body("web.top_notes").optional().isArray(),
  body("web.heart_notes").optional().isArray(),
  body("web.base_notes").optional().isArray(),
  body("web.is_published").optional().isBoolean(),
  validate,
  can("catalogue", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.updateProduct(
          req.business,
          req.params.id,
          req.body,
          req.user,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/products/:id",
  param("id").isUUID(),
  validate,
  can("catalogue", "delete"),
  async (req, res, next) => {
    try {
      res.json(
        await service.deleteProduct(req.business, req.params.id, req.user),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/products/:id/restore",
  param("id").isUUID(),
  validate,
  can("catalogue", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.restoreProduct(req.business, req.params.id, req.user),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/products/:id/share-url",
  param("id").isUUID(),
  validate,
  can("catalogue", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getProductShareUrl(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

// ─── PRODUCT IMAGES ──────────────────────────────────────────

router.get(
  "/products/:id/images",
  param("id").isUUID(),
  validate,
  can("catalogue", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listProductImages(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/products/:id/images",
  param("id").isUUID(),
  upload.single("file"),
  can("catalogue", "edit"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "file is required" });
      }
      res.status(201).json(
        await service.uploadProductImage(
          req.business,
          req.params.id,
          {
            buffer: req.file.buffer,
            originalFilename: req.file.originalname,
            mimeType: req.file.mimetype,
            altText: req.body.alt_text,
            isPrimary: req.body.is_primary === "true",
            displayOrder: parseInt(req.body.display_order || "0"),
          },
          req.user,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/images/:imageId/primary",
  param("imageId").isUUID(),
  validate,
  can("catalogue", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.setPrimaryImage(
          req.business,
          req.params.imageId,
          req.user,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/images/:imageId",
  param("imageId").isUUID(),
  body("display_order").isInt({ min: 0 }),
  validate,
  can("catalogue", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.reorderImage(
          req.business,
          req.params.imageId,
          req.body.display_order,
          req.user,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/images/:imageId",
  param("imageId").isUUID(),
  validate,
  can("catalogue", "delete"),
  async (req, res, next) => {
    try {
      res.json(
        await service.deleteProductImage(
          req.business,
          req.params.imageId,
          req.user,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ─── PRODUCT SUPPLIERS ───────────────────────────────────────

router.get(
  "/products/:id/suppliers",
  param("id").isUUID(),
  validate,
  can("catalogue", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listProductSuppliers(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/products/:id/suppliers",
  param("id").isUUID(),
  body("supplier_id").isUUID(),
  body("supplier_sku").optional().isString(),
  body("unit_cost").optional().isFloat({ min: 0 }),
  body("lead_time_days").optional().isInt({ min: 0 }),
  body("is_preferred").optional().isBoolean(),
  validate,
  can("catalogue", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.linkSupplier(
          req.business,
          req.params.id,
          req.body,
          req.user,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/products/:id/suppliers/:supplierId",
  param("id").isUUID(),
  param("supplierId").isUUID(),
  validate,
  can("catalogue", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.unlinkSupplier(
          req.business,
          req.params.id,
          req.params.supplierId,
          req.user,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ─── BARCODES ────────────────────────────────────────────────

router.get(
  "/barcodes/lookup/:value",
  param("value").isString().notEmpty(),
  validate,
  can("catalogue", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.lookupBarcode(req.business, req.params.value));
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/products/:id/barcodes",
  param("id").isUUID(),
  validate,
  can("catalogue", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listBarcodes(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/products/:id/barcodes",
  param("id").isUUID(),
  body("barcode_value").isString().notEmpty(),
  body("barcode_type").optional().isString(),
  body("is_primary").optional().isBoolean(),
  validate,
  can("catalogue", "edit"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.addBarcode(
            req.business,
            req.params.id,
            req.body,
            req.user,
          ),
        );
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/barcodes/:barcodeId",
  param("barcodeId").isUUID(),
  validate,
  can("catalogue", "delete"),
  async (req, res, next) => {
    try {
      res.json(
        await service.deleteBarcode(
          req.business,
          req.params.barcodeId,
          req.user,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ─── STOCK LOCATIONS ─────────────────────────────────────────

router.get("/locations", can("catalogue", "view"), async (req, res, next) => {
  try {
    res.json(await service.listLocations(req.business, req.query));
  } catch (err) {
    next(err);
  }
});

router.post(
  "/locations",
  body("name").isString().notEmpty(),
  body("location_type").isIn([
    "warehouse",
    "showroom",
    "pos_terminal",
    "retail_partner",
    "transit",
  ]),
  body("partner_id").optional({ checkFalsy: true }).isUUID(),
  body("address").optional().isString(),
  validate,
  can("catalogue", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.createLocation(req.business, req.body, req.user));
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/locations/:id",
  param("id").isUUID(),
  body("name").optional().isString(),
  body("address").optional().isString(),
  body("is_active").optional().isBoolean(),
  validate,
  can("catalogue", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.updateLocation(
          req.business,
          req.params.id,
          req.body,
          req.user,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/locations/:id",
  param("id").isUUID(),
  validate,
  can("catalogue", "delete"),
  async (req, res, next) => {
    try {
      res.json(
        await service.deleteLocation(req.business, req.params.id, req.user),
      );
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
