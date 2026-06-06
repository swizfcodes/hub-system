"use strict";

// Default landing-page sections — applied when a campaign is created without
// an explicit `sections` payload, so the public page always has blocks to
// render (an empty {} would make the landing page render nothing).
const DEFAULT_CAMPAIGN_SECTIONS = {
  hero: true,
  countdown: true,
  products: true,
  inquiry_form: true,
  whatsapp_button: true,
  stock_indicator: true,
};

// ── CAMPAIGNS ─────────────────────────────────────────────────────────────────

async function listCampaigns(client, { status, limit = 20, offset = 0 }) {
  const { rows } = await client.query(
    `SELECT sc.campaign_id, sc.campaign_name, sc.slug, sc.template, sc.status,
            sc.headline, sc.hero_image_url, sc.start_date, sc.end_date,
            sc.is_evergreen, sc.created_at,
            COUNT(DISTINCT co.order_id) FILTER (WHERE co.status != 'cancelled') AS order_count,
            COALESCE(SUM(co.total_amount) FILTER (WHERE co.status = 'confirmed'), 0) AS confirmed_revenue,
            COUNT(DISTINCT cp.id) AS product_count
     FROM sales_campaigns sc
     LEFT JOIN campaign_orders co ON co.campaign_id = sc.campaign_id
     LEFT JOIN campaign_products cp ON cp.campaign_id = sc.campaign_id
     WHERE ($1::TEXT IS NULL OR sc.status = $1)
     GROUP BY sc.campaign_id
     ORDER BY sc.created_at DESC
     LIMIT $2 OFFSET $3`,
    [status || null, limit, offset],
  );
  return rows;
}

async function findCampaignById(client, campaignId) {
  // Subqueries avoid the PostgreSQL restriction on json_agg(DISTINCT ... ORDER BY ...).
  // The products subquery joins campaign_products with products so the admin UI
  // gets product_name, selling_price, and image_url alongside the campaign fields.
  const {
    rows: [campaign],
  } = await client.query(
    `SELECT sc.*,
            (SELECT COALESCE(
               jsonb_agg(
                 jsonb_build_object(
                   'id',                 cp.id,
                   'product_id',         cp.product_id,
                   'product_name',       p.name,
                   'selling_price',      p.selling_price,
                   'campaign_price',     cp.campaign_price,
                   'campaign_label',     cp.campaign_label,
                   'image_url',          COALESCE(
                                           cp.campaign_image_url,
                                           CASE WHEN pi.document_id IS NOT NULL
                                                THEN '/api/documents/' || pi.document_id || '/image'
                                                ELSE NULL END
                                         ),
                   'quantity_allocated', cp.quantity_allocated,
                   'quantity_sold',      cp.quantity_sold,
                   'quantity_reserved',  cp.quantity_reserved,
                   'quantity_available', CASE WHEN cp.quantity_allocated = 0 THEN NULL
                                              ELSE GREATEST(0, cp.quantity_allocated - cp.quantity_reserved - cp.quantity_sold) END,
                   'show_stock_count',   cp.show_stock_count,
                   'low_stock_threshold',cp.low_stock_threshold,
                   'display_order',      cp.display_order
                 ) ORDER BY cp.display_order
               ),
               '[]'::jsonb
             )
             FROM campaign_products cp
             JOIN products p ON p.product_id = cp.product_id
             LEFT JOIN product_images pi ON pi.product_id = p.product_id AND pi.is_primary = true
             WHERE cp.campaign_id = sc.campaign_id
            ) AS products,
            (SELECT COALESCE(
               jsonb_agg(
                 jsonb_build_object(
                   'id',             cba.id,
                   'bank_name',      cba.bank_name,
                   'account_number', cba.account_number,
                   'account_name',   cba.account_name,
                   'sort_code',      cba.sort_code,
                   'is_primary',     cba.is_primary,
                   'display_order',  cba.display_order
                 ) ORDER BY cba.display_order
               ),
               '[]'::jsonb
             )
             FROM campaign_bank_accounts cba
             WHERE cba.campaign_id = sc.campaign_id
            ) AS bank_accounts
     FROM sales_campaigns sc
     WHERE sc.campaign_id = $1`,
    [campaignId],
  );
  return campaign || null;
}

