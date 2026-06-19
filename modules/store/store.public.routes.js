"use strict";

const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { general } = require("../../middleware/rateLimiter");
const logger = require("../../config/logger");
const service = require("./store.service");

// ─────────────────────────────────────────────────────────────
// modules/store/store.public.routes — mounted at /api/store
//
// PUBLIC endpoints — no authentication. The Orika Living storefront
// (Next.js, separate origin) calls these. CORS is handled globally
// in app.js from ALLOWED_ORIGINS.
//
// The general rate limiter is applied to the whole router; the
// checkout and newsletter POSTs additionally lean on it to blunt
// abuse (the storefront's old Supabase rate_limits table is
// replaced by this + Redis-backed limiting at the infra layer).
// ─────────────────────────────────────────────────────────────

router.use(general);

// ── Products ─────────────────────────────────────────────────

router.get("/products", async (req, res, next) => {
  try {
    res.json(await service.getActiveProducts());
  } catch (e) {
    next(e);
  }
});

router.get(
  "/products/featured",
  query("format").isString(),
  query("limit").optional().isInt({ min: 1, max: 24 }),
  validate,
  async (req, res, next) => {
    try {
      res.json(
        await service.getFeaturedProducts(req.query.format, req.query.limit),
      );
    } catch (e) {
      next(e);
    }
  },
);

// :slug routes come AFTER /products/featured so "featured" isn't
// swallowed as a slug.
router.get(
  "/products/:slug",
  param("slug").isString(),
  validate,
  async (req, res, next) => {
    try {
      res.json(await service.getProductBySlug(req.params.slug));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/products/:slug/related",
  param("slug").isString(),
  query("family").isString(),
  query("exclude").isUUID(),
  query("limit").optional().isInt({ min: 1, max: 12 }),
  validate,
  async (req, res, next) => {
    try {
      res.json(
        await service.getRelatedProducts(
          req.query.family,
          req.query.exclude,
          req.query.limit,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

// ── Scents ───────────────────────────────────────────────────

router.get("/scents", async (req, res, next) => {
  try {
    res.json(await service.getScents());
  } catch (e) {
    next(e);
  }
});

router.get(
  "/scents/:slug",
  param("slug").isString(),
  validate,
  async (req, res, next) => {
    try {
      res.json(await service.getScentBySlug(req.params.slug));
    } catch (e) {
      next(e);
    }
  },
);

router.get("/signatures", async (req, res, next) => {
  try {
    res.json(await service.getSignatures());
  } catch (e) {
    next(e);
  }
});

// ── Settings (storefront content) ────────────────────────────

router.get("/settings", async (req, res, next) => {
  try {
    res.json(await service.getSettings());
  } catch (e) {
    next(e);
  }
});

// Public delivery rate card — lets the checkout preview the delivery fee.
router.get("/delivery-rate-card", async (req, res, next) => {
  try {
    res.json(await service.getDeliveryRateCard());
  } catch (e) {
    next(e);
  }
});

// ── Orders / checkout ────────────────────────────────────────

router.post(
  "/orders",
  body("delivery_address").isObject(),
  body("delivery_address.full_name").isString().notEmpty(),
  body("delivery_address.phone").isString().notEmpty(),
  body("delivery_address.email").isEmail(),
  body("delivery_address.street").isString().notEmpty(),
  body("delivery_address.city").isString().notEmpty(),
  body("delivery_address.state").isString().notEmpty(),
  body("items").isArray({ min: 1 }),
  body("items.*.product_id").isUUID(),
  body("items.*.quantity").isInt({ min: 1 }),
  body("payment_method").optional().isIn(["paystack", "optimus_pay"]),
  validate,
  async (req, res, next) => {
    try {
      res.status(201).json(await service.createOrder(req.body));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/orders/:id",
  param("id").isUUID(),
  validate,
  async (req, res, next) => {
    try {
      res.json(await service.getOrder(req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

// ── Paystack ─────────────────────────────────────────────────

// Webhook — Paystack server-to-server. Needs the RAW body for HMAC
// verification, so express.raw is applied just on this route.
router.post(
  "/paystack/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const signature = req.headers["x-paystack-signature"];
      if (!service.verifyWebhookSignature(req.body, signature)) {
        logger.warn("[store] paystack webhook — bad signature");
        return res.status(401).json({ message: "Invalid signature" });
      }
      const payload = JSON.parse(req.body.toString());

      // Only charge.success drives fulfilment. Other events are ack'd.
      if (payload.event === "charge.success") {
        const reference = payload.data?.reference;
        if (reference) {
          await service.verifyAndFulfil(reference);
        }
      }
      // Always 200 quickly so Paystack doesn't retry a handled event.
      res.json({ received: true });
    } catch (err) {
      logger.error(`[store] paystack webhook error: ${err.message}`);
      // Still 200 — a 500 makes Paystack retry; the error is logged
      // and the verify endpoint is the fallback path.
      res.json({ received: true });
    }
  },
);

// Client-initiated verify — the storefront calls this on the Paystack
// callback page. Idempotent with the webhook.
router.get(
  "/paystack/verify",
  query("reference").isString().notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      res.json(await service.verifyAndFulfil(req.query.reference));
    } catch (e) {
      next(e);
    }
  },
);

// ── Optimus Pay ──────────────────────────────────────────────

// Client-initiated status poll — the storefront calls this while the
// customer completes a bank transfer. READ-ONLY: it only reports whether
// the order has been marked paid. Fulfilment happens exclusively in the
// Optimus webhook, which proves the inflow actually landed — the client
// must never be able to confirm a payment that hasn't happened.
router.get(
  "/optimus/verify",
  query("transaction_ref").isString().notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      res.json(await service.getOptimusOrderStatus(req.query.transaction_ref));
    } catch (e) {
      next(e);
    }
  },
);

// ── Newsletter ───────────────────────────────────────────────

router.post(
  "/newsletter/subscribe",
  body("email").isEmail(),
  body("source").optional().isString(),
  validate,
  async (req, res, next) => {
    try {
      res.json(
        await service.subscribeNewsletter({
          email: req.body.email,
          source: req.body.source,
        }),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/newsletter/unsubscribe",
  body("token").isUUID(),
  validate,
  async (req, res, next) => {
    try {
      res.json(await service.unsubscribeNewsletter(req.body.token));
    } catch (e) {
      next(e);
    }
  },
);

// ── Enquiries ────────────────────────────────────────────────

router.post(
  "/enquiries",
  body("name").isString().notEmpty(),
  body("email").isEmail(),
  body("phone").isString().notEmpty(),
  body("type").isString(),
  body("message").isString().notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      res.status(201).json(await service.submitEnquiry(req.body));
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
