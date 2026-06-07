"use strict";

const { createClient } = require("redis");
const config = require("./config");
const logger = require("./logger");

const client = createClient({ url: config.redis.url });

client.on("error", (err) => logger.error("Redis error", err));
client.on("connect", () => logger.info("Redis connected"));

(async () => {
  await client.connect();
})();

async function shutdown() {
  logger.info("Closing Redis connection...");
  await client.quit();
  logger.info("Redis closed.");
}

// ── Permission cache helpers ──────────────────────────────
// Permissions are cached for 5 minutes to avoid DB hits on every request.
const PERM_TTL = 300; // seconds

async function getCachedPermissions(roleId) {
  const raw = await client.get(`perms:${roleId}`);
  return raw ? JSON.parse(raw) : null;
}

async function cachePermissions(roleId, permissions) {
  await client.setEx(`perms:${roleId}`, PERM_TTL, JSON.stringify(permissions));
}

async function invalidatePermissionCache(roleId) {
  await client.del(`perms:${roleId}`);
}

module.exports = {
  client,
  shutdown,
  getCachedPermissions,
  cachePermissions,
  invalidatePermissionCache,
};
