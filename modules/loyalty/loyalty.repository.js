"use strict";

// ── READ ─────────────────────────────────────────────────────

async function getBalance(client, contactId) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(points), 0)::INTEGER AS balance
     FROM loyalty_points
     WHERE contact_id = $1
       AND (expires_at IS NULL OR expires_at > now())`,
    [contactId],
  );
  return rows[0].balance;
}

async function listTransactions(
  client,
  contactId,
  { limit = 50, offset = 0 } = {},
) {
  const { rows } = await client.query(
    `SELECT transaction_id, transaction_type, points, reference_type,
            reference_id, notes, expires_at, created_at
     FROM loyalty_points
     WHERE contact_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [contactId, limit, offset],
  );
  return rows;
}

async function listTiers(client) {
  const { rows } = await client.query(
    `SELECT tier_id, tier_name, min_points, max_points, benefits, colour, display_order
     FROM loyalty_tiers
     ORDER BY display_order ASC`,
  );
  return rows;
}

async function getTierForBalance(client, balance) {
  const { rows } = await client.query(
    `SELECT tier_id, tier_name, min_points, max_points, benefits, colour
     FROM loyalty_tiers
     WHERE min_points <= $1
       AND (max_points IS NULL OR max_points >= $1)
     ORDER BY min_points DESC
     LIMIT 1`,
    [balance],
  );
  return rows[0] || null;
}

async function getTierById(client, tierId) {
  const { rows } = await client.query(
    `SELECT tier_id, tier_name, min_points, max_points, benefits, colour, display_order, created_at, updated_at
     FROM loyalty_tiers
     WHERE tier_id = $1`,
    [tierId],
  );
  return rows[0] || null;
}

// ── CONFIG ───────────────────────────────────────────────────

/**
 * Fetches the loyalty_settings jsonb object from shared.business_config
 * FOR THE GIVEN BUSINESS.
 *
 * Returns the parsed object, e.g.:
 *   {
 *     points_per_naira:        0.001,
 *     expiry_months:           12,
 *     notify_on_tier_upgrade:  true,
 *     tier_display_in_receipt: true,
 *   }
 *
 * On any error (column not yet migrated, no row, etc.) returns {} so
 * the caller can fall back to its own hardcoded defaults without crashing.
 *
 * NOTE: the previous version used `LIMIT 1` with no WHERE clause — it
 * returned whichever business_config row the planner happened to
 * return first, so in a two-business install jewelry's config could
 * leak into diffusers' loyalty math. The business_key filter fixes that.
 */
async function getLoyaltyConfig(client, business) {
  try {
    const { rows } = await client.query(
      `SELECT loyalty_settings
       FROM shared.business_config
       WHERE business_key = $1
       LIMIT 1`,
      [business],
    );
    return rows[0]?.loyalty_settings ?? {};
  } catch {
    // Column not yet migrated or table unavailable; caller uses hardcoded fallbacks.
    return {};
  }
}

// ── WRITE ────────────────────────────────────────────────────

