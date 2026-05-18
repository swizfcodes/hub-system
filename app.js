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

const app = express();

// ── Security & parsing ────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": [
          "'self'",
          "data:",
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

// ── Logging ───────────────────────────────────────────────
app.use(requestLogger);

// ── Rate limiting (general) ───────────────────────────────
app.use("/api", rateLimiter.general);

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
const path = require("path");
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
