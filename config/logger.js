"use strict";

const { createLogger, format, transports } = require("winston");
const config = require("./config");

const logger = createLogger({
  level: config.app.env === "production" ? "info" : "debug",
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    config.app.env === "production"
      ? format.json()
      : format.combine(format.colorize(), format.simple()),
  ),
  transports: [
    new transports.Console(),
    ...(config.app.env === "production"
      ? [
          new transports.File({ filename: "logs/error.log", level: "error" }),
          new transports.File({ filename: "logs/combined.log" }),
        ]
      : []),
  ],
});

module.exports = logger;