async function findCampaignBySlug(client, slug) {
  const {
    rows: [campaign],
  } = await client.query(`SELECT * FROM sales_campaigns WHERE slug = $1`, [
    slug,
  ]);
  return campaign || null;
}

async function insertCampaign(client, data) {
  const {
    rows: [campaign],
  } = await client.query(
    `INSERT INTO sales_campaigns
       (campaign_name, slug, campaign_type, template, status, headline, subheadline, body_copy,
        hero_image_url, discount_type, discount_value, sections,
        start_date, end_date, is_evergreen, whatsapp_number, inquiry_email,
        store_location, redirect_url, created_by, accent_color)
     VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`,
    [
      data.campaign_name,
      data.slug,
      data.campaign_type || "online",
      data.template || "editorial",
      data.headline || null,
      data.subheadline || null,
      data.body_copy || null,
      data.hero_image_url || null,
      data.discount_type || "none",
      data.discount_value || null,
      JSON.stringify(
        data.sections && Object.keys(data.sections).length
          ? data.sections
          : DEFAULT_CAMPAIGN_SECTIONS,
      ),
      data.start_date || null,
      data.end_date || null,
      data.is_evergreen || false,
      data.whatsapp_number || null,
      data.inquiry_email || null,
      data.store_location || null,
      data.redirect_url || null,
      data.created_by,
      data.accent_color || "#C9A86C",
    ],
  );
  return campaign;
}

async function updateCampaign(client, campaignId, fields) {
  const sets = [],
    values = [];
  const allowed = [
    "campaign_name",
    "slug",
    "campaign_type",
    "template",
    "status",
    "headline",
    "subheadline",
    "body_copy",
    "hero_image_url",
    "accent_color",
    "discount_type",
    "discount_value",
    "sections",
    "start_date",
    "end_date",
    "is_evergreen",
    "whatsapp_number",
    "inquiry_email",
    "store_location",
    "redirect_url",
    "qr_code_url",
  ];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      values.push(
        key === "sections" ? JSON.stringify(fields[key]) : fields[key],
      );
      sets.push(`${key} = $${values.length}`);
    }
  }
  if (!sets.length) return findCampaignById(client, campaignId);
  values.push(campaignId);
  const {
    rows: [row],
  } = await client.query(
    `UPDATE sales_campaigns SET ${sets.join(",")} WHERE campaign_id = $${values.length} RETURNING *`,
    values,
  );
  return row || null;
}

// ── CAMPAIGN PRODUCTS ─────────────────────────────────────────────────────────

async function upsertCampaignProduct(client, campaignId, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO campaign_products
       (campaign_id, product_id, display_order, campaign_price, campaign_label,
        campaign_image_url, quantity_allocated, show_stock_count, low_stock_threshold)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (campaign_id, product_id) DO UPDATE SET
       display_order = EXCLUDED.display_order,
       campaign_price = EXCLUDED.campaign_price,
       campaign_label = EXCLUDED.campaign_label,
       campaign_image_url = EXCLUDED.campaign_image_url,
       quantity_allocated = EXCLUDED.quantity_allocated,
       show_stock_count = EXCLUDED.show_stock_count,
       low_stock_threshold = EXCLUDED.low_stock_threshold
     RETURNING *`,
    [
      campaignId,
      data.product_id,
      data.display_order || 0,
      data.campaign_price || null,
      data.campaign_label || null,
      data.campaign_image_url || null,
      data.quantity_allocated || 0,
      data.show_stock_count !== false,
      data.low_stock_threshold || 5,
    ],
  );
  return row;
}

async function removeCampaignProduct(client, campaignId, productId) {
  const { rowCount } = await client.query(
    `DELETE FROM campaign_products WHERE campaign_id = $1 AND product_id = $2`,
    [campaignId, productId],
  );
  return rowCount > 0;
}

async function deductCampaignStock(client, campaignProductId, quantity) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE campaign_products
     SET quantity_reserved = quantity_reserved + $2
     WHERE id = $1
       AND (quantity_allocated = 0 OR quantity_reserved + quantity_sold + $2 <= quantity_allocated)
     RETURNING id, quantity_allocated, quantity_reserved, quantity_sold`,
    [campaignProductId, quantity],
  );
  return row || null; // null = insufficient stock
}

