"use strict";

const loyaltyService = require("../modules/loyalty/loyalty.service");
const logger = require("../config/logger");
const businesses = require("../config/businesses");

module.exports = async function expireLoyaltyPoints() {
  const active = businesses.getActiveBusinesses();
  for (const business of active) {
    try {
      const { expired } = await loyaltyService.expirePoints(business);
      if (expired > 0) {
        logger.info(
          `[loyalty:expiry] ${expired} point row(s) expired for "${business}"`,
        );
      }
    } catch (err) {
      logger.error(`[loyalty:expiry] failed for "${business}"`, err);
    }
  }
};
