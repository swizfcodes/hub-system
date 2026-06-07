"use strict";

async function listDeliveries(client, { status, courier, limit, offset }) {
  const { rows } = await client.query(
    `SELECT d.delivery_id, d.delivery_number, d.status, d.courier,
            d.delivery_fee, d.dispatched_at, d.delivered_at, d.created_at,
            c.display_name AS contact_name, c.primary_phone
     FROM deliveries d
     JOIN shared.contacts c ON c.contact_id = d.contact_id
     WHERE ($1::TEXT IS NULL OR d.status  = $1)
       AND ($2::TEXT IS NULL OR d.courier = $2)
     ORDER BY d.created_at DESC
     LIMIT $3 OFFSET $4`,
    [status || null, courier || null, limit, offset],
  );
  return rows;
}

async function findDeliveryById(client, deliveryId) {
  const {
    rows: [delivery],
  } = await client.query(
    `SELECT d.*,
            c.display_name AS contact_name, c.primary_phone, c.whatsapp_number,
            json_agg(di.* ORDER BY di.item_id) FILTER (WHERE di.item_id IS NOT NULL) AS items,
            json_agg(dt.* ORDER BY dt.occurred_at DESC) FILTER (WHERE dt.track_id IS NOT NULL) AS tracking_history
     FROM deliveries d
     JOIN shared.contacts c ON c.contact_id = d.contact_id
     LEFT JOIN delivery_items    di ON di.delivery_id = d.delivery_id
     LEFT JOIN delivery_tracking dt ON dt.delivery_id = d.delivery_id
     WHERE d.delivery_id = $1
     GROUP BY d.delivery_id, c.display_name, c.primary_phone, c.whatsapp_number`,
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
    `SELECT product_id, description, quantity FROM order_lines WHERE order_id = $1 AND status = 'pending'`,
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

async function setDispatched(client, { deliveryId, courierId, waybill }) {
  const {
    rows: [updated],
  } = await client.query(
    `UPDATE deliveries SET status='dispatched', courier_order_id=$1, waybill_number=$2, dispatched_at=now(), updated_at=now() WHERE delivery_id=$3 RETURNING *`,
    [courierId || null, waybill || null, deliveryId],
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

module.exports = {
  listDeliveries,
  findDeliveryById,
  insertDelivery,
  insertDeliveryItem,
  getOrderLines,
  getPOSLines,
  insertTrackingEntry,
  findDispatchable,
  getDeliveryItems,
  setDispatched,
  setDelivered,
  getDeliveryContact,
  setFailed,
  getLogisticsManagers,
  getTracking,
};
