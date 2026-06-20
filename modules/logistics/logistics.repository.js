"use strict";

async function listDeliveries(
  client,
  { status, courier, search, limit, offset },
) {
  const { rows } = await client.query(
    `SELECT d.delivery_id, d.delivery_number, d.status, d.courier,
            d.courier_company, d.driver_name, d.driver_phone,
            d.delivery_fee, d.dispatched_at, d.delivered_at, d.created_at,
            c.display_name AS contact_name, c.primary_phone,
            c.email AS contact_email
     FROM deliveries d
     JOIN shared.contacts c ON c.contact_id = d.contact_id
     WHERE ($1::TEXT IS NULL OR d.status  = $1)
       AND ($2::TEXT IS NULL OR d.courier = $2)
       AND ($3::TEXT IS NULL
            OR d.delivery_number ILIKE $3
            OR c.display_name ILIKE $3
            OR d.driver_name ILIKE $3
            OR d.waybill_number ILIKE $3)
     ORDER BY d.created_at DESC
     LIMIT $4 OFFSET $5`,
    [status || null, courier || null, search ? `%${search}%` : null, limit, offset],
  );
  return rows;
}

async function findDeliveryById(client, deliveryId) {
  // NOTE: items and tracking are aggregated in subqueries — joining both
  // tables produced a row-multiplication cross product (every item ×
  // every tracking row) that json_agg dutifully duplicated.
  const {
    rows: [delivery],
  } = await client.query(
    `SELECT d.*,
            c.display_name AS contact_name, c.primary_phone,
            c.whatsapp_number, c.email AS contact_email,
            COALESCE(
              (SELECT json_agg(di.* ORDER BY di.item_id)
               FROM delivery_items di WHERE di.delivery_id = d.delivery_id),
              '[]'::json
            ) AS items,
            COALESCE(
              (SELECT json_agg(dt.* ORDER BY dt.occurred_at DESC)
               FROM delivery_tracking dt WHERE dt.delivery_id = d.delivery_id),
              '[]'::json
            ) AS tracking_history
     FROM deliveries d
     JOIN shared.contacts c ON c.contact_id = d.contact_id
     WHERE d.delivery_id = $1`,
    [deliveryId],
  );
  return delivery || null;
}

async function insertDelivery(
  client,
  {
    deliveryNumber,
    reference_type,
    reference_id,
    contact_id,
    delivery_address,
    courier,
    deliveryFee,
    fee_borne_by,
    userId,
  },
) {
  const {
    rows: [delivery],
  } = await client.query(
    `INSERT INTO deliveries (delivery_number, reference_type, reference_id, contact_id, delivery_address, courier, status, delivery_fee, fee_borne_by, created_by) VALUES ($1,$2,$3,$4,$5,$6,'pending_dispatch',$7,$8,$9) RETURNING *`,
    [
      deliveryNumber,
      reference_type,
      reference_id,
      contact_id,
      typeof delivery_address === "string"
        ? JSON.stringify({ line1: delivery_address })
        : JSON.stringify(delivery_address),
      courier,
      deliveryFee,
      fee_borne_by || "customer",
      userId,
    ],
  );
  return delivery;
}

// Guards against creating two deliveries for the same source order/sale.
// An order's delivery can legitimately be re-created only after a prior
// attempt ended terminally (failed / returned), so those are excluded.
async function findActiveDeliveryByReference(client, referenceType, referenceId) {
  if (!referenceType || !referenceId) return null;
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM deliveries
      WHERE reference_type = $1
        AND reference_id   = $2
        AND status NOT IN ('failed', 'returned')
      ORDER BY created_at ASC
      LIMIT 1`,
    [referenceType, referenceId],
  );
  return row || null;
}

async function insertDeliveryItem(
  client,
  { delivery_id, product_id, description, quantity },
) {
  await client.query(
    `INSERT INTO delivery_items (delivery_id, product_id, description, quantity) VALUES ($1,$2,$3,$4)`,
    [delivery_id, product_id || null, description, quantity],
  );
}

async function getOrderLines(client, referenceId) {
  const { rows } = await client.query(
    `SELECT product_id, description, quantity FROM order_lines WHERE order_id = $1`,
    [referenceId],
  );
  return rows;
}

async function getPOSLines(client, referenceId) {
  const { rows } = await client.query(
    `SELECT product_id, description, quantity FROM pos_transaction_lines WHERE transaction_id = $1`,
    [referenceId],
  );
  return rows;
}

// Source-of-truth for a delivery's address + contact when the delivery
// is created against a sales order — so the address flows through from
// the order the customer placed, no re-entry.
async function getOrderForDelivery(client, orderId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT order_id, contact_id, delivery_address, fulfilment_type
     FROM sales_orders WHERE order_id = $1`,
    [orderId],
  );
  return row || null;
}

