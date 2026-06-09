"use strict";

const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./sales.service");

// ─── Quotations ──────────────────────────────────────────────────────────────

router.get("/quotations", can("sales", "view"), async (req, res, next) => {
  try {
    res.json(
      await service.listQuotations(
        req.business,
        req.query,
        req.user,
        req.permissionScope,
      ),
    );
  } catch (err) {
    next(err);
  }
});

router.post(
  "/quotations",
  body("contact_id").isUUID(),
  body("valid_until").isISO8601(),
  body("lines").isArray({ min: 1 }),
  validate,
  can("sales", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.createQuotation(req.business, req.body, req.user));
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/quotations/:id",
  param("id").isUUID(),
  validate,
  can("sales", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getQuotation(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/quotations/:id",
  param("id").isUUID(),
  validate,
  can("sales", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.updateQuotation(
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

router.post(
  "/quotations/:id/send",
  param("id").isUUID(),
  validate,
  can("sales", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.sendQuotation(
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

router.post(
  "/quotations/:id/confirm",
  param("id").isUUID(),
  validate,
  can("sales", "approve"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.confirmQuotation(req.business, req.params.id, req.user),
        );
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/quotations/:id/cancel",
  param("id").isUUID(),
  validate,
  can("sales", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.cancelQuotation(req.business, req.params.id, req.user),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/quotations/:id/pdf",
  param("id").isUUID(),
  validate,
  can("sales", "view"),
  async (req, res, next) => {
    try {
      const pdf = await service.generateQuotationPDF(
        req.business,
        req.params.id,
      );
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
      });
      res.send(pdf);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Sales KPIs ───────────────────────────────────────────────────────────────

router.get("/kpis", can("sales", "view"), async (req, res, next) => {
  try {
    res.json(await service.getSalesKpis(req.business));
  } catch (err) {
    next(err);
  }
});

// ─── Direct Order (Quick Sale) ────────────────────────────────────────────────

router.post(
  "/orders",
  body("contact_id").isUUID(),
  body("lines").isArray({ min: 1 }),
  body("payments").isArray({ min: 1 }),
  body("fulfilment_type").optional().isIn(["walk_in", "delivery"]),
  body("currency").optional().isString().isLength({ min: 3, max: 3 }),
  body("exchange_rate").optional().isFloat({ gt: 0 }),
  body("apply_vat").optional().isBoolean(),
  body("delivery_address").optional().isString(),
  body("courier_preference").optional().isIn(["chowdeck", "gigl", "manual"]),
  validate,
  can("sales", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.createDirectOrder(req.business, req.body, req.user));
    } catch (err) {
      next(err);
    }
  },
);

// ─── Orders ───────────────────────────────────────────────────────────────────

router.get("/orders", can("sales", "view"), async (req, res, next) => {
  try {
    res.json(await service.listOrders(req.business, req.query));
  } catch (err) {
    next(err);
  }
});

router.get(
  "/orders/:id",
  param("id").isUUID(),
  validate,
  can("sales", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getOrder(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/sales/orders/:id/invoice — generate invoice from confirmed order
router.post(
  "/orders/:id/invoice",
  param("id").isUUID(),
  body("due_date").isISO8601(),
  body("payment_instructions").optional().isString(),
  validate,
  can("sales", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.generateInvoiceFromOrder(
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

// POST /api/sales/orders/:id/dispatch — hand to logistics
router.post(
  "/orders/:id/dispatch",
  param("id").isUUID(),
  body("delivery_address").notEmpty(),
  body("courier_preference").isIn(["chowdeck", "gigl", "manual"]),
  validate,
  can("sales", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.handToLogistics(
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

router.post(
  "/orders/:id/cancel",
  param("id").isUUID(),
  validate,
  can("sales", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.cancelOrder(req.business, req.params.id, req.user),
      );
    } catch (err) {
      next(err);
    }
  },
);

// Approve campaign proof from the unified Orders list.
// Finds the linked campaign_order via hub_order_id and triggers
// the same confirmation flow as the Sales Campaigns module.
router.post(
  "/orders/:id/approve-proof",
  param("id").isUUID(),
  validate,
  can("sales", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.approveCampaignProof(req.business, req.params.id, req.user),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ─── Receipts ─────────────────────────────────────────────────────────────────

router.get("/receipts", can("sales", "view"), async (req, res, next) => {
  try {
    res.json(await service.listReceipts(req.business, req.query));
  } catch (err) {
    next(err);
  }
});

router.get(
  "/receipts/:id",
  param("id").isUUID(),
  validate,
  can("sales", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getReceipt(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/receipts/:id/pdf",
  param("id").isUUID(),
  validate,
  can("sales", "view"),
  async (req, res, next) => {
    try {
      const pdf = await service.generateReceiptPDF(req.business, req.params.id);
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
      });
      res.send(pdf);
    } catch (err) {
      next(err);
    }
  },
);

// ─── Discount approvals ───────────────────────────────────────────────────────

router.get(
  "/discount-approvals",
  can("sales", "approve"),
  async (req, res, next) => {
    try {
      res.json(await service.listDiscountApprovals(req.business, req.query));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/discount-approvals/:id/approve",
  param("id").isUUID(),
  body("notes").optional().isString(),
  validate,
  can("sales", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.approveDiscount(
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

router.post(
  "/discount-approvals/:id/reject",
  param("id").isUUID(),
  body("notes").notEmpty(),
  validate,
  can("sales", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.rejectDiscount(
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

module.exports = router;
