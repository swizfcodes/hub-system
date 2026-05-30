"use strict";

const jwt = require("jsonwebtoken");
const config = require("../config/config");
const { withSharedContext } = require("../config/db");
const { getCachedPermissions, cachePermissions } = require("../config/redis");

// ── verifyToken ───────────────────────────────────────────
// Validates JWT, checks it hasn't been revoked, attaches
// user context to req. Must run before businessContext.
async function verifyToken(req, res, next) {
  try {
    // --- PUBLIC ROUTE BYPASS ---
    // Allow unauthenticated GET requests to the product image endpoint
    if (req.method === 'GET' && req.originalUrl.match(/\/api\/documents\/[0-9a-fA-F-]+\/image/)) {
      return next();
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
      const result = await client.query(
        `SELECT u.user_id, u.is_active, u.permitted_businesses, u.default_business
         FROM shared.users u
         WHERE u.user_id = $1 AND u.is_active = true`,
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