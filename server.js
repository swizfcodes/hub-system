"use strict";

const app = require("./app");
const config = require("./config/config");
const { shutdown: dbShutdown } = require("./config/db");
const { shutdown: redisShutdown } = require("./config/redis");
const { init: initSockets } = require("./config/sockets");
const businesses = require("./config/businesses");
const logger = require("./config/logger");
const jobRunner = require("./jobs/index");
const http = require("http");

const server = http.createServer(app);

// init() handles Redis failures internally (in-memory fallback), but a
// rejection here must never become an unhandled promise rejection —
// realtime is optional, the API must boot regardless.
initSockets(server).catch((err) =>
  logger.error("Socket.io initialisation failed — realtime disabled", err),
);

// Load the active business list BEFORE the listener binds. Hot-path
// validators (db.js withBusinessContext, middleware/businessContext,
// shared/auth/switchBusiness, config/sockets) read from this cache
// synchronously — if it's empty when the first request lands, every
// request to a business schema route fails with "Invalid business".
//
// loadActiveBusinesses falls back to config.app.businesses if the DB
// is unreachable at boot, so this never blocks startup indefinitely.
async function start() {
  await businesses.loadActiveBusinesses();
  jobRunner.start();

  // Pre-render footer social icons for email templates (Gmail strips
  // data: URIs, so icons must exist as hosted files). Best-effort —
  // footers fall back to text links until the files exist.
  require("./lib/email/assets")
    .ensureSocialIcons()
    .catch((err) => logger.warn(`Email asset warm-up failed: ${err.message}`));

  server.listen(config.app.port, () => {
    logger.info(
      `🚀 Hub server running on http://localhost:${config.app.port} [${config.app.env}]`,
    );
  });
}

start().catch((err) => {
  logger.error("Startup failed", err);
  process.exit(1);
});

async function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);
  jobRunner.stop();
  server.close(async () => {
    try {
      await dbShutdown();
      await redisShutdown();
      logger.info("All connections closed.");
      process.exit(0);
    } catch (err) {
      logger.error("Shutdown error", err);
      process.exit(1);
    }
  });
  setTimeout(() => process.exit(1), 10_000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", err);
  shutdown("uncaughtException");
});
process.on("unhandledRejection", (err) => {
  logger.error("Unhandled rejection", err);
  shutdown("unhandledRejection");
});
