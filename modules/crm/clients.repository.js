"use strict";

// ─────────────────────────────────────────────────────────────
// CRM CLIENTS REPOSITORY
//
// The clients-first CRM workspace. Everything here is computed
// per business (queries run inside withBusinessContext, so
// unqualified tables resolve to the active business schema).
//
// Spend truth: invoices. POS checkouts, web orders and manual
// sales all produce an invoice row carrying contact_id, so
// SUM(amount_paid) over non-voided invoices is lifetime spend
// without double counting.
//
// Segments are computed on the fly from crm_settings thresholds:
//   new          joined or first purchased within new_customer_days
//   lapsed       purchased before, silent for lapsed_days
//   big_spender  lifetime spend ≥ big_spender_threshold
//   active       has purchases, none of the above
//   prospect     customer record, no purchases yet
// VIP is an independent manual flag (contacts.priority_level).
// ─────────────────────────────────────────────────────────────

// Shared SELECT body: one row per customer with spend aggregates,
// loyalty points, next birthday and computed segment.
const CLIENT_ROWS_CTE = `
  WITH cfg AS (SELECT * FROM crm_settings LIMIT 1),
  client_rows AS (
    SELECT c.contact_id, c.display_name, c.company_name,
           c.primary_phone, c.whatsapp_number, c.email,
           c.priority_level, c.source, c.created_at,
           (c.priority_level = 'vip') AS is_vip,
           shared.fn_next_birthday(
             COALESCE(c.birthday_month, EXTRACT(MONTH FROM c.date_of_birth)::int),
             COALESCE(c.birthday_day,   EXTRACT(DAY   FROM c.date_of_birth)::int)
           ) AS next_birthday,
           sp.total_spend, sp.purchase_count,
           sp.last_purchase_at, sp.first_purchase_at,
           ly.points AS loyalty_points,
           (sp.total_spend >= cfg.big_spender_threshold) AS is_big_spender,
           CASE
             WHEN sp.purchase_count = 0
                  AND c.created_at >= now() - make_interval(days => cfg.new_customer_days)
               THEN 'new'
             WHEN sp.purchase_count > 0
                  AND sp.first_purchase_at >= CURRENT_DATE - cfg.new_customer_days
               THEN 'new'
             WHEN sp.purchase_count > 0
                  AND sp.last_purchase_at < CURRENT_DATE - cfg.lapsed_days
               THEN 'lapsed'
             WHEN sp.total_spend >= cfg.big_spender_threshold THEN 'big_spender'
             WHEN sp.purchase_count > 0 THEN 'active'
             ELSE 'prospect'
           END AS segment,
           cfg.birthday_window_days
    FROM shared.contacts c
    CROSS JOIN cfg
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(i.amount_paid), 0)::numeric(14,2)      AS total_spend,
             COUNT(*) FILTER (WHERE i.amount_paid > 0)::int      AS purchase_count,
             MAX(i.issue_date) FILTER (WHERE i.amount_paid > 0)  AS last_purchase_at,
             MIN(i.issue_date) FILTER (WHERE i.amount_paid > 0)  AS first_purchase_at
      FROM invoices i
      WHERE i.contact_id = c.contact_id
        AND i.is_deleted = false AND i.status <> 'voided'
    ) sp ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(points), 0)::int AS points
      FROM loyalty_points WHERE contact_id = c.contact_id
    ) ly ON true
    WHERE 'customer' = ANY(c.contact_type)
      AND c.is_deleted = false
      AND $1 = ANY(c.visible_to)
  )
`;

const SEGMENT_FILTER = `
  CASE $2::text
    WHEN 'vip'         THEN q.is_vip
    WHEN 'new'         THEN q.segment = 'new'
    WHEN 'lapsed'      THEN q.segment = 'lapsed'
    WHEN 'big_spender' THEN q.is_big_spender
    WHEN 'active'      THEN q.segment = 'active'
    WHEN 'birthdays'   THEN q.next_birthday IS NOT NULL
                            AND q.next_birthday <= CURRENT_DATE + q.birthday_window_days
    ELSE true
  END
`;

