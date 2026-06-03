"use strict";

const businesses = require("../config/businesses");

// ── setBusinessContext ────────────────────────────────────
// Validates the business from the JWT and attaches it to req.
// businessContext must run AFTER verifyToken.
// The actual SET LOCAL search_path is done inside
// withBusinessContext() in db.js — not here.
// This middleware just validates and exposes req.business
// so routes can call withBusinessContext(req.business, ...).
//
// Validation uses the dynamic cache (config/businesses), which is
// populated from shared.business_config at boot and refreshed when
// businesses are added/deactivated. Synchronous read — safe on the
// hot path.
function setBusinessContext(req, res, next) {
  // --- PUBLIC ROUTE BYPASS ---
  // Allow unauthenticated public images to pass without a business context
  if (
    req.method === "GET" &&
    req.originalUrl.match(/\/api\/documents\/[0-9a-fA-F-]+\/image/)
  ) {
    return next();
  }
  // ---------------------------

  const business = req.headers["x-business-line"] || req.user?.current_business;
  const activeList = businesses.getActiveBusinesses();

  if (!business || !businesses.isValidBusiness(business)) {
    return res.status(400).json({
      message: `Invalid or missing business context. Must be one of: ${activeList.join(", ")}`,
    });
  }

  // Verify user is permitted to access this business
  // (Safe to access req.user here because the public route bypass returned early if no auth was required)
  if (!req.user.permitted_businesses.includes(business)) {
    return res.status(403).json({
      message: `You do not have access to the ${business} business`,
    });
  }

  req.business = business;
  next();
}

module.exports = { setBusinessContext };
