"use strict";

// ─────────────────────────────────────────────────────────────
// modules/discounts/discounts.repository
//
// SQL for the discounts table — the per-business catalogue of
// reusable promotion rules (percentage or fixed-amount), each with
// an optional validity window, usage cap, and minimum order value.
//
// Distinct from discount_approvals (the POS/quote floor-price
// override workflow) — that lives in the pos module. This module
// owns the promotions catalogue only.
// ─────────────────────────────────────────────────────────────

async function list(client, { activeOnly = false, validNow = false } = {}) {
  const where = [];
  if (activeOnly) where.push("is_active = true");
  if (validNow) {
    where.push("(valid_from IS NULL OR valid_from <= CURRENT_DATE)");
    where.push("(valid_to IS NULL OR valid_to >= CURRENT_DATE)");
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await client.query(
    `SELECT discount_id, discount_name, discount_type, value, applies_to,
            valid_from, valid_to, min_order_value, usage_limit, usage_count,
            is_active, created_by, created_at
     FROM discounts
     ${whereClause}
     ORDER BY created_at DESC`,
  );
  return rows;
}

async function findById(client, discountId) {
  const {
    rows: [row],
  } = await client.query(`SELECT * FROM discounts WHERE discount_id = $1`, [
    discountId,
  ]);
  return row || null;
}

async function findByName(client, name) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT discount_id FROM discounts WHERE lower(discount_name) = lower($1)`,
    [name],
  );
  return row || null;
}

async function insert(
  client,
  {
    discountName,
    discountType,
    value,
    appliesTo,
    validFrom,
    validTo,
    minOrderValue,
    usageLimit,
    createdBy,
  },
) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO discounts
       (discount_name, discount_type, value, applies_to,
        valid_from, valid_to, min_order_value, usage_limit, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      discountName,
      discountType,
      value,
      appliesTo || "all",
      validFrom || null,
      validTo || null,
      minOrderValue || null,
      usageLimit || null,
      createdBy || null,
    ],
  );
  return row;
}

async function update(client, discountId, fields) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE discounts SET
       discount_name   = COALESCE($2, discount_name),
       discount_type   = COALESCE($3, discount_type),
       value           = COALESCE($4, value),
       applies_to      = COALESCE($5, applies_to),
       valid_from      = COALESCE($6, valid_from),
       valid_to        = COALESCE($7, valid_to),
       min_order_value = COALESCE($8, min_order_value),
       usage_limit     = COALESCE($9, usage_limit),
       is_active       = COALESCE($10, is_active)
     WHERE discount_id = $1
     RETURNING *`,
    [
      discountId,
      fields.discountName ?? null,
      fields.discountType ?? null,
      fields.value ?? null,
      fields.appliesTo ?? null,
      fields.validFrom ?? null,
      fields.validTo ?? null,
      fields.minOrderValue ?? null,
      fields.usageLimit ?? null,
      fields.isActive ?? null,
    ],
  );
  return row || null;
}

async function softDelete(client, discountId) {
  const { rowCount } = await client.query(
    `UPDATE discounts SET is_active = false WHERE discount_id = $1`,
    [discountId],
  );
  return rowCount > 0;
}

/**
 * Atomically increment usage_count when a discount is applied. Returns
 * the updated row, or null if the usage_limit would be exceeded — the
 * caller treats null as "discount exhausted".
 */
async function incrementUsage(client, discountId) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE discounts
     SET usage_count = usage_count + 1
     WHERE discount_id = $1
       AND is_active = true
       AND (usage_limit IS NULL OR usage_count < usage_limit)
     RETURNING *`,
    [discountId],
  );
  return row || null;
}

module.exports = {
  list,
  findById,
  findByName,
  insert,
  update,
  softDelete,
  incrementUsage,
};
