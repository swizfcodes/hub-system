"use strict";

const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./help.service");

// ── Public (any authenticated user) ─────────────────────────

// GET /api/help/articles?module=crm&type=faq
router.get("/articles", async (req, res, next) => {
  try {
    const data = await service.listArticles(req.query);
    res.json({ data });
  } catch (e) {
    next(e);
  }
});

// GET /api/help/modules — list modules that have articles
router.get("/modules", async (req, res, next) => {
  try {
    const data = await service.listModules();
    res.json({ data });
  } catch (e) {
    next(e);
  }
});

// GET /api/help/articles/:id
router.get(
  "/articles/:id",
  param("id").isUUID(),
  validate,
  async (req, res, next) => {
    try {
      res.json(await service.getArticle(req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

// ── Admin (create/edit/delete) ───────────────────────────────

router.post(
  "/articles",
  can("help", "create"),
  body("module").isString().notEmpty(),
  body("title").isString().notEmpty(),
  body("content").optional().isString(),
  body("article_type").optional().isIn(["guide", "faq", "workflow"]),
  body("display_order").optional().isInt(),
  body("is_published").optional().isBoolean(),
  validate,
  async (req, res, next) => {
    try {
      res.status(201).json(await service.createArticle(req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.put(
  "/articles/:id",
  can("help", "edit"),
  param("id").isUUID(),
  body("module").optional().isString(),
  body("title").optional().isString(),
  body("content").optional().isString(),
  body("article_type").optional().isIn(["guide", "faq", "workflow"]),
  body("display_order").optional().isInt(),
  body("is_published").optional().isBoolean(),
  validate,
  async (req, res, next) => {
    try {
      res.json(await service.updateArticle(req.params.id, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  "/articles/:id",
  can("help", "delete"),
  param("id").isUUID(),
  validate,
  async (req, res, next) => {
    try {
      res.json(await service.deleteArticle(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
