"use strict";

async function insert(
  db,
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
    metadata,
  },
) {
  await db.query(
    `INSERT INTO shared.audit_log
       (user_id, user_name, business, module, action, table_name, record_id,
        before_state, after_state, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      userId || null,
      userName || "system",
      business,
      module,
      action,
      table || null,
      recordId || null,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      JSON.stringify(metadata),
    ],
  );
}

async function findForRecord(pool, { tableName, recordId, limit }) {
  const { rows } = await pool.query(
    `SELECT log_id, occurred_at, user_name, action, before_state, after_state FROM shared.audit_log WHERE table_name = $1 AND record_id = $2 ORDER BY occurred_at DESC LIMIT $3`,
    [tableName, recordId, limit],
  );
  return rows;
}

async function findForUser(pool, { userId, limit }) {
  const { rows } = await pool.query(
    `SELECT log_id, occurred_at, business, module, action, table_name, record_id FROM shared.audit_log WHERE user_id = $1 ORDER BY occurred_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

module.exports = { insert, findForRecord, findForUser };
