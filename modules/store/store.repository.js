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
// ── SCENTS ADMIN (presentation overrides) ────────────────────
// Scents are derived from published products; this lets staff override
// the presentation (name/tagline/colour/hero image/description) by
// writing store.scents, which the storefront read-path already merges.

// Editable scents = families that actually have a published product,
// LEFT JOINed to any existing store.scents override row so the admin
// shows current values (override if present, else derived defaults).
async function listEditableScents(client) {
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
       s.swatch                                         AS swatch,
       s.ink                                            AS ink,
       s.image                                          AS image,
       COALESCE(s.display_order, 0)                     AS display_order,
       (s.family IS NOT NULL)                           AS has_override
     FROM (
       SELECT DISTINCT scent_family
       FROM store.products
       WHERE is_published = true
     ) p
     LEFT JOIN store.scents s ON s.family = p.scent_family
     ORDER BY display_order, name`,
  );
  return rows;
}

// Upsert a scent's presentation row. Keyed by family (PK). Notes are left
// to the product-derived values (not edited here), so we keep existing
// note arrays on conflict and only touch presentation fields.
async function upsertScent(client, s) {
  const slug =
    s.slug ||
    s.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO store.scents
       (family, name, slug, tagline, description, swatch, ink, image, display_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (family) DO UPDATE SET
       name          = EXCLUDED.name,
       slug          = EXCLUDED.slug,
       tagline       = EXCLUDED.tagline,
       description   = EXCLUDED.description,
       swatch        = EXCLUDED.swatch,
       ink           = EXCLUDED.ink,
       image         = EXCLUDED.image,
       display_order = EXCLUDED.display_order,
       updated_at    = now()
     RETURNING *`,
    [
      s.family,
      s.name,
      slug,
      s.tagline || "",
      s.description || "",
      s.swatch || "#2B2820",
      s.ink || "#F2EDE4",
      s.image || null,
      s.display_order ?? 0,
    ],
  );
  return row;
}

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
       (display_name, email, primary_phone, contact_type)
     VALUES ($1, $2, $3, ARRAY['customer']::text[])
     RETURNING contact_id`,
    [displayName, email, phone || null],
  );
  return row;
}

// ── ERP SALES-ORDER BRIDGE ───────────────────────────────────
// Web orders become real diffusers.sales_orders so they flow the
// ERP sales pipeline and show in ERP Sales. These run from store
// context, so diffusers.* is explicitly qualified. source='web'
// distinguishes them from manually-created orders.

async function insertSalesOrderForWeb(
  client,
  { orderNumber, contactId, totalNaira },
) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO diffusers.sales_orders
       (order_number, contact_id, status, fulfilment_type,
        total_amount, amount_paid, source, created_by)
     VALUES ($1, $2, 'confirmed', 'delivery', $3, 0, 'web', NULL)
     RETURNING order_id, order_number`,
    [orderNumber, contactId, totalNaira],
  );
  return row;
}

async function insertSalesOrderLinesForWeb(client, { orderId, lineItems }) {
  for (const item of lineItems) {
    const lineTotal = (Number(item.price_kobo) / 100) * item.quantity;
    await client.query(
      `INSERT INTO diffusers.order_lines
         (order_id, product_id, description, quantity, unit_price,
          line_total, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [
        orderId,
        item.erp_product_id,
        item.name,
        item.quantity,
        Number(item.price_kobo) / 100,
        lineTotal,
      ],
    );
  }
}

async function linkStoreOrderToSalesOrder(client, storeOrderId, salesOrderId) {
  await client.query(
    `UPDATE store.orders SET sales_order_id = $2 WHERE id = $1`,
    [storeOrderId, salesOrderId],
  );
}

// Settle the linked sales order on payment: mark it fully paid and
// flip its lines to fulfilled, mirroring a completed ERP sale.
async function settleSalesOrderForWeb(client, salesOrderId) {
  await client.query(
    `UPDATE diffusers.sales_orders
       SET amount_paid = total_amount,
           status = 'fulfilled',
           updated_at = now()
     WHERE order_id = $1`,
    [salesOrderId],
  );
  await client.query(
    `UPDATE diffusers.order_lines
       SET status = 'fulfilled'
     WHERE order_id = $1`,
    [salesOrderId],
  );
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

// List enquiries for the ERP inbox (filter by status/type, search
// name/email/message). Business-agnostic store schema.
async function listEnquiries(client, { search, status, type } = {}) {
  const where = [];
  const params = [];
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (type) {
    params.push(type);
    where.push(`type = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const i = params.length;
    where.push(
      `(lower(name) LIKE $${i} OR lower(email) LIKE $${i} OR lower(message) LIKE $${i})`,
    );
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await client.query(
    `SELECT id, name, email, phone, type, message, status, created_at
     FROM store.enquiries
     ${whereSql}
     ORDER BY created_at DESC`,
    params,
  );
  return rows;
}

async function enquiryCounts(client) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE status = 'new')::int AS new,
       count(*) FILTER (WHERE status = 'replied')::int AS replied,
       count(*) FILTER (WHERE status = 'closed')::int AS closed
     FROM store.enquiries`,
  );
  return row;
}

async function updateEnquiryStatus(client, id, status) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE store.enquiries SET status = $2 WHERE id = $1 RETURNING *`,
    [id, status],
  );
  return row || null;
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

