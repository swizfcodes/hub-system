"use strict";

const { pool } = require("../../config/db");
const repo = require("./audit.repository");

async function log(
  client,
  {
    userId,
    userName,
    business,
    module,
    action,
    table,
    recordId,
    before,
    after,
    metadata = {},
  },
) {
  const db = client || pool;
  try {
    await repo.insert(db, {
      userId,
      userName,
      business,
      module,
      action,
      table,
      recordId,
      before,
      after,
      metadata,
    });
  } catch (err) {
    console.error("Audit log failed (non-fatal):", err.message);
  }
}

async function getForRecord(tableName, recordId, limit = 50) {
  return repo.findForRecord(pool, { tableName, recordId, limit });
}

async function getForUser(userId, limit = 100) {
  return repo.findForUser(pool, { userId, limit });
}

module.exports = { log, getForRecord, getForUser };