async function insertTransaction(
  client,
  {
    contactId,
    transactionType,
    points,
    referenceType = null,
    referenceId = null,
    notes = null,
    expiresAt = null,
  },
) {
  const { rows } = await client.query(
    `INSERT INTO loyalty_points
       (contact_id, transaction_type, points, reference_type, reference_id, notes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      contactId,
      transactionType,
      points,
      referenceType,
      referenceId,
      notes,
      expiresAt,
    ],
  );
  return rows[0];
}

// ── TIER MANAGEMENT ──────────────────────────────────────────

async function createTier(
  client,
  {
    tierName,
    minPoints,
    maxPoints = null,
    benefits = {},
    colour = "#64748B",
    displayOrder = 0,
  },
) {
  const { rows } = await client.query(
    `INSERT INTO loyalty_tiers
       (tier_name, min_points, max_points, benefits, colour, display_order)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     RETURNING *`,
    [
      tierName,
      minPoints,
      maxPoints,
      JSON.stringify(benefits),
      colour,
      displayOrder,
    ],
  );
  return rows[0];
}

async function updateTier(
  client,
  tierId,
  {
    tierName,
    minPoints,
    maxPoints,
    benefits,
    colour,
    displayOrder,
    updatedBy = null,
  },
) {
  const sets = [];
  const values = [];
  let i = 1;

  if (tierName !== undefined) {
    sets.push(`tier_name = $${i++}`);
    values.push(tierName);
  }
  if (minPoints !== undefined) {
    sets.push(`min_points = $${i++}`);
    values.push(minPoints);
  }
  if (maxPoints !== undefined) {
    sets.push(`max_points = $${i++}`);
    values.push(maxPoints);
  }
  if (benefits !== undefined) {
    sets.push(`benefits = $${i++}::jsonb`);
    values.push(JSON.stringify(benefits));
  }
  if (colour !== undefined) {
    sets.push(`colour = $${i++}`);
    values.push(colour);
  }
  if (displayOrder !== undefined) {
    sets.push(`display_order = $${i++}`);
    values.push(displayOrder);
  }
  if (updatedBy !== undefined) {
    sets.push(`updated_by = $${i++}`);
    values.push(updatedBy);
  }

  if (!sets.length) return getTierById(client, tierId);

  sets.push(`updated_at = now()`);
  values.push(tierId);

  const { rows } = await client.query(
    `UPDATE loyalty_tiers
     SET ${sets.join(", ")}
     WHERE tier_id = $${i}
     RETURNING *`,
    values,
  );
  return rows[0] || null;
}

async function deleteTier(client, tierId) {
  const { rows } = await client.query(
    `DELETE FROM loyalty_tiers
     WHERE tier_id = $1
     RETURNING tier_id`,
    [tierId],
  );
  return rows[0] ? true : false;
}

async function reorderTiers(client, tierId, newDisplayOrder) {
  const { rows } = await client.query(
    `UPDATE loyalty_tiers
     SET display_order = $2, updated_at = now()
     WHERE tier_id = $1
     RETURNING *`,
    [tierId, newDisplayOrder],
  );
  return rows[0] || null;
}

// Marks all rows where expires_at <= now and points > 0 as a new
// negative 'expired' row (append-only ledger — never UPDATE old rows).
async function expireOldPoints(client) {
  // Find contacts with points that have expired but no matching expiry row yet.
  const { rows } = await client.query(
    `SELECT contact_id, SUM(points) AS expiring
     FROM loyalty_points
     WHERE expires_at <= now()
       AND transaction_type IN ('earned','bonus')
       AND points > 0
       AND NOT EXISTS (
         SELECT 1 FROM loyalty_points lp2
         WHERE lp2.contact_id = loyalty_points.contact_id
           AND lp2.transaction_type = 'expired'
           AND lp2.reference_id = loyalty_points.transaction_id
       )
     GROUP BY contact_id
     HAVING SUM(points) > 0`,
  );

  let count = 0;
  for (const row of rows) {
    // Identify the specific original rows to link expiry entries back to them.
    const { rows: origRows } = await client.query(
      `SELECT transaction_id, points FROM loyalty_points
       WHERE contact_id = $1
         AND expires_at <= now()
         AND transaction_type IN ('earned','bonus')
         AND points > 0
         AND NOT EXISTS (
           SELECT 1 FROM loyalty_points lp2
           WHERE lp2.contact_id = $1
             AND lp2.transaction_type = 'expired'
             AND lp2.reference_id = loyalty_points.transaction_id
         )`,
      [row.contact_id],
    );
    for (const orig of origRows) {
      await client.query(
        `INSERT INTO loyalty_points
           (contact_id, transaction_type, points, reference_type, reference_id, notes)
         VALUES ($1, 'expired', $2, 'loyalty_points', $3, 'Points expired')`,
        [row.contact_id, -orig.points, orig.transaction_id],
      );
      count++;
    }
  }
  return count;
}

module.exports = {
  getBalance,
  listTransactions,
  listTiers,
  getTierForBalance,
  getTierById,
  getLoyaltyConfig,
  insertTransaction,
  expireOldPoints,
  createTier,
  updateTier,
  deleteTier,
  reorderTiers,
};
