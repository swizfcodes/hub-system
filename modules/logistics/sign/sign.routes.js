"use strict";

const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const validate = require("../../../middleware/validateBody");
const service = require("./sign.service");

// GET /sign/:token — public delivery info for the signing page
router.get("/:token", async (req, res, next) => {
  try {
    const data = await service.getSigningInfo(req.params.token);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /sign/:token — submit both signatures and mark delivered
router.post(
  "/:token",
  body("customer_signature").isString().notEmpty(),
  body("driver_signature").isString().notEmpty(),
  body("customer_name").optional().isString(),
  body("driver_name").optional().isString(),
  validate,
  async (req, res, next) => {
    try {
      res.json(await service.submitSignatures(req.params.token, req.body));
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
