"use strict";

const express = require("express");
const router = express.Router();
const { verifyToken, loginRateLimiter } = require("../middleware/auth");
const { setBusinessContext } = require("../middleware/businessContext");

// Shorthand — every protected route uses both
const protect = [verifyToken, setBusinessContext];

// ── Public ────────────────────────────────────────────────
router.use("/auth", loginRateLimiter, require("../shared/auth/auth.routes"));

// ── Storefront (Orika Living) ─────────────────────────────
// Public store API — no auth (CORS-gated in app.js). Storefront
// product/scent/order management is done from the ERP itself
// (catalogue + the store admin views), so there is no separate
// store-admin route surface — web sales flow through the ERP's
// own accounting + stock path.
router.use("/store", require("../modules/store/store.public.routes"));

// ── Supplier portal (public, token-gated) ─────────────────────
router.use(
  "/purchasing/public",
  require("../modules/purchasing/purchasing.public.routes"),
);

// ── Webhooks (public but signature-verified internally) ───
router.use(
  "/webhooks/paystack",
  require("../integrations/paystack/paystack.webhook"),
);
router.use(
  "/webhooks/flutterwave",
  require("../integrations/flutterwave/flutterwave.webhook"),
);
router.use(
  "/webhooks/shopify",
  require("../integrations/shopify/shopify.webhook"),
);
// router.use(
//   "/webhooks/woocommerce",
//   require("../integrations/woocommerce/woocommerce.webhook"),
// );
router.use(
  "/webhooks/chowdeck",
  require("../integrations/logistics/logistics.webhook"),
);
router.use(
  "/webhooks/gigl",
  require("../integrations/logistics/logistics.webhook"),
);
router.use(
  "/webhooks/meta",
  require("../integrations/messaging/messaging.webhook"),
);
router.use(
  "/webhooks/whatsapp",
  require("../integrations/messaging/messaging.webhook"),
);

// ── Protected — shared modules (no business schema needed) ─
router.use("/contacts", protect, require("../shared/contacts/contacts.routes"));
router.use(
  "/documents",
  protect,
  require("../shared/documents/documents.routes"),
);
router.use(
  "/notifications",
  protect,
  require("../shared/notifications/notifications.routes"),
);
router.use("/staff", protect, require("../shared/staff/staff.routes"));
router.use(
  "/messaging",
  protect,
  require("../shared/messaging/messaging.routes"),
);
router.use("/calendar", protect, require("../shared/calendar/calendar.routes"));
router.use("/tasks", protect, require("../shared/tasks/tasks.routes"));
router.use("/audit", protect, require("../shared/audit/audit.routes"));

// ── Protected — business modules (require business context) ─
router.use("/crm", protect, require("../modules/crm/crm.routes"));
router.use("/sales", protect, require("../modules/sales/sales.routes"));
router.use(
  "/discounts",
  protect,
  require("../modules/discounts/discounts.routes"),
);
router.use("/pos", protect, require("../modules/pos/pos.routes"));
router.use(
  "/invoicing",
  protect,
  require("../modules/invoicing/invoicing.routes"),
);
router.use(
  "/accounting",
  protect,
  require("../modules/accounting/accounting.routes"),
);
router.use("/stock", protect, require("../modules/stock/stock.routes"));
router.use(
  "/purchasing",
  protect,
  require("../modules/purchasing/purchasing.routes"),
);
router.use(
  "/expenses",
  protect,
  require("../modules/expenses/expenses.routes"),
);
router.use("/payroll", protect, require("../modules/payroll/payroll.routes"));
router.use(
  "/logistics",
  protect,
  require("../modules/logistics/logistics.routes"),
);
router.use(
  "/catalogue",
  protect,
  require("../modules/catalogue/catalogue.routes"),
);
router.use(
  "/retail-partners",
  protect,
  require("../modules/retail-partners/retail-partners.routes"),
);
router.use(
  "/campaigns",
  protect,
  require("../modules/campaigns/campaigns.routes"),
);
router.use("/social", protect, require("../modules/social/social.routes"));
router.use("/loyalty", protect, require("../modules/loyalty/loyalty.routes"));
router.use(
  "/dashboards",
  protect,
  require("../modules/dashboards/dashboards.routes"),
);
router.use("/reports", protect, require("../modules/reports/reports.routes"));
router.use(
  "/security/audit",
  protect,
  require("../modules/security/audit.routes"),
);
// Permissions admin — mounted BEFORE /settings so Express matches the
// more specific path first. The router lives in shared/permissions/
// because it manages global role definitions, not per-module config.
router.use(
  "/settings/permissions",
  protect,
  require("../shared/permissions/permissions.routes"),
);
router.use(
  "/settings",
  protect,
  require("../modules/settings/settings.routes"),
);
router.use("/uploads", protect, require("../shared/upload/uploads.routes"));
module.exports = router;
