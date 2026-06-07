"use strict";

async function getCurrentStock(client, { locationId, search, belowReorder }) {
  const { rows } = await client.query(
    `SELECT
       p.product_id, p.sku, p.name, p.reorder_level, p.selling_price,
       p.category_id, p.is_active,
       COALESCE(sm.current_qty, 0) AS current_quantity,
       sm.location_breakdown
     FROM products p
     LEFT JOIN (
       SELECT
         product_id,
         SUM(location_qty) AS current_qty,
         json_object_agg(location_id::TEXT, location_qty) AS location_breakdown
       FROM (
         SELECT product_id,
                COALESCE(to_location_id, from_location_id) AS location_id,
                SUM(quantity * direction) AS location_qty
         FROM stock_movements
         GROUP BY product_id, COALESCE(to_location_id, from_location_id)
       ) loc_stock
       GROUP BY product_id
     ) sm ON sm.product_id = p.product_id
     WHERE p.is_deleted = false AND p.is_active = true
       AND ($1::UUID IS NULL OR EXISTS (SELECT 1 FROM stock_movements sm2 WHERE sm2.product_id = p.product_id AND COALESCE(sm2.to_location_id, sm2.from_location_id) = $1))
       AND ($2::TEXT IS NULL OR p.name ILIKE $2 OR p.sku ILIKE $2)
       AND ($3::BOOLEAN = false OR COALESCE(sm.current_qty, 0) <= p.reorder_level)
     ORDER BY p.name`,
    [
      locationId || null,
      search ? `%${search}%` : null,
      belowReorder === "true",
    ],
  );
  return rows;
}

async function getMovements(client, productId, { limit, offset }) {
  const { rows } = await client.query(
    `SELECT sm.*, u.email AS performed_by_email
     FROM stock_movements sm
     LEFT JOIN shared.users u ON u.user_id = sm.performed_by
     WHERE sm.product_id = $1
     ORDER BY sm.performed_at DESC
     LIMIT $2 OFFSET $3`,
    [productId, limit, offset],
  );
  return rows;
}

// Global movements list across all products, with optional filters and a
// total count for pagination. Location filter matches either leg of a
// transfer (from_location_id / to_location_id).
async function listMovements(
  client,
  {
    productId,
    locationId,
    movementType,
    referenceType,
    referenceId,
    fromDate,
    toDate,
    limit = 50,
    offset = 0,
  } = {},
) {
  const filters = [
    productId || null,
    locationId || null,
    movementType || null,
    referenceType || null,
    referenceId || null,
    fromDate || null,
    toDate || null,
  ];
  const where = `
    WHERE ($1::UUID IS NULL OR sm.product_id = $1)
      AND ($2::UUID IS NULL OR sm.from_location_id = $2 OR sm.to_location_id = $2)
      AND ($3::TEXT IS NULL OR sm.movement_type = $3)
      AND ($4::TEXT IS NULL OR sm.reference_type = $4)
      AND ($5::UUID IS NULL OR sm.reference_id = $5)
      AND ($6::TIMESTAMPTZ IS NULL OR sm.performed_at >= $6)
      AND ($7::TIMESTAMPTZ IS NULL OR sm.performed_at <= $7)`;

  const { rows } = await client.query(
    `SELECT sm.*, p.sku AS product_sku, p.name AS product_name,
            u.email AS performed_by_name
     FROM stock_movements sm
     JOIN products p ON p.product_id = sm.product_id
     LEFT JOIN shared.users u ON u.user_id = sm.performed_by
     ${where}
     ORDER BY sm.performed_at DESC
     LIMIT $8 OFFSET $9`,
    [...filters, limit, offset],
  );

  const {
    rows: [{ total }],
  } = await client.query(
    `SELECT COUNT(*)::int AS total FROM stock_movements sm ${where}`,
    filters,
  );

  return { rows, total };
}

