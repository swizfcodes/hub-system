"use strict";

const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./crm.service");

// GET /api/crm/deals
router.get("/deals", can("crm", "view"), async (req, res, next) => {
  try {
    res.json(await service.listDeals(req.business, req.query, req.user));
  } catch (err) {
    next(err);
  }
});

// POST /api/crm/deals
router.post(
  "/deals",
  body("contact_id").isUUID(),
  body("title").notEmpty(),
  body("stage").notEmpty(),
  validate,
  can("crm", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.createDeal(req.business, req.body, req.user));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/crm/deals/:id
router.get(
  "/deals/:id",
  param("id").isUUID(),
  validate,
  can("crm", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getDeal(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /api/crm/deals/:id
router.patch(
  "/deals/:id",
  param("id").isUUID(),
  validate,
  can("crm", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.updateDeal(
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

// PATCH /api/crm/deals/:id/stage
router.patch(
  "/deals/:id/stage",
  param("id").isUUID(),
  body("stage").notEmpty(),
  validate,
  can("crm", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.moveDealStage(
          req.business,
          req.params.id,
          req.body.stage,
          req.user,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/crm/deals/:id/activities
router.post(
  "/deals/:id/activities",
  param("id").isUUID(),
  body("activity_type").notEmpty(),
  body("summary").notEmpty(),
  validate,
  can("crm", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.logActivity(
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

// GET /api/crm/pipeline — board view grouped by stage
router.get("/pipeline", can("crm", "view"), async (req, res, next) => {
  try {
    res.json(
      await service.getPipeline(req.business, req.user, req.permissionScope),
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/crm/deals/:id/notes
router.get(
  "/deals/:id/notes",
  param("id").isUUID(),
  validate,
  can("crm", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getNotes(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/crm/deals/:id/notes
router.post(
  "/deals/:id/notes",
  param("id").isUUID(),
  body("content").notEmpty(),
  validate,
  can("crm", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.addNote(
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

// ─── CUSTOMER PREFERENCES ────────────────────────────────────
//   GET    /crm/contacts/:contactId/preferences
//   POST   /crm/contacts/:contactId/preferences   (upsert by key)
//   PATCH  /crm/preferences/:id
//   DELETE /crm/preferences/:id

router.get(
  "/contacts/:contactId/preferences",
  param("contactId").isUUID(),
  validate,
  can("crm", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await service.listPreferences(req.business, req.params.contactId),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/contacts/:contactId/preferences",
  param("contactId").isUUID(),
  body("preference_key").isString().notEmpty(),
  body("preference_value").isString().notEmpty(),
  body("notes").optional().isString(),
  validate,
  can("crm", "edit"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.setPreference(
            req.business,
            req.params.contactId,
            req.body,
            req.user,
          ),
        );
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/preferences/:id",
  param("id").isUUID(),
  body("preference_value").optional().isString(),
  body("notes").optional().isString(),
  validate,
  can("crm", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.updatePreference(
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

router.delete(
  "/preferences/:id",
  param("id").isUUID(),
  validate,
  can("crm", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.deletePreference(req.business, req.params.id, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

// ─── CUSTOMER MILESTONES ─────────────────────────────────────
//   GET    /crm/contacts/:contactId/milestones
//   POST   /crm/contacts/:contactId/milestones
//   PATCH  /crm/milestones/:id
//   DELETE /crm/milestones/:id

router.get(
  "/contacts/:contactId/milestones",
  param("contactId").isUUID(),
  validate,
  can("crm", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await service.listMilestones(req.business, req.params.contactId),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/contacts/:contactId/milestones",
  param("contactId").isUUID(),
  body("milestone_type").isIn([
    "birthday",
    "wedding_anniversary",
    "business_anniversary",
    "graduation",
    "other",
  ]),
  body("milestone_date").isISO8601(),
  body("notes").optional().isString(),
  validate,
  can("crm", "edit"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.addMilestone(
            req.business,
            req.params.contactId,
            req.body,
            req.user,
          ),
        );
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/milestones/:id",
  param("id").isUUID(),
  body("milestone_type")
    .optional()
    .isIn([
      "birthday",
      "wedding_anniversary",
      "business_anniversary",
      "graduation",
      "other",
    ]),
  body("milestone_date").optional().isISO8601(),
  body("notes").optional().isString(),
  validate,
  can("crm", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.updateMilestone(
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

router.delete(
  "/milestones/:id",
  param("id").isUUID(),
  validate,
  can("crm", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.deleteMilestone(req.business, req.params.id, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

// ─── CONTACT TAGS ────────────────────────────────────────────
//   GET    /crm/contacts/:contactId/tags
//   POST   /crm/contacts/:contactId/tags
//   DELETE /crm/tags/:id

router.get(
  "/contacts/:contactId/tags",
  param("contactId").isUUID(),
  validate,
  can("crm", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listTags(req.business, req.params.contactId));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/contacts/:contactId/tags",
  param("contactId").isUUID(),
  body("tag_name").isString().notEmpty(),
  body("colour").optional().isString(),
  validate,
  can("crm", "edit"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.addTag(
            req.business,
            req.params.contactId,
            req.body,
            req.user,
          ),
        );
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  "/tags/:id",
  param("id").isUUID(),
  validate,
  can("crm", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.removeTag(req.business, req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