async function confirmCampaignStock(client, campaignProductId, quantity) {
  await client.query(
    `UPDATE campaign_products
     SET quantity_reserved = GREATEST(0, quantity_reserved - $2),
         quantity_sold = quantity_sold + $2
     WHERE id = $1`,
    [campaignProductId, quantity],
  );
}

async function restoreCampaignStock(client, campaignProductId, quantity) {
  await client.query(
    `UPDATE campaign_products
     SET quantity_reserved = GREATEST(0, quantity_reserved - $2)
     WHERE id = $1`,
    [campaignProductId, quantity],
  );
}

// ── BANK ACCOUNTS ─────────────────────────────────────────────────────────────

async function insertBankAccount(client, campaignId, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO campaign_bank_accounts
       (campaign_id, bank_name, account_number, account_name, sort_code, is_primary, display_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      campaignId,
      data.bank_name,
      data.account_number,
      data.account_name,
      data.sort_code || null,
      data.is_primary || false,
      data.display_order || 0,
    ],
  );
  return row;
}

async function deleteBankAccount(client, id, campaignId) {
  const { rowCount } = await client.query(
    `DELETE FROM campaign_bank_accounts WHERE id = $1 AND campaign_id = $2`,
    [id, campaignId],
  );
  return rowCount > 0;
}

// ── ORDERS ────────────────────────────────────────────────────────────────────

async function listOrders(
  client,
  { campaignId, status, limit = 50, offset = 0 },
) {
  const { rows } = await client.query(
    `SELECT co.*, sc.campaign_name, sc.slug,
            json_agg(jsonb_build_object(
              'product_name', coi.product_name,
              'quantity', coi.quantity,
              'unit_price', coi.unit_price,
              'line_total', coi.line_total
            )) AS items
     FROM campaign_orders co
     JOIN sales_campaigns sc ON sc.campaign_id = co.campaign_id
     LEFT JOIN campaign_order_items coi ON coi.order_id = co.order_id
     WHERE ($1::UUID IS NULL OR co.campaign_id = $1)
       AND ($2::TEXT IS NULL OR co.status = $2)
     GROUP BY co.order_id, sc.campaign_name, sc.slug
     ORDER BY co.created_at DESC
     LIMIT $3 OFFSET $4`,
    [campaignId || null, status || null, limit, offset],
  );
  return rows;
}

async function findOrderByToken(client, trackingToken) {
  const {
    rows: [order],
  } = await client.query(
    `SELECT co.*,
            json_agg(jsonb_build_object(
              'product_name', coi.product_name,
              'quantity', coi.quantity,
              'line_total', coi.line_total
            )) AS items
     FROM campaign_orders co
     LEFT JOIN campaign_order_items coi ON coi.order_id = co.order_id
     WHERE co.tracking_token = $1
     GROUP BY co.order_id`,
    [trackingToken],
  );
  return order || null;
}

async function insertOrder(client, data) {
  const {
    rows: [order],
  } = await client.query(
    `INSERT INTO campaign_orders
       (campaign_id, order_number, customer_name, customer_phone, customer_email,
        fulfilment_type, delivery_address, pickup_location, payment_method,
        subtotal, discount_amount, total_amount, source, bank_account_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      data.campaign_id,
      data.order_number,
      data.customer_name,
      data.customer_phone,
      data.customer_email || null,
      data.fulfilment_type,
      data.delivery_address ? JSON.stringify(data.delivery_address) : null,
      data.pickup_location || null,
      data.payment_method,
      data.subtotal,
      data.discount_amount || 0,
      data.total_amount,
      data.source || null,
      data.bank_account_id || null,
    ],
  );
  return order;
}

async function insertOrderItem(client, data) {
  await client.query(
    `INSERT INTO campaign_order_items
       (order_id, campaign_product_id, product_id, product_name, quantity, unit_price, discount_amount, line_total)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      data.order_id,
      data.campaign_product_id,
      data.product_id,
      data.product_name,
      data.quantity,
      data.unit_price,
      data.discount_amount || 0,
      data.line_total,
    ],
  );
}

