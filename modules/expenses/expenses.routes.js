"use strict";

const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./expenses.service");

router.get("/", can("expenses", "view"), async (req, res, next) => {
  try {
    res.json(
      await service.list(
        req.business,
        req.query,
        req.user,
        req.permissionScope,
      ),
    );
  } catch (e) {
    next(e);
  }
});

router.post(
  "/",
  body("category").notEmpty(),
  body("amount").isNumeric(),
  body("description").notEmpty(),
  body("expense_date").isISO8601(),
  validate,
  can("expenses", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.create(req.business, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/:id",
  param("id").isUUID(),
  validate,
  can("expenses", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getById(req.business, req.params.id));
    } catch (e) {
      next(e);
    }
  },
);
router.post(
  "/:id/approve",
  param("id").isUUID(),
  validate,
  can("expenses", "approve"),
  async (req, res, next) => {
    try {
      res.json(await service.approve(req.business, req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);
router.post(
  "/:id/reject",
  param("id").isUUID(),
  body("rejection_reason").notEmpty(),
  validate,
  can("expenses", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.reject(req.business, req.params.id, req.body, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);
router.post(
  "/:id/mark-paid",
  param("id").isUUID(),
  validate,
  can("expenses", "approve"),
  async (req, res, next) => {
    try {
      res.json(await service.markPaid(req.business, req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// Advances
router.get("/advances", can("expenses", "view"), async (req, res, next) => {
  try {
    res.json(
      await service.listAdvances(
        req.business,
        req.query,
        req.user,
        req.permissionScope,
      ),
    );
  } catch (e) {
    next(e);
  }
});
router.post(
  "/advances",
  body("purpose").notEmpty(),
  body("amount_requested").isNumeric(),
  body("reason").notEmpty(),
  validate,
  can("expenses", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.createAdvance(req.business, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);
router.post(
  "/advances/:id/approve",
  param("id").isUUID(),
  body("amount_approved").isNumeric(),
  validate,
  can("expenses", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.approveAdvance(
          req.business,
          req.params.id,
          req.body,
          req.user,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
