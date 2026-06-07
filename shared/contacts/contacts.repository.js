"use strict";

const { getActiveBusinesses } = require("../../config/businesses");

async function list(client, { business, search, type, limit, offset }) {
  const { rows } = await client.query(
    `SELECT contact_id, contact_type, display_name, first_name, last_name,
            primary_phone, whatsapp_number, email, priority_level, source,
            created_at, updated_at
     FROM shared.contacts
     WHERE is_deleted = false
       AND ($1 = ANY(visible_to) OR visible_to IS NULL)
       AND ($2::TEXT IS NULL OR display_name ILIKE $2 OR primary_phone ILIKE $2 OR email ILIKE $2)
       AND ($3::TEXT IS NULL OR $3 = ANY(contact_type))
     ORDER BY display_name ASC
     LIMIT $4 OFFSET $5`,
    [business, search ? `%${search}%` : null, type || null, limit, offset],
  );
  return rows;
}

async function count(client, business) {
  const {
    rows: [{ count }],
  } = await client.query(
    `SELECT COUNT(*) FROM shared.contacts WHERE is_deleted = false AND ($1 = ANY(visible_to) OR visible_to IS NULL)`,
    [business],
  );
  return parseInt(count);
}

/**
 * countFiltered — mirrors the WHERE clause in list() so pagination
 * totals are correct when search/type filters are active.
 */
async function countFiltered(client, business, { search = "", type } = {}) {
  const {
    rows: [{ count }],
  } = await client.query(
    `SELECT COUNT(*) FROM shared.contacts
     WHERE is_deleted = false
       AND ($1 = ANY(visible_to) OR visible_to IS NULL)
       AND ($2::TEXT IS NULL OR display_name ILIKE $2 OR primary_phone ILIKE $2 OR email ILIKE $2)
       AND ($3::TEXT IS NULL OR $3 = ANY(contact_type))`,
    [business, search ? `%${search}%` : null, type || null],
  );
  return parseInt(count);
}

async function findById(client, contactId) {
  const { rows } = await client.query(
    `SELECT c.*,
            json_agg(DISTINCT ca.*) FILTER (WHERE ca.address_id IS NOT NULL) AS addresses,
            json_agg(DISTINCT ct.*) FILTER (WHERE ct.tag_id IS NOT NULL) AS tags
     FROM shared.contacts c
     LEFT JOIN shared.contact_addresses ca ON ca.contact_id = c.contact_id
     LEFT JOIN shared.contact_tags ct ON ct.contact_id = c.contact_id
     WHERE c.contact_id = $1 AND c.is_deleted = false
     GROUP BY c.contact_id`,
    [contactId],
  );
  return rows[0] || null;
}

async function insert(
  client,
  {
    contact_type,
    display_name,
    first_name,
    last_name,
    company_name,
    primary_phone,
    whatsapp_number,
    email,
    priority_level,
    source,
    visible_to,
    notes,
    birthday_month,
    birthday_day,
    userId,
  },
) {
  const {
    rows: [contact],
  } = await client.query(
    `INSERT INTO shared.contacts
       (contact_type, display_name, first_name, last_name, company_name,
        primary_phone, whatsapp_number, email, priority_level, source,
        visible_to, notes, birthday_month, birthday_day, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      contact_type,
      display_name,
      first_name || null,
      last_name || null,
      company_name || null,
      primary_phone,
      whatsapp_number || null,
      email || null,
      priority_level || "regular",
      source || null,
      visible_to || getActiveBusinesses(),
      notes || null,
      birthday_month || null,
      birthday_day || null,
      userId,
    ],
  );
  return contact;
}

async function findForUpdate(client, contactId) {
  const {
    rows: [before],
  } = await client.query(
    `SELECT * FROM shared.contacts WHERE contact_id = $1`,
    [contactId],
  );
  return before || null;
}

async function update(client, contactId, sets, values) {
  const {
    rows: [after],
  } = await client.query(
    `UPDATE shared.contacts SET ${sets.join(", ")}, updated_at = now() WHERE contact_id = $${values.length} RETURNING *`,
    values,
  );
  return after;
}

async function softDelete(client, contactId) {
  const {
    rows: [before],
  } = await client.query(
    `UPDATE shared.contacts SET is_deleted = true, deleted_at = now(), updated_at = now() WHERE contact_id = $1 RETURNING *`,
    [contactId],
  );
  return before || null;
}

async function getActivities(client, contactId, business) {
  const { rows } = await client.query(
    `SELECT activity_id, activity_type, summary, direction, performed_at, is_auto FROM ${business}.crm_activities WHERE contact_id = $1 ORDER BY performed_at DESC LIMIT 50`,
    [contactId],
  );
  return rows;
}

async function getInvoices(client, contactId, business) {
  const { rows } = await client.query(
    `SELECT invoice_id, invoice_number, total_amount, amount_paid, status, issue_date FROM ${business}.invoices WHERE contact_id = $1 AND is_deleted = false ORDER BY issue_date DESC LIMIT 20`,
    [contactId],
  );
  return rows;
}

async function getDeals(client, contactId, business) {
  const { rows } = await client.query(
    `SELECT deal_id, title, stage, expected_value, created_at FROM ${business}.crm_deals WHERE contact_id = $1 AND is_deleted = false ORDER BY created_at DESC LIMIT 10`,
    [contactId],
  );
  return rows;
}

async function clearDefaultAddresses(client, { contactId, address_type }) {
  await client.query(
    `UPDATE shared.contact_addresses SET is_default = false WHERE contact_id = $1 AND address_type = $2`,
    [contactId, address_type || "delivery"],
  );
}

async function insertAddress(
  client,
  {
    contactId,
    address_type,
    line1,
    line2,
    area,
    city,
    state,
    country,
    landmark,
    recipient_name,
    recipient_phone,
    is_default,
    userId,
  },
) {
  const {
    rows: [address],
  } = await client.query(
    `INSERT INTO shared.contact_addresses
       (contact_id, address_type, line1, line2, area, city, state, country,
        landmark, recipient_name, recipient_phone, is_default, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      contactId,
      address_type || "delivery",
      line1,
      line2 || null,
      area || null,
      city || "Lagos",
      state || "Lagos",
      country || "Nigeria",
      landmark || null,
      recipient_name || null,
      recipient_phone || null,
      is_default || false,
      userId,
    ],
  );
  return address;
}

module.exports = {
  list,
  count,
  countFiltered,
  findById,
  insert,
  findForUpdate,
  update,
  softDelete,
  getActivities,
  getInvoices,
  getDeals,
  clearDefaultAddresses,
  insertAddress,
};
