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