async function insertMovement(
  client,
  {
    productId,
    movementType,
    quantity,
    direction,
    fromLocationId,
    toLocationId,
    referenceType,
    referenceId,
    unitCost,
    notes,
    performedBy,
  },
) {
  const {
    rows: [movement],
  } = await client.query(
    `INSERT INTO stock_movements
       (product_id, movement_type, quantity, direction,
        from_location_id, to_location_id, reference_type, reference_id,
        unit_cost, notes, performed_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      productId,
      movementType,
      quantity,
      direction,
      fromLocationId || null,
      toLocationId || null,
      referenceType || null,
      referenceId || null,
      unitCost || null,
      notes || null,
      performedBy,
    ],
  );
  return movement;
}

async function getLowStockStatus(client, productId) {
  const {
    rows: [stock],
  } = await client.query(
    `SELECT p.product_id, p.name, p.reorder_level,
            COALESCE(SUM(sm.quantity * sm.direction), 0) AS current_qty
     FROM products p
     LEFT JOIN stock_movements sm ON sm.product_id = p.product_id
     WHERE p.product_id = $1
     GROUP BY p.product_id, p.name, p.reorder_level`,
    [productId],
  );
  return stock || null;
}

async function getStockManagers(client, business) {
  const { rows } = await client.query(
    `SELECT u.user_id FROM shared.users u
     JOIN shared.user_roles ur ON ur.user_id = u.user_id
     JOIN shared.roles r ON r.role_id = ur.role_id
     WHERE r.role_name IN ('owner','manager','stock_manager')
       AND (ur.business = $1 OR ur.business = '*')`,
    [business],
  );
  return rows;
}

async function getCurrentQty(client, productId) {
  const {
    rows: [current],
  } = await client.query(
    `SELECT COALESCE(SUM(quantity * direction), 0) AS qty FROM stock_movements WHERE product_id = $1`,
    [productId],
  );
  return parseInt(current?.qty || 0);
}

async function insertAdjustment(
  client,
  {
    product_id,
    location_id,
    adjustment_type,
    currentQty,
    quantity_after,
    reason,
    userId,
  },
) {
  const {
    rows: [adj],
  } = await client.query(
    `INSERT INTO stock_adjustments
       (product_id, location_id, adjustment_type, quantity_before,
        quantity_after, reason, approved_by, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
     RETURNING *`,
    [
      product_id,
      location_id,
      adjustment_type || "correction",
      currentQty,
      quantity_after,
      reason,
      userId,
    ],
  );
  return adj;
}

// Insert an adjustment WITHOUT auto-approving it (approved_by left NULL).
// Used by the batch/count flow — the stock movement is posted only when
// the adjustment is later approved.
async function insertAdjustmentPending(
  client,
  {
    product_id,
    location_id,
    adjustment_type,
    quantity_before,
    quantity_after,
    reason,
    created_by,
  },
) {
  const {
    rows: [adj],
  } = await client.query(
    `INSERT INTO stock_adjustments
       (product_id, location_id, adjustment_type, quantity_before,
        quantity_after, reason, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      product_id,
      location_id,
      adjustment_type || "count",
      quantity_before,
      quantity_after,
      reason,
      created_by,
    ],
  );
  return adj;
}

async function findAdjustmentById(client, adjustmentId) {
  const {
    rows: [adj],
  } = await client.query(
    `SELECT * FROM stock_adjustments WHERE adjustment_id = $1`,
    [adjustmentId],
  );
  return adj || null;
}

async function setAdjustmentApproved(client, adjustmentId, approvedBy) {
  const {
    rows: [adj],
  } = await client.query(
    `UPDATE stock_adjustments SET approved_by = $2
     WHERE adjustment_id = $1
     RETURNING *`,
    [adjustmentId, approvedBy],
  );
  return adj || null;
}

async function listAdjustments(
  client,
  { productId, locationId, fromDate, toDate, limit = 200, offset = 0 } = {},
) {
  const { rows } = await client.query(
    `SELECT a.adjustment_id, a.product_id, a.location_id, a.adjustment_type,
            a.quantity_before, a.quantity_after,
            (a.quantity_after - a.quantity_before) AS quantity_delta,
            a.reason, a.approved_by, a.created_by, a.created_at,
            (a.approved_by IS NOT NULL) AS is_approved,
            p.name AS product_name, p.sku AS product_sku,
            l.name AS location_name,
            cu.email AS created_by_name,
            au.email AS approved_by_name
     FROM stock_adjustments a
     JOIN products p        ON p.product_id = a.product_id
     JOIN stock_locations l ON l.location_id = a.location_id
     LEFT JOIN shared.users cu ON cu.user_id = a.created_by
     LEFT JOIN shared.users au ON au.user_id = a.approved_by
     WHERE ($1::UUID IS NULL OR a.product_id = $1)
       AND ($2::UUID IS NULL OR a.location_id = $2)
       AND ($3::TIMESTAMPTZ IS NULL OR a.created_at >= $3)
       AND ($4::TIMESTAMPTZ IS NULL OR a.created_at <= $4)
     ORDER BY a.created_at DESC
     LIMIT $5 OFFSET $6`,
    [
      productId || null,
      locationId || null,
      fromDate || null,
      toDate || null,
      limit,
      offset,
    ],
  );
  return rows;
}

// ── BATCHES / LOTS ──────────────────────────────────────────

async function insertBatch(
  client,
  {
    product_id,
    batch_number,
    manufactured_date,
    expiry_date,
    initial_quantity,
    location_id,
    notes,
    created_by,
  },
) {
  const {
    rows: [batch],
  } = await client.query(
    `INSERT INTO stock_batches
       (product_id, batch_number, manufactured_date, expiry_date,
        initial_quantity, remaining_quantity, location_id, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8)
     RETURNING *`,
    [
      product_id,
      batch_number,
      manufactured_date || null,
      expiry_date || null,
      initial_quantity,
      location_id || null,
      notes || null,
      created_by,
    ],
  );
  return batch;
}

async function listBatches(client, { productId, expiringWithinDays } = {}) {
  const { rows } = await client.query(
    `SELECT b.batch_id, b.product_id, b.batch_number, b.manufactured_date,
            b.expiry_date, b.initial_quantity, b.remaining_quantity,
            b.location_id, b.notes, b.created_at,
            p.name AS product_name, p.sku AS product_sku,
            l.name AS location_name
     FROM stock_batches b
     JOIN products p        ON p.product_id = b.product_id
     LEFT JOIN stock_locations l ON l.location_id = b.location_id
     WHERE ($1::UUID IS NULL OR b.product_id = $1)
       AND ($2::INT IS NULL OR (b.expiry_date IS NOT NULL
            AND b.expiry_date <= CURRENT_DATE + ($2 * INTERVAL '1 day')))
     ORDER BY b.expiry_date ASC NULLS LAST, b.created_at DESC`,
    [productId || null, expiringWithinDays || null],
  );
  return rows;
}

async function insertTransfer(
  client,
  { transferNumber, from_location_id, to_location_id, userId },
) {
  const {
    rows: [transfer],
  } = await client.query(
    `INSERT INTO stock_transfers
       (transfer_number, from_location_id, to_location_id, status, initiated_by)
     VALUES ($1,$2,$3,'in_transit',$4)
     RETURNING *`,
    [transferNumber, from_location_id, to_location_id, userId],
  );
  return transfer;
}

async function getLowStockAlerts(client) {
  const { rows } = await client.query(
    `SELECT p.product_id, p.sku, p.name, p.reorder_level, p.reorder_quantity,
            COALESCE(SUM(sm.quantity * sm.direction), 0) AS current_qty
     FROM products p
     LEFT JOIN stock_movements sm ON sm.product_id = p.product_id
     WHERE p.is_deleted = false AND p.is_active = true
     GROUP BY p.product_id, p.sku, p.name, p.reorder_level, p.reorder_quantity
     HAVING COALESCE(SUM(sm.quantity * sm.direction), 0) <= p.reorder_level
     ORDER BY current_qty ASC`,
  );
  return rows;
}

async function getLocations(client) {
  const { rows } = await client.query(
    `SELECT location_id, name, location_type, is_active FROM stock_locations WHERE is_active = true ORDER BY name`,
  );
  return rows;
}

module.exports = {
  getCurrentStock,
  getMovements,
  insertMovement,
  getLowStockStatus,
  getStockManagers,
  getCurrentQty,
  insertAdjustment,
  insertTransfer,
  getLowStockAlerts,
  getLocations,
};

// ──────────────────────────────────────────────────────────────
// On-hand (proper OnHandRow shape)
//
// Returns one row per active product with on-hand summed across
// locations, active reservations, available (on_hand − reserved),
// and per-location breakdown. The client uses this for the Stock
// dashboard and Product Detail "Stock" tab.
// ──────────────────────────────────────────────────────────────

async function getOnHand(
  client,
  {
    search,
    categoryId,
    locationId,
    lowStockOnly,
    outOfStockOnly,
    limit,
    offset,
  },
) {
  const { rows } = await client.query(
    `WITH stock_per_loc AS (
       SELECT product_id,
              COALESCE(to_location_id, from_location_id) AS location_id,
              SUM(quantity * direction)                  AS qty
         FROM stock_movements
        GROUP BY product_id, COALESCE(to_location_id, from_location_id)
     ),
     stock_totals AS (
       SELECT product_id,
              SUM(qty) AS on_hand,
              json_agg(json_build_object(
                'location_id',   sl.location_id,
                'location_name', sl.name,
                'location_type', sl.location_type,
                'on_hand',       spl.qty
              ) ORDER BY sl.name) FILTER (WHERE sl.location_id IS NOT NULL) AS by_location
         FROM stock_per_loc spl
    LEFT JOIN stock_locations sl ON sl.location_id = spl.location_id
        GROUP BY product_id
     ),
     reservations AS (
       SELECT product_id, COALESCE(SUM(quantity), 0) AS reserved
         FROM stock_reservations
        WHERE status = 'active' AND expires_at > now()
        GROUP BY product_id
     )
     SELECT p.product_id, p.sku AS product_sku, p.name AS product_name,
            p.category_id, c.name AS category_name,
            NULL::TEXT AS primary_image_url,
            p.cost_price, p.selling_price,
            COALESCE(p.currency, 'NGN') AS currency,
            p.reorder_level, p.reorder_quantity,
            COALESCE(st.on_hand,    0)::INT AS on_hand,
            COALESCE(r.reserved,    0)::INT AS reserved,
            (COALESCE(st.on_hand, 0) - COALESCE(r.reserved, 0))::INT AS available,
            st.by_location,
            (COALESCE(st.on_hand, 0) <= p.reorder_level) AS is_low_stock,
            (COALESCE(st.on_hand, 0) <= 0)                AS is_out_of_stock
       FROM products p
  LEFT JOIN stock_totals      st ON st.product_id = p.product_id
  LEFT JOIN reservations      r  ON r.product_id  = p.product_id
  LEFT JOIN product_categories c ON c.category_id = p.category_id
      WHERE p.is_deleted = false AND p.is_active = true
        AND ($1::TEXT IS NULL OR p.name ILIKE $1 OR p.sku ILIKE $1)
        AND ($2::UUID IS NULL OR p.category_id = $2)
        AND ($3::UUID IS NULL OR EXISTS (
              SELECT 1 FROM stock_per_loc spl
               WHERE spl.product_id = p.product_id AND spl.location_id = $3))
        AND ($4::BOOLEAN = false OR COALESCE(st.on_hand, 0) <= p.reorder_level)
        AND ($5::BOOLEAN = false OR COALESCE(st.on_hand, 0) <= 0)
      ORDER BY p.name
      LIMIT $6 OFFSET $7`,
    [
      search ? `%${search}%` : null,
      categoryId || null,
      locationId || null,
      lowStockOnly === true || lowStockOnly === "true",
      outOfStockOnly === true || outOfStockOnly === "true",
      limit,
      offset,
    ],
  );

  // Totals — separate query so pagination doesn't distort them
  const {
    rows: [totals],
  } = await client.query(
    `WITH stock_per_loc AS (
       SELECT product_id, SUM(quantity * direction) AS qty
         FROM stock_movements
        GROUP BY product_id
     )
     SELECT
       COALESCE(SUM(p.selling_price * COALESCE(spl.qty, 0)), 0)::NUMERIC(14,2) AS total_value,
       COALESCE(SUM(spl.qty), 0)::INT                                          AS total_units,
       COUNT(*) FILTER (WHERE COALESCE(spl.qty, 0) <= p.reorder_level)::INT    AS low_stock_count,
       COUNT(*) FILTER (WHERE COALESCE(spl.qty, 0) <= 0)::INT                  AS out_of_stock_count
     FROM products p
LEFT JOIN stock_per_loc spl ON spl.product_id = p.product_id
    WHERE p.is_deleted = false AND p.is_active = true`,
  );

  return { data: rows, totals };
}

async function getOnHandByProduct(client, productId) {
  const {
    rows: [row],
  } = await client.query(
    `WITH stock_per_loc AS (
       SELECT COALESCE(to_location_id, from_location_id) AS location_id,
              SUM(quantity * direction) AS qty
         FROM stock_movements
        WHERE product_id = $1
        GROUP BY COALESCE(to_location_id, from_location_id)
     ),
     reservations AS (
       SELECT COALESCE(SUM(quantity), 0) AS reserved
         FROM stock_reservations
        WHERE product_id = $1 AND status = 'active' AND expires_at > now()
     )
     SELECT p.product_id, p.sku AS product_sku, p.name AS product_name,
            p.category_id, c.name AS category_name,
            NULL::TEXT AS primary_image_url,
            p.cost_price, p.selling_price,
            COALESCE(p.currency, 'NGN') AS currency,
            p.reorder_level, p.reorder_quantity,
            COALESCE((SELECT SUM(qty) FROM stock_per_loc), 0)::INT AS on_hand,
            COALESCE((SELECT reserved FROM reservations), 0)::INT  AS reserved,
            (COALESCE((SELECT SUM(qty) FROM stock_per_loc), 0)
              - COALESCE((SELECT reserved FROM reservations), 0))::INT AS available,
            (SELECT json_agg(json_build_object(
                'location_id',   sl.location_id,
                'location_name', sl.name,
                'location_type', sl.location_type,
                'on_hand',       spl.qty)
              ORDER BY sl.name)
              FROM stock_per_loc spl
              JOIN stock_locations sl ON sl.location_id = spl.location_id) AS by_location,
            (COALESCE((SELECT SUM(qty) FROM stock_per_loc), 0) <= p.reorder_level) AS is_low_stock,
            (COALESCE((SELECT SUM(qty) FROM stock_per_loc), 0) <= 0)                AS is_out_of_stock
       FROM products p
  LEFT JOIN product_categories c ON c.category_id = p.category_id
      WHERE p.product_id = $1 AND p.is_deleted = false`,
    [productId],
  );
  return row || null;
}

// ──────────────────────────────────────────────────────────────
// Reservations
// ──────────────────────────────────────────────────────────────

async function listReservations(client, { status, productId, limit, offset }) {
  const { rows } = await client.query(
    `SELECT r.*, p.sku AS product_sku, p.name AS product_name,
            c.display_name AS reserved_for_name,
            d.title        AS crm_deal_title
       FROM stock_reservations r
       JOIN products p           ON p.product_id   = r.product_id
  LEFT JOIN shared.contacts c    ON c.contact_id   = r.reserved_for
  LEFT JOIN crm_deals       d    ON d.deal_id      = r.crm_deal_id
      WHERE ($1::TEXT IS NULL OR r.status     = $1)
        AND ($2::UUID IS NULL OR r.product_id = $2)
      ORDER BY r.created_at DESC
      LIMIT $3 OFFSET $4`,
    [status || null, productId || null, limit, offset],
  );
  return rows;
}

async function findReservationById(client, reservationId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT r.*, p.sku AS product_sku, p.name AS product_name,
            c.display_name AS reserved_for_name,
            d.title        AS crm_deal_title
       FROM stock_reservations r
       JOIN products p           ON p.product_id   = r.product_id
  LEFT JOIN shared.contacts c    ON c.contact_id   = r.reserved_for
  LEFT JOIN crm_deals       d    ON d.deal_id      = r.crm_deal_id
      WHERE r.reservation_id = $1`,
    [reservationId],
  );
  return row || null;
}

// ──────────────────────────────────────────────────────────────
// Transfers — new state machine: pending → in_transit → received,
// with cancel allowed from either pending or in_transit
// ──────────────────────────────────────────────────────────────

async function insertTransferPending(
  client,
  { transferNumber, from_location_id, to_location_id, notes, userId },
) {
  const {
    rows: [transfer],
  } = await client.query(
    `INSERT INTO stock_transfers
       (transfer_number, from_location_id, to_location_id, status, notes, initiated_by)
     VALUES ($1, $2, $3, 'pending', $4, $5)
     RETURNING *`,
    [transferNumber, from_location_id, to_location_id, notes || null, userId],
  );
  return transfer;
}

async function insertTransferLines(client, transferId, lines) {
  // lines: [{ product_id, quantity }]
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    await client.query(
      `INSERT INTO stock_transfer_lines (transfer_id, product_id, quantity, display_order)
       VALUES ($1, $2, $3, $4)`,
      [transferId, l.product_id, l.quantity, i],
    );
  }
}

async function findTransferById(client, transferId) {
  const {
    rows: [transfer],
  } = await client.query(
    `SELECT t.*,
            fl.name AS from_location_name,
            tl.name AS to_location_name,
            u1.email AS initiated_by_name,
            u2.email AS received_by_name,
            COALESCE(
              json_agg(json_build_object(
                'line_id',      tline.line_id,
                'transfer_id',  tline.transfer_id,
                'product_id',   tline.product_id,
                'product_sku',  p.sku,
                'product_name', p.name,
                'quantity',     tline.quantity
              ) ORDER BY tline.display_order)
              FILTER (WHERE tline.line_id IS NOT NULL),
              '[]'::json
            ) AS lines
       FROM stock_transfers t
  LEFT JOIN stock_locations fl     ON fl.location_id = t.from_location_id
  LEFT JOIN stock_locations tl     ON tl.location_id = t.to_location_id
  LEFT JOIN shared.users u1        ON u1.user_id     = t.initiated_by
  LEFT JOIN shared.users u2        ON u2.user_id     = t.received_by
  LEFT JOIN stock_transfer_lines tline ON tline.transfer_id = t.transfer_id
  LEFT JOIN products p             ON p.product_id   = tline.product_id
      WHERE t.transfer_id = $1
      GROUP BY t.transfer_id, fl.name, tl.name, u1.display_name, u2.display_name`,
    [transferId],
  );
  return transfer || null;
}

async function listTransfers(client, { status, from, to, limit, offset }) {
  const { rows } = await client.query(
    `SELECT t.transfer_id, t.transfer_number, t.status,
            t.from_location_id, fl.name AS from_location_name,
            t.to_location_id,   tl.name AS to_location_name,
            t.notes, t.initiated_at, t.received_at,
            t.initiated_by, u1.email AS initiated_by_name,
            t.received_by,  u2.email AS received_by_name,
            (SELECT COUNT(*) FROM stock_transfer_lines tline
              WHERE tline.transfer_id = t.transfer_id)::INT AS line_count
       FROM stock_transfers t
  LEFT JOIN stock_locations fl ON fl.location_id = t.from_location_id
  LEFT JOIN stock_locations tl ON tl.location_id = t.to_location_id
  LEFT JOIN shared.users u1    ON u1.user_id     = t.initiated_by
  LEFT JOIN shared.users u2    ON u2.user_id     = t.received_by
      WHERE ($1::TEXT IS NULL OR t.status = $1)
        AND ($2::UUID IS NULL OR t.from_location_id = $2)
        AND ($3::UUID IS NULL OR t.to_location_id   = $3)
      ORDER BY t.initiated_at DESC
      LIMIT $4 OFFSET $5`,
    [status || null, from || null, to || null, limit, offset],
  );
  return rows;
}

async function getTransferLines(client, transferId) {
  const { rows } = await client.query(
    `SELECT line_id, transfer_id, product_id, quantity, display_order
       FROM stock_transfer_lines
      WHERE transfer_id = $1
      ORDER BY display_order`,
    [transferId],
  );
  return rows;
}

async function updateTransferStatus(client, transferId, status, extra = {}) {
  // extra may include received_by, received_at, notes
  const sets = ["status = $2"];
  const vals = [transferId, status];
  if (extra.received_by) {
    vals.push(extra.received_by);
    sets.push(`received_by = $${vals.length}`);
  }
  if (extra.received_at) {
    vals.push(extra.received_at);
    sets.push(`received_at = $${vals.length}`);
  }
  if (extra.cancel_reason) {
    // notes append on cancel so we keep the original transfer note
    vals.push(extra.cancel_reason);
    sets.push(
      `notes = COALESCE(notes || E'\\n', '') || ('Cancelled: ' || $${vals.length})`,
    );
  }
  const {
    rows: [row],
  } = await client.query(
    `UPDATE stock_transfers SET ${sets.join(", ")} WHERE transfer_id = $1 RETURNING *`,
    vals,
  );
  return row;
}

// ──────────────────────────────────────────────────────────────
// Quality checks — plain CRUD against the existing table
// ──────────────────────────────────────────────────────────────

async function listQualityChecks(
  client,
  { productId, checkType, result, limit, offset },
) {
  const { rows } = await client.query(
    `SELECT qc.*,
            p.sku AS product_sku, p.name AS product_name,
            u.email AS checked_by_name
       FROM quality_checks qc
       JOIN products p        ON p.product_id = qc.product_id
  LEFT JOIN shared.users u    ON u.user_id    = qc.checked_by
      WHERE ($1::UUID IS NULL OR qc.product_id = $1)
        AND ($2::TEXT IS NULL OR qc.check_type = $2)
        AND ($3::TEXT IS NULL OR qc.result     = $3)
      ORDER BY qc.checked_at DESC
      LIMIT $4 OFFSET $5`,
    [productId || null, checkType || null, result || null, limit, offset],
  );
  return rows;
}

async function insertQualityCheck(
  client,
  { product_id, check_type, result, notes, userId },
) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO quality_checks (product_id, check_type, result, notes, checked_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [product_id, check_type, result, notes || null, userId],
  );
  return row;
}

module.exports.getOnHand = getOnHand;
module.exports.getOnHandByProduct = getOnHandByProduct;
module.exports.listReservations = listReservations;
module.exports.findReservationById = findReservationById;
module.exports.insertTransferPending = insertTransferPending;
module.exports.insertTransferLines = insertTransferLines;
module.exports.findTransferById = findTransferById;
module.exports.listTransfers = listTransfers;
module.exports.getTransferLines = getTransferLines;
module.exports.updateTransferStatus = updateTransferStatus;
module.exports.listQualityChecks = listQualityChecks;
module.exports.insertQualityCheck = insertQualityCheck;
module.exports.listMovements = listMovements;
module.exports.insertAdjustmentPending = insertAdjustmentPending;
module.exports.findAdjustmentById = findAdjustmentById;
module.exports.setAdjustmentApproved = setAdjustmentApproved;
module.exports.listAdjustments = listAdjustments;
module.exports.insertBatch = insertBatch;
module.exports.listBatches = listBatches;
