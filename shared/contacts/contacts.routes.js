"use strict";

const express = require("express");
const router = express.Router();
const { body, query, param } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./contacts.service");

// GET /api/contacts?search=&type=&page=&limit=
router.get("/", can("crm", "view"), async (req, res, next) => {
  try {
    const result = await service.list(
      { ...req.query, business: req.business },
      req.user,
      req.hiddenFields,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/contacts/:id
router.get(
  "/:id",
  param("id").isUUID(),
  validate,
  can("crm", "view"),
  async (req, res, next) => {
    try {
      const contact = await service.getById(req.params.id, req.hiddenFields);
      if (!contact)
        return res.status(404).json({ message: "Contact not found" });
      res.json(contact);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/contacts
router.post(
  "/",
  body("display_name").notEmpty().trim(),
  body("primary_phone").notEmpty(),
  body("contact_type").isArray(),
  validate,
  can("crm", "create"),
  async (req, res, next) => {
    try {
      const contact = await service.create(req.body, req.user);
      res.status(201).json(contact);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/contacts/:id
router.patch(
  "/:id",
  param("id").isUUID(),
  validate,
  can("crm", "edit"),
  async (req, res, next) => {
    try {
      const contact = await service.update(req.params.id, req.body, req.user);
      res.json(contact);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/contacts/:id (soft delete)
router.delete(
  "/:id",
  param("id").isUUID(),
  validate,
  can("crm", "delete"),
  async (req, res, next) => {
    try {
      await service.softDelete(req.params.id, req.user);
      res.json({ message: "Contact deleted" });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/contacts/:id/timeline — activities, notes, invoices, deals
router.get(
  "/:id/timeline",
  param("id").isUUID(),
  validate,
  can("crm", "view"),
  async (req, res, next) => {
    try {
      const timeline = await service.getTimeline(req.params.id, req.business);
      res.json(timeline);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/contacts/:id/addresses
router.post(
  "/:id/addresses",
  param("id").isUUID(),
  body("line1").notEmpty(),
  body("city").notEmpty(),
  validate,
  can("crm", "edit"),
  async (req, res, next) => {
    try {
      const address = await service.addAddress(
        req.params.id,
        req.body,
        req.user,
      );
      res.status(201).json(address);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
