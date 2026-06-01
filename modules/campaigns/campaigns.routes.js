"use strict";

const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./campaigns.service");
const storeService = require("../store/store.service");

// ─── LIST / CRUD ──────────────────────────────────────────────

router.get("/", can("campaigns", "view"), async (req, res, next) => {
  try {
    res.json(await service.list(req.business, req.query));
  } catch (err) {
    next(err);
  }
});

router.post(
  "/",
  body("campaign_name").notEmpty(),
  body("campaign_type").isIn(["email", "whatsapp"]),
  body("html_content").notEmpty(),
  validate,
  can("campaigns", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.create(req.business, req.body, req.user));
    } catch (err) {
      next(err);
    }
  },
);


// ─── SAVED SEGMENTS (must come BEFORE /:id routes) ──────

router.get("/segments", can("campaigns", "view"), async (req, res, next) => {
  try {
    res.json({ data: await service.listSegments(req.business) });
  } catch (err) {
    next(err);
  }
});

router.get(
  "/segments/:segmentId",
  param("segmentId").isUUID(),
  validate,
  can("campaigns", "view"),
  async (req, res, next) => {
    try {
      const row = await service.getSegment(req.business, req.params.segmentId);
      if (!row) return res.status(404).json({ message: "Segment not found" });
      res.json(row);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/segments/:segmentId/preview",
  param("segmentId").isUUID(),
  query("channel_type").optional().isIn(["email", "whatsapp", "auto"]),
  validate,
  can("campaigns", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await service.previewSegment(
          req.business,
          req.params.segmentId,
          req.query.channel_type,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/segments",
  body("name").isString().notEmpty(),
  body("filter").isObject(),
  body("description").optional().isString(),
  validate,
  can("campaigns", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.saveSegment(req.business, req.body, req.user));
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/segments/:segmentId",
  param("segmentId").isUUID(),
  validate,
  can("campaigns", "delete"),
  async (req, res, next) => {
    try {
      res.json(await service.deleteSegment(req.business, req.params.segmentId));
    } catch (err) {
      next(err);
    }
  },
);

// ─── NEWSLETTER SUBSCRIBERS (must come BEFORE /:id) ─────

router.get(
  "/subscribers",
  can("campaigns", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await storeService.listSubscribers({
          search: req.query.search,
          status: req.query.status,
        }),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/subscribers/export",
  can("campaigns", "view"),
  async (req, res, next) => {
    try {
      const csv = await storeService.exportSubscribersCsv({
        search: req.query.search,
        status: req.query.status,
      });
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="newsletter-subscribers.csv"',
      );
      res.send(csv);
    } catch (err) {
      next(err);
    }
  },
);

// ─── STOREFRONT ENQUIRIES (must come BEFORE /:id) ───────

router.get(
  "/enquiries",
  can("campaigns", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await storeService.listEnquiries({
          search: req.query.search,
          status: req.query.status,
          type: req.query.type,
        }),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/enquiries/:id/status",
  param("id").isUUID(),
  body("status").isIn(["new", "read", "replied", "closed"]),
  validate,
  can("campaigns", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await storeService.setEnquiryStatus(req.params.id, req.body.status),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/enquiries/:id/reply",
  param("id").isUUID(),
  body("message").notEmpty(),
  validate,
  can("campaigns", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await storeService.replyToEnquiry(
          req.params.id,
          req.body.message,
          req.user,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/:id",
  param("id").isUUID(),
  validate,
  can("campaigns", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getById(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/:id",
  param("id").isUUID(),
  validate,
  can("campaigns", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.update(req.business, req.params.id, req.body, req.user),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ─── AUDIENCE ─────────────────────────────────────────────────

// Live preview — show the user who matches the filter as they edit.
router.post(
  "/audience/preview",
  body("filter").isObject(),
  body("channel_type").optional().isIn(["email", "whatsapp", "auto"]),
  validate,
  can("campaigns", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await service.previewAudience(
          req.business,
          req.body.filter,
          req.body.channel_type,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/:id/build-audience",
  param("id").isUUID(),
  validate,
  can("campaigns", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.buildAudience(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

// Build audience from a saved segment — convenience that copies the
// segment's filter onto the campaign and runs buildAudience.
router.post(
  "/:id/build-audience-from-segment",
  param("id").isUUID(),
  body("segment_id").isUUID(),
  validate,
  can("campaigns", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.buildAudienceFromSegment(
          req.business,
          req.params.id,
          req.body.segment_id,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

// ─── SAVED SEGMENTS ───────────────────────────────────────────


// ─── SCHEDULING ───────────────────────────────────────────────

router.post(
  "/:id/schedule",
  param("id").isUUID(),
  body("scheduled_at").isISO8601(),
  validate,
  can("campaigns", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.schedule(
          req.business,
          req.params.id,
          req.body.scheduled_at,
          req.user,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/:id/send-now",
  param("id").isUUID(),
  validate,
  can("campaigns", "approve"),
  async (req, res, next) => {
    try {
      res.json(await service.sendNow(req.business, req.params.id, req.user));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/:id/cancel",
  param("id").isUUID(),
  validate,
  can("campaigns", "delete"),
  async (req, res, next) => {
    try {
      res.json(await service.cancel(req.business, req.params.id, req.user));
    } catch (err) {
      next(err);
    }
  },
);

// ─── STATS & ACTIVITY ─────────────────────────────────────────

router.get(
  "/:id/stats",
  param("id").isUUID(),
  validate,
  can("campaigns", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getStats(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/:id/recipients",
  param("id").isUUID(),
  query("status")
    .optional()
    .isIn([
      "pending",
      "sent",
      "delivered",
      "opened",
      "clicked",
      "bounced",
      "unsubscribed",
    ]),
  validate,
  can("campaigns", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await service.getRecipientActivity(req.business, req.params.id, {
          status: req.query.status,
        }),
      );
    } catch (err) {
      next(err);
    }
  },
);

// Smart-suggestion endpoint: VIPs who opened ≥2× but didn't click.
router.get(
  "/:id/follow-up-suggestions",
  param("id").isUUID(),
  validate,
  can("campaigns", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await service.getFollowUpSuggestions(req.business, req.params.id),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/:id/ab-results",
  param("id").isUUID(),
  validate,
  can("campaigns", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getAbTestResults(req.business, req.params.id));
    } catch (err) {
      next(err);
    }
  },
);

// Create an A/B variant of a campaign — child links to parent via
// parent_campaign_id. Results aggregate via the /ab-results endpoint
// when called with the parent's ID.
router.post(
  "/:id/variants",
  param("id").isUUID(),
  body("subject_line").optional().isString(),
  body("campaign_name").optional().isString(),
  body("html_content").optional().isString(),
  body("audience_filter").optional().isObject(),
  validate,
  can("campaigns", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.createVariant(
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

// ─── PUBLIC TRACKING ENDPOINTS ────────────────────────────────
// These are NOT under `protect` — they're hit by email clients
// directly. The tracking_token is the credential.

module.exports = router;
