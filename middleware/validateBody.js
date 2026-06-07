"use strict";

const { validationResult } = require("express-validator");

module.exports = function validateBody(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      message: "Validation failed",
      errors: errors.array(),
    });
  }
  next();
};