// List newsletter subscribers for the ERP (search + active filter).
// Business-agnostic — store schema is shared across the storefront.
async function listSubscribers(client, { search, status } = {}) {
  const where = [];
  const params = [];
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(`lower(email) LIKE $${params.length}`);
  }
  if (status === "active") where.push(`unsubscribed_at IS NULL`);
  if (status === "unsubscribed") where.push(`unsubscribed_at IS NOT NULL`);

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const { rows } = await client.query(
    `SELECT email, subscribed_at, unsubscribed_at, source,
            (unsubscribed_at IS NULL) AS is_active
     FROM store.newsletter_subscribers
     ${whereSql}
     ORDER BY subscribed_at DESC`,
    params,
  );
  return rows;
}

async function subscriberCounts(client) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE unsubscribed_at IS NULL)::int AS active,
       count(*) FILTER (WHERE unsubscribed_at IS NOT NULL)::int AS unsubscribed
     FROM store.newsletter_subscribers`,
  );
  return row;
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

// Tag a contact as a newsletter subscriber so the campaign engine can
// target them (audience_filter contact_type: ['subscriber']). If a
// contact with this email already exists, ADD 'subscriber' to its
// contact_type array (so an existing customer becomes
// ['customer','subscriber']); otherwise create a new subscriber contact.
// Idempotent — re-subscribing or backfilling won't duplicate the tag.
async function tagContactAsSubscriber(client, { email, fullName }) {
  const {
    rows: [existing],
  } = await client.query(
    `SELECT contact_id, contact_type FROM shared.contacts
     WHERE lower(email) = lower($1)`,
    [email],
  );

  if (existing) {
    // Add 'subscriber' only if not already present.
    await client.query(
      `UPDATE shared.contacts
         SET contact_type = (
           SELECT ARRAY(SELECT DISTINCT unnest(contact_type || ARRAY['subscriber']::text[]))
         )
       WHERE contact_id = $1
         AND NOT (contact_type @> ARRAY['subscriber']::text[])`,
      [existing.contact_id],
    );
    return existing.contact_id;
  }

  const {
    rows: [created],
  } = await client.query(
    `INSERT INTO shared.contacts (display_name, primary_phone, email, contact_type)
     VALUES ($1, '', $2, ARRAY['subscriber']::text[])
     RETURNING contact_id`,
    [fullName || email, email.toLowerCase()],
  );
  return created.contact_id;
}

// Remove the 'subscriber' tag so newsletter campaigns stop targeting them.
// Other contact types (e.g. 'customer') are preserved. The store
// newsletter_subscribers row is marked unsubscribed separately.
async function untagContactSubscriber(client, email) {
  await client.query(
    `UPDATE shared.contacts
       SET contact_type = array_remove(contact_type, 'subscriber')
     WHERE lower(email) = lower($1)
       AND contact_type @> ARRAY['subscriber']::text[]`,
    [email],
  );
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
  // scents
  listEditableScents,
  upsertScent,
  listScents,
  findScentBySlug,
  listSignatures,
  // customers + contacts
  findCustomerByEmail,
  insertCustomer,
  incrementCustomerOrders,
  findContactByEmail,
  insertContact,
  // web → ERP sales-order bridge
  insertSalesOrderForWeb,
  insertSalesOrderLinesForWeb,
  linkStoreOrderToSalesOrder,
  settleSalesOrderForWeb,
  // orders
  insertOrder,
  setOrderPaystackRef,
  findOrderById,
  findOrderByRef,
  markOrderPaidWithJournals,
  setOrderStatus,
  // enquiries
  insertEnquiry,
  listEnquiries,
  enquiryCounts,
  updateEnquiryStatus,
  // newsletter
  findSubscriber,
  listSubscribers,
  subscriberCounts,
  upsertSubscriber,
  tagContactAsSubscriber,
  untagContactSubscriber,
  unsubscribeByToken,
};