const SORTS = {
  recent: `q.last_purchase_at DESC NULLS LAST, q.created_at DESC`,
  spend: `q.total_spend DESC, q.display_name ASC`,
  name: `q.display_name ASC`,
};

async function listClients(
  client,
  { business, search, segment, sort, limit, offset },
) {
  const orderBy = SORTS[sort] || SORTS.recent;
  const { rows } = await client.query(
    `${CLIENT_ROWS_CTE}
     SELECT q.* FROM client_rows q
     WHERE ($3::text IS NULL OR
            q.display_name ILIKE $3 OR q.company_name ILIKE $3 OR
            q.primary_phone ILIKE $3 OR q.email ILIKE $3)
       AND ${SEGMENT_FILTER}
     ORDER BY ${orderBy}
     LIMIT $4 OFFSET $5`,
    [business, segment || null, search ? `%${search}%` : null, limit, offset],
  );
  return rows;
}

async function countClients(client, { business, search, segment }) {
  const {
    rows: [{ count }],
  } = await client.query(
    `${CLIENT_ROWS_CTE}
     SELECT COUNT(*)::int AS count FROM client_rows q
     WHERE ($3::text IS NULL OR
            q.display_name ILIKE $3 OR q.company_name ILIKE $3 OR
            q.primary_phone ILIKE $3 OR q.email ILIKE $3)
       AND ${SEGMENT_FILTER}`,
    [business, segment || null, search ? `%${search}%` : null],
  );
  return count;
}

async function findClientCore(client, business, contactId) {
  const {
    rows: [row],
  } = await client.query(
    `${CLIENT_ROWS_CTE}
     SELECT q.* FROM client_rows q WHERE q.contact_id = $2`,
    [business, contactId],
  );
  return row || null;
}

// ── Client insights ──────────────────────────────────────────

async function getPurchaseCadenceDays(client, contactId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT AVG(diff)::numeric(8,1) AS avg_days
     FROM (
       SELECT issue_date - LAG(issue_date) OVER (ORDER BY issue_date) AS diff
       FROM invoices
       WHERE contact_id = $1 AND amount_paid > 0
         AND is_deleted = false AND status <> 'voided'
     ) t WHERE diff IS NOT NULL AND diff > 0`,
    [contactId],
  );
  return row?.avg_days ? parseFloat(row.avg_days) : null;
}

async function getTopCategories(client, contactId, limit = 3) {
  const { rows } = await client.query(
    `SELECT COALESCE(pc.name, 'Uncategorised') AS category,
            SUM(il.line_total)::numeric(14,2) AS total
     FROM invoice_lines il
     JOIN invoices i ON i.invoice_id = il.invoice_id
     LEFT JOIN products p ON p.product_id = il.product_id
     LEFT JOIN product_categories pc ON pc.category_id = p.category_id
     WHERE i.contact_id = $1 AND i.amount_paid > 0
       AND i.is_deleted = false AND i.status <> 'voided'
     GROUP BY 1 ORDER BY total DESC
     LIMIT $2`,
    [contactId, limit],
  );
  return rows;
}

async function getOpenBalance(client, contactId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT COALESCE(SUM(amount_outstanding), 0)::numeric(14,2) AS open_balance,
            COUNT(*) FILTER (WHERE status = 'overdue'
                             OR (status = 'sent' AND due_date < CURRENT_DATE))::int
              AS overdue_invoices
     FROM invoices
     WHERE contact_id = $1 AND is_deleted = false
       AND amount_outstanding > 0
       AND status NOT IN ('draft', 'voided')`,
    [contactId],
  );
  return row;
}

// ── Purchases (unified history = invoices incl. POS sales) ───

async function listPurchases(client, contactId, { limit, offset }) {
  const { rows } = await client.query(
    `SELECT i.invoice_id, i.invoice_number, i.invoice_type, i.status,
            i.issue_date, i.total_amount, i.amount_paid, i.amount_outstanding,
            i.currency,
            COALESCE(l.item_count, 0) AS item_count,
            l.summary
     FROM invoices i
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS item_count,
              STRING_AGG(description, ', ' ORDER BY display_order) FILTER (WHERE rn <= 3)
                AS summary
       FROM (
         SELECT description, display_order,
                ROW_NUMBER() OVER (ORDER BY display_order) AS rn
         FROM invoice_lines WHERE invoice_id = i.invoice_id
       ) il
     ) l ON true
     WHERE i.contact_id = $1 AND i.is_deleted = false AND i.status <> 'voided'
     ORDER BY i.issue_date DESC, i.created_at DESC
     LIMIT $2 OFFSET $3`,
    [contactId, limit, offset],
  );
  return rows;
}