async function updateOrderStatus(
  client,
  orderId,
  {
    status,
    cancellationReason,
    proofImageUrl,
    hubContactId,
    hubOrderId,
    hubInvoiceId,
    loyaltyPointsAwarded,
    paystackReference,
  },
) {
  const {
    rows: [order],
  } = await client.query(
    `UPDATE campaign_orders SET
       status                 = COALESCE($2, status),
       cancellation_reason    = COALESCE($3, cancellation_reason),
       proof_image_url        = COALESCE($4, proof_image_url),
       proof_uploaded_at      = CASE WHEN $4 IS NOT NULL THEN now() ELSE proof_uploaded_at END,
       hub_contact_id         = COALESCE($5, hub_contact_id),
       hub_order_id           = COALESCE($6, hub_order_id),
       hub_invoice_id         = COALESCE($7, hub_invoice_id),
       loyalty_points_awarded = COALESCE($8, loyalty_points_awarded),
       paystack_reference     = COALESCE($9, paystack_reference)
     WHERE order_id = $1
     RETURNING *`,
    [
      orderId,
      status || null,
      cancellationReason || null,
      proofImageUrl || null,
      hubContactId || null,
      hubOrderId || null,
      hubInvoiceId || null,
      loyaltyPointsAwarded || null,
      paystackReference || null,
    ],
  );
  return order || null;
}

// ── PUBLIC STOREFRONT QUERY ───────────────────────────────────────────────────

// Returns the campaign with enriched product data (from the products table)
// used to render the public landing page — no auth required.
async function getStorefrontCampaign(client, slug) {
  const {
    rows: [campaign],
  } = await client.query(
    `SELECT sc.campaign_id, sc.campaign_name, sc.slug, sc.template, sc.status,
            sc.headline, sc.subheadline, sc.body_copy, sc.hero_image_url,
            sc.accent_color,
            sc.discount_type, sc.discount_value, sc.sections,
            sc.start_date, sc.end_date, sc.is_evergreen,
            sc.whatsapp_number, sc.store_location, sc.redirect_url,
            -- Aggregate products with live product data
            json_agg(
              jsonb_build_object(
                'id',                cp.id,
                'product_id',        cp.product_id,
                'product_name',      p.name,
                'sku',               p.sku,
                'description',       p.description,
                'image_url',         COALESCE(
                                       cp.campaign_image_url,
                                       (SELECT '/api/documents/' || pi.document_id || '/image'
                                          FROM product_images pi
                                         WHERE pi.product_id = p.product_id
                                           AND pi.is_primary = true
                                         ORDER BY pi.display_order
                                         LIMIT 1)
                                     ),
                'selling_price',     p.selling_price,
                'campaign_price',    cp.campaign_price,
                'effective_price',   COALESCE(cp.campaign_price, p.selling_price),
                'campaign_label',    cp.campaign_label,
                'quantity_available',
                  CASE WHEN cp.quantity_allocated = 0
                       THEN NULL
                       ELSE GREATEST(0, cp.quantity_allocated - cp.quantity_reserved - cp.quantity_sold)
                  END,
                'show_stock_count',  cp.show_stock_count,
                'low_stock_threshold', cp.low_stock_threshold,
                'display_order',     cp.display_order
              ) ORDER BY cp.display_order
            ) FILTER (WHERE cp.id IS NOT NULL) AS products,
            -- Bank accounts (for bank transfer payment)
            json_agg(DISTINCT jsonb_build_object(
              'id',             cba.id,
              'bank_name',      cba.bank_name,
              'account_number', cba.account_number,
              'account_name',   cba.account_name,
              'sort_code',      cba.sort_code,
              'is_primary',     cba.is_primary
            )) FILTER (WHERE cba.id IS NOT NULL) AS bank_accounts
     FROM sales_campaigns sc
     LEFT JOIN campaign_products cp ON cp.campaign_id = sc.campaign_id
     LEFT JOIN products p ON p.product_id = cp.product_id AND p.is_deleted = false
     LEFT JOIN campaign_bank_accounts cba ON cba.campaign_id = sc.campaign_id
     WHERE sc.slug = $1
     GROUP BY sc.campaign_id`,
    [slug],
  );
  return campaign || null;
}

