"use strict";

const rateLimit = require("express-rate-limit");

const general = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300, // 300 requests per minute per IP
  message: { message: "Too many requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

const webhooks = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  message: { message: "Webhook rate limit exceeded" },
});

// Tighter limiter for unauthenticated public image endpoints
const publicImages = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 2 req/sec per IP — generous for product images
  message: { message: "Too many image requests" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});

module.exports = { general, webhooks, publicImages };