// ── Contact-level notes (deal_id IS NULL) ────────────────────

async function listClientNotes(client, contactId) {
  const { rows } = await client.query(
    `SELECT n.note_id, n.content, n.is_pinned, n.created_at,
            u.email AS created_by_email
     FROM crm_notes n
     LEFT JOIN shared.users u ON u.user_id = n.created_by
     WHERE n.contact_id = $1 AND n.deal_id IS NULL
     ORDER BY n.is_pinned DESC, n.created_at DESC
     LIMIT 100`,
    [contactId],
  );
  return rows;
}

async function insertClientNote(client, contactId, { content, is_pinned, userId }) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO crm_notes (contact_id, content, is_pinned, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [contactId, content, is_pinned || false, userId || null],
  );
  return row;
}

// ── Today (the daily work feed) ──────────────────────────────

async function getUpcomingBirthdays(client, business) {
  const { rows } = await client.query(
    `${CLIENT_ROWS_CTE}
     SELECT q.contact_id, q.display_name, q.primary_phone, q.whatsapp_number,
            q.is_vip, q.segment, q.next_birthday,
            (q.next_birthday - CURRENT_DATE)::int AS days_away
     FROM client_rows q
     WHERE q.next_birthday IS NOT NULL
       AND q.next_birthday <= CURRENT_DATE + q.birthday_window_days
     ORDER BY q.next_birthday ASC
     LIMIT 15`,
    [business],
  );
  return rows;
}

async function getUpcomingMilestones(client) {
  const { rows } = await client.query(
    `SELECT m.milestone_id, m.contact_id, m.milestone_type, m.notes,
            c.display_name, c.primary_phone, c.whatsapp_number,
            shared.fn_next_birthday(
              EXTRACT(MONTH FROM m.milestone_date)::int,
              EXTRACT(DAY   FROM m.milestone_date)::int
            ) AS next_date
     FROM customer_milestones m
     JOIN shared.contacts c ON c.contact_id = m.contact_id
     CROSS JOIN crm_settings cfg
     WHERE m.milestone_type <> 'birthday'  -- birthdays come from contacts
       AND shared.fn_next_birthday(
             EXTRACT(MONTH FROM m.milestone_date)::int,
             EXTRACT(DAY   FROM m.milestone_date)::int
           ) <= CURRENT_DATE + cfg.birthday_window_days
     ORDER BY next_date ASC
     LIMIT 15`,
  );
  return rows;
}

async function getClientsToWelcome(client, business) {
  const { rows } = await client.query(
    `${CLIENT_ROWS_CTE}
     SELECT q.contact_id, q.display_name, q.primary_phone, q.whatsapp_number,
            q.source, q.created_at, q.first_purchase_at, q.total_spend, q.segment
     FROM client_rows q
     WHERE q.segment = 'new'
     ORDER BY q.created_at DESC
     LIMIT 15`,
    [business],
  );
  return rows;
}

async function getLapsedClients(client, business) {
  const { rows } = await client.query(
    `${CLIENT_ROWS_CTE}
     SELECT q.contact_id, q.display_name, q.primary_phone, q.whatsapp_number,
            q.is_vip, q.total_spend, q.last_purchase_at,
            (CURRENT_DATE - q.last_purchase_at)::int AS days_silent
     FROM client_rows q
     WHERE q.segment = 'lapsed'
     ORDER BY q.is_vip DESC, q.total_spend DESC
     LIMIT 15`,
    [business],
  );
  return rows;
}

