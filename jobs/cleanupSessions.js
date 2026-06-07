"use strict";
const { pool } = require("../config/db");
const logger = require("../config/logger");

module.exports = async function cleanupSessions() {
  const r = await pool.query(
    `DELETE FROM shared.user_sessions WHERE expires_at < now()`,
  );
  const r2 = await pool.query(
    `DELETE FROM shared.refresh_tokens WHERE expires_at < now() AND revoked_at IS NOT NULL`,
  );
  logger.info(
    `Cleaned up ${r.rowCount} sessions, ${r2.rowCount} refresh tokens`,
  );
};
