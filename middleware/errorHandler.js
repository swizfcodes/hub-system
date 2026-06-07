"use strict";

const logger = require("../config/logger");

function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal server error";

  if (status >= 500) {
    logger.error({
      message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      user: req.user?.user_id,
    });
  }

  res.status(status).json({
    message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
}

module.exports = errorHandler;