async function getTopClientsThisMonth(client) {
  const { rows } = await client.query(
    `SELECT c.contact_id, c.display_name, c.primary_phone, c.whatsapp_number,
            (c.priority_level = 'vip') AS is_vip,
            SUM(i.amount_paid)::numeric(14,2) AS spend_this_month,
            COUNT(*)::int AS purchases_this_month
     FROM invoices i
     JOIN shared.contacts c ON c.contact_id = i.contact_id
     WHERE i.is_deleted = false AND i.status <> 'voided'
       AND i.amount_paid > 0
       AND i.issue_date >= date_trunc('month', CURRENT_DATE)
     GROUP BY c.contact_id, c.display_name, c.primary_phone,
              c.whatsapp_number, c.priority_level
     ORDER BY spend_this_month DESC
     LIMIT 10`,
  );
  return rows;
}

async function getFollowUps(client) {
  // Two kinds of work: open B2B deals gone quiet, and overdue money.
  const { rows: staleDeals } = await client.query(
    `SELECT d.deal_id, d.title, d.stage, d.expected_value, d.contact_id,
            c.display_name, c.primary_phone, c.whatsapp_number,
            GREATEST(d.updated_at, COALESCE(a.last_activity_at, d.created_at))
              AS last_touch_at,
            (CURRENT_DATE - GREATEST(d.updated_at,
              COALESCE(a.last_activity_at, d.created_at))::date)::int AS days_quiet
     FROM crm_deals d
     JOIN shared.contacts c ON c.contact_id = d.contact_id
     CROSS JOIN crm_settings cfg
     LEFT JOIN LATERAL (
       SELECT MAX(performed_at) AS last_activity_at
       FROM crm_activities WHERE deal_id = d.deal_id
     ) a ON true
     JOIN shared.pipeline_stage_defs sd
       ON sd.stage_key = d.stage AND sd.pipeline_type = 'crm'
      AND sd.business = current_schema()
     WHERE d.is_deleted = false AND sd.is_terminal = false
       AND GREATEST(d.updated_at, COALESCE(a.last_activity_at, d.created_at))
           < now() - make_interval(days => cfg.stale_deal_days)
     ORDER BY days_quiet DESC
     LIMIT 10`,
  );

  const { rows: overdueInvoices } = await client.query(
    `SELECT i.invoice_id, i.invoice_number, i.contact_id, i.due_date,
            i.amount_outstanding, c.display_name, c.primary_phone,
            c.whatsapp_number,
            (CURRENT_DATE - i.due_date)::int AS days_overdue
     FROM invoices i
     JOIN shared.contacts c ON c.contact_id = i.contact_id
     WHERE i.is_deleted = false
       AND i.amount_outstanding > 0
       AND (i.status = 'overdue' OR (i.status = 'sent' AND i.due_date < CURRENT_DATE))
     ORDER BY i.amount_outstanding DESC
     LIMIT 10`,
  );

  return { stale_deals: staleDeals, overdue_invoices: overdueInvoices };
}

// ── Settings ─────────────────────────────────────────────────

async function getSettings(client) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT lapsed_days, new_customer_days, big_spender_threshold,
            birthday_window_days, stale_deal_days, updated_at
     FROM crm_settings LIMIT 1`,
  );
  return row;
}

async function updateSettings(client, fields, userId) {
  const allowed = [
    "lapsed_days",
    "new_customer_days",
    "big_spender_threshold",
    "birthday_window_days",
    "stale_deal_days",
  ];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] === undefined) continue;
    sets.push(`${key} = $${i++}`);
    values.push(fields[key]);
  }
  if (!sets.length) return getSettings(client);
  sets.push(`updated_at = now()`, `updated_by = $${i++}`);
  values.push(userId || null);
  const {
    rows: [row],
  } = await client.query(
    `UPDATE crm_settings SET ${sets.join(", ")}
     RETURNING lapsed_days, new_customer_days, big_spender_threshold,
               birthday_window_days, stale_deal_days, updated_at`,
    values,
  );
  return row;
}

module.exports = {
  listClients,
  countClients,
  findClientCore,
  getPurchaseCadenceDays,
  getTopCategories,
  getOpenBalance,
  listPurchases,
  listClientNotes,
  insertClientNote,
  getUpcomingBirthdays,
  getUpcomingMilestones,
  getClientsToWelcome,
  getLapsedClients,
  getTopClientsThisMonth,
  getFollowUps,
  getSettings,
  updateSettings,
};
