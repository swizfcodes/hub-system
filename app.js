"use strict";

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const config = require("./config/config");
const logger = require("./config/logger");
const requestLogger = require("./middleware/requestLogger");
const rateLimiter = require("./middleware/rateLimiter");
const errorHandler = require("./middleware/errorHandler");
const routes = require("./routes/index");
const path = require("path");
const app = express();

// ── Security & parsing ────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": [
          "'self'",
          "data:",
          "blob:",
          ...config.app.allowedOrigins,
          "https://i.ytimg.com",
          "https://img.youtube.com",
        ],
        "frame-src": ["'self'", "https://www.youtube.com"],
      },
    },
  }),
);

app.use(cors({ origin: config.app.allowedOrigins, credentials: true }));
app.use(compression());
// Webhook routes need the raw request body for HMAC signature
// verification (Paystack, etc.). express.json() would consume the
// stream and replace req.body with a parsed object, breaking the
// signature check — so skip JSON parsing for any /webhooks/* path
// and for the storefront's Paystack webhook. Those routers apply
// their own express.raw() internally.
const RAW_BODY_PATHS = [
  /^\/api\/webhooks\//,
  /^\/api\/store\/paystack\/webhook$/,
];
app.use((req, res, next) => {
  if (RAW_BODY_PATHS.some((re) => re.test(req.path))) return next();
  return express.json({ limit: "10mb" })(req, res, next);
});
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Uploads ─────────────────────────────────────────────
if (config.storage.driver === "local") {
  app.use(
    "/uploads",
    express.static(path.resolve(config.storage.localPath || "./uploads")),
  );
}

// ── Logging ───────────────────────────────────────────────
app.use(requestLogger);

// ── Rate limiting (general) ───────────────────────────────
app.use("/api", rateLimiter.general);
// cookieParser is already registered above — removed duplicate.

// ── Public signing routes (proof-of-delivery) — NO auth middleware ────────────
// Must be registered before /api so verifyToken is never applied.
// Mounted at BOTH /sign and /api/sign: the frontend axios client has a
// baseURL of /api, so the signing page 404-ed before the second mount.
app.use("/sign", require("./modules/logistics/sign/sign.routes"));
app.use("/api/sign", require("./modules/logistics/sign/sign.routes"));

// ── Public campaign tracking routes — NO auth middleware ─────────────────────
// Hit by email clients (open pixel, click redirect, unsubscribe links)
// with no JWT. Mounted on /api/campaigns *before* the authenticated
// /api router so the public tracking endpoints resolve first.
app.use(
  "/api/campaigns",
  require("./modules/campaigns/campaigns.public.routes"),
);

// ── Public storefront routes (sales campaigns landing pages) ─────────────────
// /c/:business/:slug — landing page, /api/c/:business/:slug/orders — checkout,
// /api/c/track/:business/:token — order tracking. Mounted BEFORE /api so the
// authenticated router never sees these requests and verifyToken is skipped.
{
  const {
    storefrontRouter,
  } = require("./modules/sales_campaigns/storefront.service");
  app.use("/api/c", storefrontRouter);
}

// ── Public file uploads (proof-of-payment from storefront) — NO auth ────────
// Rate-limited and MIME-restricted; see modules/files/files.routes.js.
app.use("/api/files", require("./modules/files/files.routes"));

// ── Routes ───────────────────────────────────────────────
app.use("/api", routes);

// ── Static PWA ───────────────────────────────────────────
// app.use(express.static("public"));

// ── Health check ─────────────────────────────────────────
app.get("/health", (req, res) =>
  res.json({ status: "ok", env: config.app.env }),
);

// ── ERP frontend (Vite + React build) ────────────────────
// The ERP frontend is served from the SAME origin as the
// API (app.orikaliving.com). The Vite client calls the API at the
// relative path `/api`, so frontend and backend are same-origin in
// production — no CORS between them.
//
// Build step (run in client/ before deploy):  npm run build
// → outputs to client/dist
//
// Order matters:
//   - this block sits AFTER `/api` routes, so API calls are never
//     shadowed by the static handler or the SPA fallback;
//   - the SPA fallback returns index.html for any non-API GET that
//     isn't a real file, so React Router owns client-side routing;
//   - the JSON 404 below now only fires for unmatched /api/* routes.
const clientDist = path.join(__dirname, "client", "dist");

app.use(express.static(clientDist));

app.get("*", (req, res, next) => {
  // Never let the SPA fallback answer an API request — an unknown
  // /api route must still return the JSON 404 below, not index.html.
  if (req.path.startsWith("/api") || req.path === "/health") {
    return next();
  }
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    // If the build is missing (client/dist not built yet) fall
    // through to the 404 rather than crashing the request.
    if (err) next();
  });
});

// ── 404 ──────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: "Route not found" }));

// ── Error handler ─────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