async function getPosTransactionForDelivery(client, transactionId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT transaction_id, contact_id
     FROM pos_transactions WHERE transaction_id = $1`,
    [transactionId],
  );
  return row || null;
}

async function insertTrackingEntry(
  client,
  { delivery_id, status, source, message },
) {
  await client.query(
    `INSERT INTO delivery_tracking (delivery_id, status, source, message) VALUES ($1, $2, $3, $4)`,
    [delivery_id, status, source, message],
  );
}

async function findDispatchable(client, deliveryId) {
  const {
    rows: [delivery],
  } = await client.query(
    `SELECT d.*, c.display_name, c.primary_phone, c.whatsapp_number FROM deliveries d JOIN shared.contacts c ON c.contact_id = d.contact_id WHERE d.delivery_id = $1 AND d.status = 'pending_dispatch'`,
    [deliveryId],
  );
  return delivery || null;
}

async function getDeliveryItems(client, deliveryId) {
  const { rows } = await client.query(
    `SELECT di.*, p.name, p.weight_grams FROM delivery_items di LEFT JOIN products p ON p.product_id = di.product_id WHERE di.delivery_id = $1`,
    [deliveryId],
  );
  return rows;
}

async function setDispatched(
  client,
  {
    deliveryId,
    courierId,
    waybill,
    courierCompany,
    driverName,
    driverPhone,
    deliveryFee,
  },
) {
  const {
    rows: [updated],
  } = await client.query(
    `UPDATE deliveries SET
       status          = 'dispatched',
       courier_order_id = COALESCE($1, courier_order_id),
       waybill_number   = COALESCE($2, waybill_number),
       courier_company  = COALESCE($3, courier_company),
       driver_name      = COALESCE($4, driver_name),
       driver_phone     = COALESCE($5, driver_phone),
       delivery_fee     = COALESCE($6, delivery_fee),
       dispatched_at    = now(),
       updated_at       = now()
     WHERE delivery_id = $7
     RETURNING *`,
    [
      courierId || null,
      waybill || null,
      courierCompany || null,
      driverName || null,
      driverPhone || null,
      deliveryFee ?? null,
      deliveryId,
    ],
  );
  return updated;
}

async function setDelivered(client, deliveryId) {
  const {
    rows: [delivery],
  } = await client.query(
    `UPDATE deliveries SET status='delivered', delivered_at=now(), updated_at=now() WHERE delivery_id=$1 AND status IN ('dispatched','picked_up','in_transit') RETURNING *`,
    [deliveryId],
  );
  return delivery || null;
}

async function getDeliveryContact(client, deliveryId) {
  const {
    rows: [contact],
  } = await client.query(
    `SELECT c.whatsapp_number, c.display_name FROM deliveries d JOIN shared.contacts c ON c.contact_id = d.contact_id WHERE d.delivery_id=$1`,
    [deliveryId],
  );
  return contact || null;
}

async function setFailed(client, { deliveryId, failure_reason }) {
  const {
    rows: [delivery],
  } = await client.query(
    `UPDATE deliveries SET status='failed', failure_reason=$1, updated_at=now() WHERE delivery_id=$2 AND status NOT IN ('delivered','returned') RETURNING *`,
    [failure_reason, deliveryId],
  );
  return delivery || null;
}

async function getLogisticsManagers(client, business) {
  const { rows } = await client.query(
    `SELECT u.user_id FROM shared.users u JOIN shared.user_roles ur ON ur.user_id=u.user_id JOIN shared.roles r ON r.role_id=ur.role_id WHERE r.role_name IN ('owner','manager','logistics') AND (ur.business=$1 OR ur.business='*')`,
    [business],
  );
  return rows;
}

async function getTracking(client, deliveryId) {
  const { rows } = await client.query(
    `SELECT track_id, status, location, message, source, occurred_at FROM delivery_tracking WHERE delivery_id=$1 ORDER BY occurred_at DESC`,
    [deliveryId],
  );
  return rows;
}

async function updateDelivery(client, deliveryId, fields) {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [key, val] of Object.entries(fields)) {
    sets.push(`${key} = $${i++}`);
    vals.push(val);
  }
  if (!sets.length) return null;
  vals.push(deliveryId);
  const { rows: [updated] } = await client.query(
    `UPDATE deliveries SET ${sets.join(", ")}, updated_at = now() WHERE delivery_id = $${i} RETURNING *`,
    vals,
  );
  return updated || null;
}

// ── DELIVERY ZONES / RATE CARD ───────────────────────────────

async function getDeliverySettings(client) {
  const {
    rows: [s],
  } = await client.query(
    `SELECT lagos_state_name, bulk_threshold,
            bulk_fee_lagos::float8      AS bulk_fee_lagos,
            bulk_fee_nationwide::float8 AS bulk_fee_nationwide,
            pickup_free
     FROM delivery_settings WHERE id = 1`,
  );
  return s || null;
}

async function updateDeliverySettings(client, f) {
  const {
    rows: [s],
  } = await client.query(
    `UPDATE delivery_settings SET
       lagos_state_name    = COALESCE($1, lagos_state_name),
       bulk_threshold      = COALESCE($2, bulk_threshold),
       bulk_fee_lagos      = COALESCE($3, bulk_fee_lagos),
       bulk_fee_nationwide = COALESCE($4, bulk_fee_nationwide),
       pickup_free         = COALESCE($5, pickup_free),
       updated_at          = now()
     WHERE id = 1
     RETURNING lagos_state_name, bulk_threshold,
               bulk_fee_lagos::float8 AS bulk_fee_lagos,
               bulk_fee_nationwide::float8 AS bulk_fee_nationwide, pickup_free`,
    [
      f.lagos_state_name ?? null,
      f.bulk_threshold ?? null,
      f.bulk_fee_lagos ?? null,
      f.bulk_fee_nationwide ?? null,
      f.pickup_free ?? null,
    ],
  );
  return s || null;
}

const ZONE_COLS = `zone_id, name, scope, match_terms, rate::float8 AS rate,
                   is_default, display_order, is_active`;

async function listZones(client) {
  const { rows } = await client.query(
    `SELECT ${ZONE_COLS} FROM delivery_zones ORDER BY display_order, name`,
  );
  return rows;
}

async function getZoneById(client, id) {
  const {
    rows: [z],
  } = await client.query(
    `SELECT ${ZONE_COLS} FROM delivery_zones WHERE zone_id = $1`,
    [id],
  );
  return z || null;
}

async function insertZone(client, f) {
  const {
    rows: [z],
  } = await client.query(
    `INSERT INTO delivery_zones
       (name, scope, match_terms, rate, is_default, display_order, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING ${ZONE_COLS}`,
    [
      f.name,
      f.scope,
      f.match_terms || [],
      f.rate,
      f.is_default || false,
      f.display_order || 0,
      f.is_active !== false,
    ],
  );
  return z;
}

async function updateZone(client, id, f) {
  const {
    rows: [z],
  } = await client.query(
    `UPDATE delivery_zones SET
       name          = COALESCE($2, name),
       scope         = COALESCE($3, scope),
       match_terms   = COALESCE($4, match_terms),
       rate          = COALESCE($5, rate),
       is_default    = COALESCE($6, is_default),
       display_order = COALESCE($7, display_order),
       is_active     = COALESCE($8, is_active),
       updated_at    = now()
     WHERE zone_id = $1
     RETURNING ${ZONE_COLS}`,
    [
      id,
      f.name ?? null,
      f.scope ?? null,
      f.match_terms ?? null,
      f.rate ?? null,
      f.is_default ?? null,
      f.display_order ?? null,
      f.is_active ?? null,
    ],
  );
  return z || null;
}

async function deleteZone(client, id) {
  const {
    rows: [z],
  } = await client.query(
    `DELETE FROM delivery_zones WHERE zone_id = $1 RETURNING zone_id`,
    [id],
  );
  return z || null;
}

// The rate card consumed by the fee calculator + storefront: active zones
// + settings. Shared between admin reads and order-total computation.
async function getRateCard(client) {
  const { rows: zones } = await client.query(
    `SELECT ${ZONE_COLS} FROM delivery_zones
     WHERE is_active = true ORDER BY display_order, name`,
  );
  const settings = await getDeliverySettings(client);
  return { zones, settings: settings || {} };
}

module.exports = {
  listDeliveries,
  findDeliveryById,
  insertDelivery,
  getDeliverySettings,
  updateDeliverySettings,
  listZones,
  getZoneById,
  insertZone,
  updateZone,
  deleteZone,
  getRateCard,
  findActiveDeliveryByReference,
  insertDeliveryItem,
  getOrderLines,
  getPOSLines,
  getOrderForDelivery,
  getPosTransactionForDelivery,
  insertTrackingEntry,
  findDispatchable,
  getDeliveryItems,
  setDispatched,
  setDelivered,
  getDeliveryContact,
  setFailed,
  getLogisticsManagers,
  getTracking,
  updateDelivery,
};
