"use strict";

// ─────────────────────────────────────────────────────────────
// modules/store/store.repository
//
// SQL for the `store` schema — the Orika Living storefront, run as
// a sales channel of the ERP.
//
// IMPORTANT: store routes execute under withStoreContext, so the
// search_path is `store, public`. Any reference to ERP tables must
// be fully schema-qualified — `diffusers.products`,
// `diffusers.stock_movements`, `shared.contacts`.
//
// Storefront products carry no price or stock of their own. Every
// product read JOINs diffusers.products for selling_price and a
// SUM over diffusers.stock_movements for stock-on-hand, so the
// storefront figure always equals the ERP figure.
// ─────────────────────────────────────────────────────────────

// The product SELECT shared by every storefront product query.
// Returns the storefront's expected shape (price_kobo, stock_qty,
// in_stock) computed live from the ERP.
const PRODUCT_SELECT = `
  SELECT
    sp.id,
    sp.product_id,
    sp.slug,
    sp.scent_family,
    sp.format,
    sp.size_ml,
    -- Images derived LIVE from the ERP gallery (product_images → documents),
    -- primary first then display_order. Falls back to the legacy
    -- store.products.images array only if the gallery is empty (e.g. seeded
    -- products with explicit URLs). Paths are relative to the API origin;
    -- the storefront resolves them against NEXT_PUBLIC_API_URL.
    COALESCE(
      NULLIF(img.urls, '{}'),
      sp.images
    ) AS images,
    sp.top_notes,
    sp.heart_notes,
    sp.base_notes,
    sp.is_published,
    sp.created_at,
    dp.name,
    COALESCE(sp.web_description, dp.description) AS description,
    -- ERP selling_price is naira numeric; the storefront wants kobo.
    (dp.selling_price * 100)::bigint AS price_kobo,
    -- stock-on-hand = SUM(quantity * direction) over the ERP ledger.
    COALESCE(st.qty, 0)::int AS stock_qty,
    (COALESCE(st.qty, 0) > 0) AS in_stock
  FROM store.products sp
  JOIN diffusers.products dp ON dp.product_id = sp.product_id
  LEFT JOIN LATERAL (
    SELECT SUM(quantity * direction) AS qty
    FROM diffusers.stock_movements sm
    WHERE sm.product_id = sp.product_id
  ) st ON true
  LEFT JOIN LATERAL (
    SELECT array_agg(
             '/api/documents/' || pi.document_id || '/image'
             ORDER BY pi.is_primary DESC, pi.display_order, pi.image_id
           ) AS urls
    FROM diffusers.product_images pi
    WHERE pi.product_id = sp.product_id
  ) img ON true
`;

// ── PRODUCTS (public reads) ──────────────────────────────────

async function listActiveProducts(client) {
  // No stock filter — out-of-stock products are shown with a "Sold Out"
  // badge on the storefront, never hidden. in_stock/stock_qty in
  // PRODUCT_SELECT still tell the UI which to badge.
  const { rows } = await client.query(
    `${PRODUCT_SELECT}
     WHERE sp.is_published = true
       AND dp.is_deleted = false
     ORDER BY sp.created_at DESC`,
  );
  return rows;
}

async function listFeaturedProducts(client, format, limit) {
  // No stock filter — see listActiveProducts.
  const { rows } = await client.query(
    `${PRODUCT_SELECT}
     WHERE sp.is_published = true
       AND dp.is_deleted = false
       AND sp.format = $1
     ORDER BY sp.created_at DESC
     LIMIT $2`,
    [format, limit],
  );
  return rows;
}

async function findProductBySlug(client, slug) {
  const {
    rows: [row],
  } = await client.query(`${PRODUCT_SELECT} WHERE sp.slug = $1`, [slug]);
  return row || null;
}

async function findStoreProductById(client, id) {
  const {
    rows: [row],
  } = await client.query(`${PRODUCT_SELECT} WHERE sp.id = $1`, [id]);
  return row || null;
}

async function findStoreProductsByIds(client, ids) {
  // Used at checkout — resolves the storefront ids the cart sent.
  const { rows } = await client.query(
    `${PRODUCT_SELECT} WHERE sp.id = ANY($1::uuid[])`,
    [ids],
  );
  return rows;
}

async function listRelatedProducts(client, family, excludeId, limit) {
  // No stock filter — see listActiveProducts.
  const { rows } = await client.query(
    `${PRODUCT_SELECT}
     WHERE sp.is_published = true
       AND dp.is_deleted = false
       AND sp.scent_family = $1
       AND sp.id != $2
     ORDER BY sp.created_at DESC
     LIMIT $3`,
    [family, excludeId, limit],
  );
  return rows;
}

// ── SCENTS / SIGNATURES ──────────────────────────────────────