// ── ANALYTICS ─────────────────────────────────────────────────────────────────

async function insertAnalyticsEvent(client, data) {
  await client.query(
    `INSERT INTO shared.campaign_analytics
       (campaign_id, business, slug, event_type, source, ip_hash, session_id, product_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      data.campaign_id,
      data.business,
      data.slug,
      data.event_type,
      data.source || null,
      data.ip_hash || null,
      data.session_id || null,
      data.product_id || null,
      data.metadata ? JSON.stringify(data.metadata) : null,
    ],
  );
}

async function getAnalytics(client, campaignId) {
  // Aggregate stats for the admin dashboard
  const { rows } = await client.query(
    `SELECT
       event_type,
       COUNT(*) AS total_events,
       COUNT(DISTINCT session_id) AS unique_sessions,
       COUNT(DISTINCT ip_hash) AS unique_ips,
       source
     FROM shared.campaign_analytics
     WHERE campaign_id = $1
     GROUP BY event_type, source
     ORDER BY event_type`,
    [campaignId],
  );
  return rows;
}

// ── LEADS ─────────────────────────────────────────────────────────────────────

async function insertLead(client, data) {
  const fullName = [data.first_name, data.last_name].filter(Boolean).join(" ") || data.name || null;
  const {
    rows: [lead],
  } = await client.query(
    `INSERT INTO shared.campaign_leads
       (campaign_id, business, slug,
        name, first_name, last_name,
        phone, email, message,
        address_city, address_state,
        wants_birthday, birthday_month, birthday_day,
        lead_type, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      data.campaign_id,
      data.business,
      data.slug,
      fullName,
      data.first_name || null,
      data.last_name  || null,
      data.phone      || null,
      data.email      || null,
      data.message    || null,
      data.address_city  || null,
      data.address_state || null,
      data.wants_birthday   ? true : false,
      data.birthday_month   || null,
      data.birthday_day     || null,
      data.lead_type || "form",
      data.source    || null,
    ],
  );
  return lead;
}

async function updateLeadContact(client, leadId, contactId) {
  await client.query(
    `UPDATE shared.campaign_leads SET hub_contact_id = $2 WHERE lead_id = $1`,
    [leadId, contactId],
  );
}

async function listLeads(client, { campaignId, business, limit = 50, offset = 0 }) {
  const { rows } = await client.query(
    `SELECT lead_id, first_name, last_name, name, phone, email,
            address_city, address_state,
            wants_birthday, birthday_month, birthday_day,
            lead_type, source, hub_contact_id, created_at
     FROM shared.campaign_leads
     WHERE campaign_id = $1 AND business = $2
     ORDER BY created_at DESC
     LIMIT $3 OFFSET $4`,
    [campaignId, business, limit, offset],
  );
  return rows;
}

async function countLeads(client, { campaignId, business }) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT COUNT(*) AS total FROM shared.campaign_leads
     WHERE campaign_id = $1 AND business = $2`,
    [campaignId, business],
  );
  return parseInt(row.total, 10);
}

module.exports = {
  listCampaigns,
  findCampaignById,
  findCampaignBySlug,
  insertCampaign,
  updateCampaign,
  upsertCampaignProduct,
  removeCampaignProduct,
  deductCampaignStock,
  confirmCampaignStock,
  restoreCampaignStock,
  insertBankAccount,
  deleteBankAccount,
  listOrders,
  findOrderByToken,
  insertOrder,
  insertOrderItem,
  updateOrderStatus,
  getStorefrontCampaign,
  insertAnalyticsEvent,
  getAnalytics,
  insertLead,
  updateLeadContact,
  listLeads,
  countLeads,
};
