"use strict";

const logger = require("../config/logger");

module.exports = function requestLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    logger.debug({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      ms: Date.now() - start,
      user: req.user?.user_id || "anon",
      business: req.business || "-",
    });
  });
  next();
};