// Scents shown on the storefront are derived from what's actually been
// published to store.products — every distinct scent_family that has at
// least one published product appears, REGARDLESS of stock. (Stock only
// matters on the stockist/availability surfaces, never here.) Each family
// is enriched with presentation copy/styling from store.scents when a row
// exists; otherwise sensible fallbacks are used so a freshly-uploaded
// product's scent still renders. store.scents alone is NOT the source of
// truth — products drive which scents appear.
async function listScents(client) {
  const { rows } = await client.query(
    `SELECT
       p.scent_family                                   AS family,
       COALESCE(s.name, p.scent_family::text)           AS name,
       COALESCE(
         s.slug,
         lower(regexp_replace(p.scent_family::text, '[^a-zA-Z0-9]+', '-', 'g'))
       )                                                AS slug,
       COALESCE(s.tagline, '')                          AS tagline,
       COALESCE(s.description, '')                      AS description,
       COALESCE(s.top_notes,   p.top_notes,   '{}')     AS top_notes,
       COALESCE(s.heart_notes, p.heart_notes, '{}')     AS heart_notes,
       COALESCE(s.base_notes,  p.base_notes,  '{}')     AS base_notes,
       COALESCE(s.swatch, NULL)                         AS swatch,
       COALESCE(s.ink,    NULL)                          AS ink,
       COALESCE(
         s.image,
         NULLIF(p.gallery_image, ''),
         NULLIF(p.images[1], '')
       )                                                AS image,
       COALESCE(s.display_order, 0)                     AS display_order
     FROM (
       -- One representative published product per scent family.
       -- DISTINCT ON keeps the most recent product's notes/image as the
       -- fallback when store.scents has no styling row for that family.
       SELECT DISTINCT ON (sp.scent_family)
              sp.scent_family, sp.top_notes, sp.heart_notes, sp.base_notes, sp.images,
              (SELECT '/api/documents/' || pi.document_id || '/image'
               FROM diffusers.product_images pi
               WHERE pi.product_id = sp.product_id
               ORDER BY pi.is_primary DESC, pi.display_order, pi.image_id
               LIMIT 1)                                 AS gallery_image
       FROM store.products sp
       WHERE sp.is_published = true
       ORDER BY sp.scent_family, sp.created_at DESC
     ) p
     LEFT JOIN store.scents s ON s.family = p.scent_family
     ORDER BY display_order, name`,
  );
  return rows;
}

async function findScentBySlug(client, slug) {
  // Mirror listScents (product-derived, store.scents-enriched) but for a
  // single slug — so any scent visible in the list is fetchable by slug.
  const {
    rows: [row],
  } = await client.query(
    `SELECT
       p.scent_family                                   AS family,
       COALESCE(s.name, p.scent_family::text)           AS name,
       COALESCE(
         s.slug,
         lower(regexp_replace(p.scent_family::text, '[^a-zA-Z0-9]+', '-', 'g'))
       )                                                AS slug,
       COALESCE(s.tagline, '')                          AS tagline,
       COALESCE(s.description, '')                      AS description,
       COALESCE(s.top_notes,   p.top_notes,   '{}')     AS top_notes,
       COALESCE(s.heart_notes, p.heart_notes, '{}')     AS heart_notes,
       COALESCE(s.base_notes,  p.base_notes,  '{}')     AS base_notes,
       COALESCE(s.swatch, NULL)                         AS swatch,
       COALESCE(s.ink,    NULL)                          AS ink,
       COALESCE(
         s.image,
         NULLIF(p.gallery_image, ''),
         NULLIF(p.images[1], '')
       )                                                AS image,
       COALESCE(s.display_order, 0)                     AS display_order
     FROM (
       SELECT DISTINCT ON (sp.scent_family)
              sp.scent_family, sp.top_notes, sp.heart_notes, sp.base_notes, sp.images,
              (SELECT '/api/documents/' || pi.document_id || '/image'
               FROM diffusers.product_images pi
               WHERE pi.product_id = sp.product_id
               ORDER BY pi.is_primary DESC, pi.display_order, pi.image_id
               LIMIT 1)                                 AS gallery_image
       FROM store.products sp
       WHERE sp.is_published = true
       ORDER BY sp.scent_family, sp.created_at DESC
     ) p
     LEFT JOIN store.scents s ON s.family = p.scent_family
     WHERE COALESCE(
       s.slug,
       lower(regexp_replace(p.scent_family::text, '[^a-zA-Z0-9]+', '-', 'g'))
     ) = $1`,
    [slug],
  );
  return row || null;
}

async function listSignatures(client) {
  const { rows } = await client.query(
    `SELECT * FROM store.signatures ORDER BY display_order, name`,
  );
  return rows;
}

// ── CUSTOMERS ────────────────────────────────────────────────

