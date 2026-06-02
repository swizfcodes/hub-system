"use strict";

const jwt = require("jsonwebtoken");
const config = require("../config/config");
const { withSharedContext } = require("../config/db");
const { getCachedPermissions, cachePermissions } = require("../config/redis");

// ── verifyToken ───────────────────────────────────────────
// Validates JWT, checks it hasn't been revoked, attaches
// user context to req. Must run before businessContext.
const { publicImages: imageRateLimiter } = require("./rateLimiter");

async function verifyToken(req, res, next) {
  try {
    // --- PUBLIC ROUTE BYPASS ---
    // Allow unauthenticated GET requests to the product image endpoint.
    // Only serves document_type = product_image (enforced in the route handler).
    // Rate-limited by imageRateLimiter to prevent enumeration abuse.
    if (
      req.method === "GET" &&
      req.originalUrl.match(/\/api\/documents\/[0-9a-fA-F-]+\/image/)
    ) {
      return imageRateLimiter(req, res, next);
    }
    // ---------------------------

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, config.app.jwtSecret);

    // Check token hasn't been revoked (DB lookup — cached in Redis per session)
    await withSharedContext(async (client) => {
      // Join user_roles + roles to pull role_name in one query.
      // role_name is needed by downstream route guards (e.g. admin session
      // management) without an extra DB round-trip.
      const result = await client.query(
        `SELECT u.user_id, u.is_active, u.permitted_businesses, u.default_business,
                r.role_name
         FROM shared.users u
         LEFT JOIN shared.user_roles ur ON ur.user_id = u.user_id
         LEFT JOIN shared.roles r       ON r.role_id  = ur.role_id
         WHERE u.user_id = $1 AND u.is_active = true
         LIMIT 1`,
        [decoded.user_id],
      );

      if (!result.rows.length) {
        throw Object.assign(new Error("User not found or inactive"), {
          status: 401,
        });
      }

      const user = result.rows[0];
      req.user = {
        user_id: decoded.user_id,
        role_id: decoded.role_id,
        role_name: user.role_name || null,
        current_business: decoded.current_business || user.default_business,
        permitted_businesses: user.permitted_businesses,
        session_id: decoded.jti,
      };
    });

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired" });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token" });
    }
    return res.status(err.status || 401).json({ message: err.message });
  }
}

// ── loginRateLimiter ──────────────────────────────────────
// Used only on POST /auth/login — separate from general limiter
const rateLimit = require("express-rate-limit");
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP
  message: { message: "Too many login attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { verifyToken, loginRateLimiter };