async function findCustomerByEmail(client, email) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM store.customers WHERE lower(email) = lower($1)`,
    [email],
  );
  return row || null;
}

async function insertCustomer(client, { contactId, email, fullName, phone }) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO store.customers (contact_id, email, full_name, phone)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [contactId || null, email, fullName, phone],
  );
  return row;
}

async function incrementCustomerOrders(client, customerId) {
  await client.query(
    `UPDATE store.customers SET total_orders = total_orders + 1
     WHERE id = $1`,
    [customerId],
  );
}

// ── CONTACTS (ERP CRM link) ──────────────────────────────────

async function findContactByEmail(client, email) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT contact_id FROM shared.contacts WHERE lower(email) = lower($1)`,
    [email],
  );
  return row || null;
}

async function insertContact(client, { displayName, email, phone }) {
  // Create an ERP contact for a web buyer so they appear in CRM.
  // contact_type is a text[] in shared.contacts — pass an array.
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.contacts
       (display_name, email, phone, contact_type)
     VALUES ($1, $2, $3, ARRAY['customer']::text[])
     RETURNING contact_id`,
    [displayName, email, phone || null],
  );
  return row;
}

// ── ORDERS ───────────────────────────────────────────────────

async function insertOrder(
  client,
  { customerId, totalKobo, deliveryAddress, items },
) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO store.orders
       (customer_id, status, total_kobo, delivery_address, items)
     VALUES ($1, 'pending', $2, $3::jsonb, $4::jsonb)
     RETURNING *`,
    [
      customerId,
      totalKobo,
      JSON.stringify(deliveryAddress),
      JSON.stringify(items),
    ],
  );
  return row;
}

async function setOrderPaystackRef(client, orderId, ref) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE store.orders SET paystack_ref = $2 WHERE id = $1 RETURNING *`,
    [orderId, ref],
  );
  return row || null;
}

async function findOrderById(client, id) {
  const {
    rows: [row],
  } = await client.query(`SELECT * FROM store.orders WHERE id = $1`, [id]);
  return row || null;
}

async function findOrderByRef(client, ref) {
  const {
    rows: [row],
  } = await client.query(`SELECT * FROM store.orders WHERE paystack_ref = $1`, [
    ref,
  ]);
  return row || null;
}

/**
 * Idempotently flip an order pending → paid AND record the ERP
 * journal ids in the same statement. Returns the updated row, or
 * null if the order was not 'pending' (already processed) — the
 * caller treats null as "already fulfilled, do nothing".
 *
 * Recording journal ids here, atomically with the status flip,
 * means a row can never be 'paid' without its journal references.
 */
async function markOrderPaidWithJournals(
  client,
  orderId,
  { journalEntryId, cogsEntryId },
) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE store.orders
     SET status = 'paid',
         paid_at = now(),
         journal_entry_id = $2,
         cogs_entry_id = $3
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [orderId, journalEntryId || null, cogsEntryId || null],
  );
  return row || null;
}

async function setOrderStatus(client, orderId, status) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE store.orders SET status = $2 WHERE id = $1 RETURNING *`,
    [orderId, status],
  );
  return row || null;
}

// ── ENQUIRIES ────────────────────────────────────────────────

async function insertEnquiry(client, e) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO store.enquiries (name, email, phone, type, message)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [e.name, e.email, e.phone, e.type, e.message],
  );
  return row;
}

// ── NEWSLETTER ───────────────────────────────────────────────

async function findSubscriber(client, email) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM store.newsletter_subscribers
     WHERE lower(email) = lower($1)`,
    [email],
  );
  return row || null;
}

async function upsertSubscriber(client, { email, source }) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO store.newsletter_subscribers (email, source)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET
       unsubscribed_at = NULL,
       source = EXCLUDED.source
     RETURNING *`,
    [email.toLowerCase(), source || "footer"],
  );
  return row;
}

async function unsubscribeByToken(client, token) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE store.newsletter_subscribers
     SET unsubscribed_at = now()
     WHERE unsubscribe_token = $1 AND unsubscribed_at IS NULL
     RETURNING *`,
    [token],
  );
  return row || null;
}

module.exports = {
  // products
  listActiveProducts,
  listFeaturedProducts,
  findProductBySlug,
  findStoreProductById,
  findStoreProductsByIds,
  listRelatedProducts,
  // scents / signatures
  listScents,
  findScentBySlug,
  listSignatures,
  // customers + contacts
  findCustomerByEmail,
  insertCustomer,
  incrementCustomerOrders,
  findContactByEmail,
  insertContact,
  // orders
  insertOrder,
  setOrderPaystackRef,
  findOrderById,
  findOrderByRef,
  markOrderPaidWithJournals,
  setOrderStatus,
  // enquiries
  insertEnquiry,
  // newsletter
  findSubscriber,
  upsertSubscriber,
  unsubscribeByToken,
};
