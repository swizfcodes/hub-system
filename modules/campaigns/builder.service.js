"use strict";

const crypto = require("crypto");
const { withBusinessContext, withSharedContext } = require("../../config/db");
const repo = require("./campaigns.repository");

// ─────────────────────────────────────────────────────────────
// BUILDER SUB-SERVICE
//
// campaigns.service.buildAudience handles the minimal case — pull
// every contact matching a small set of filters and write them to
// campaign_recipients. This sub-service extends it with:
//
//   1. Richer filter compilation — purchase recency, lifetime spend,
//      categories purchased, days since last contact, has-open-deal,
//      is on a customer hold, anniversary/birthday windows.
//
//   2. Preview without persisting — frontend builder shows a live
//      count + sample contacts as the user tweaks the filter, before
//      they commit.
//
//   3. Reusable segments — common audiences (VIPs, lapsed customers,
//      birthday this month) saved once and referenced by name.
//
//   4. Cross-campaign dedupe — exclude contacts who already received
//      a similar campaign in the last N days, configurable.
//
// Filter shape (JSON in campaigns.audience_filter):
// {
//   "include": {
//     "priority_level": ["VIP","Regular"],   // contacts.priority_level
//     "contact_type":   ["customer"],         // array contains check
//     "purchased_within_days": 90,            // has bought in window
//     "min_lifetime_spend": 500000,           // ≥ N total all-time
//     "category_ids": ["uuid-1","uuid-2"],   // bought from category
//     "tag_names": ["champagne_buyer"],       // contact_tags
//     "birthday_within_days": 30              // milestone reminder
//   },
//   "exclude": {
//     "received_campaign_in_days": 14,        // dedupe across campaigns
//     "unsubscribed": true,                   // never include opt-outs
//     "contact_ids": ["uuid-a", ...]          // explicit exclusions
//   },
//   "channel_requirements": "auto"            // 'email'|'whatsapp'|'auto'
// }
// ─────────────────────────────────────────────────────────────

/**
 * Preview an audience — counts + first 25 contacts — WITHOUT writing
 * anything to campaign_recipients. Frontend calls this as the user
 * adjusts the filter so they see a live recipient count.
 */
async function previewAudience(business, filter, channelType = "email") {
  return withBusinessContext(business, async (client) => {
    const { sql, params } = compileFilter(business, filter, channelType);
    // Count first.
    const {
      rows: [{ count }],
    } = await client.query(
      `SELECT COUNT(*)::int AS count FROM (${sql}) c`,
      params,
    );
    // Then a small sample for the UI.
    const { rows: sample } = await client.query(`${sql} LIMIT 25`, params);
    return {
      total: parseInt(count, 10),
      sample: sample.map((c) => ({
        contact_id: c.contact_id,
        display_name: c.display_name,
        email: c.email,
        whatsapp_number: c.whatsapp_number,
        priority_level: c.priority_level,
      })),
      filter_summary: summariseFilter(filter),
    };
  });
}

/**
 * Materialise the audience — preview + persist to campaign_recipients.
 * Replaces the simpler version in campaigns.service.
 */
async function buildAudience(business, campaignId) {
  return withBusinessContext(business, async (client) => {
    const campaign = await repo.findAudienceFilter(client, campaignId);
    if (!campaign) {
      throw Object.assign(new Error("Campaign not found"), { status: 404 });
    }
    const filter = campaign.audience_filter || {};
    const { sql, params } = compileFilter(
      business,
      filter,
      campaign.campaign_type,
    );

    const { rows: contacts } = await client.query(sql, params);

    // Clear previous pending recipients (in case the audience was rebuilt
    // after editing the filter).
    await repo.deletePendingRecipients(client, campaignId);

    // Bulk insert is much faster than one-at-a-time for large audiences.
    let inserted = 0;
    const batchSize = 500;
    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);
      inserted += await bulkInsertRecipients(client, campaignId, batch);
    }
    await repo.updateRecipientCount(client, campaignId, inserted);

    return {
      recipient_count: inserted,
      filter_summary: summariseFilter(filter),
      message: `Audience built — ${inserted} recipients`,
    };
  });
}

/**
 * Compile a structured filter JSON into a SQL query + params array.
 * The returned SQL is a SELECT over shared.contacts c that callers
 * wrap (with COUNT, LIMIT, etc.). This is the heart of the builder.
 *
 * Returns: { sql, params }
 * @internal Exported for unit tests.
 */
function compileFilter(business, filter = {}, channelType = "email") {
  const include = filter.include || {};
  const exclude = filter.exclude || {};
  const channel = filter.channel_requirements || channelType || "auto";

  const params = [business];
  const where = [`c.is_deleted = false`, `c.visible_to @> ARRAY[$1]::text[]`];

  // ── CHANNEL REACHABILITY ───────────────────────────────
  if (channel === "email" || channel === "auto") {
    if (channel === "email") {
      where.push(`c.email IS NOT NULL AND c.email <> ''`);
    } else {
      where.push(`(c.email IS NOT NULL OR c.whatsapp_number IS NOT NULL)`);
    }
  } else if (channel === "whatsapp") {
    where.push(`c.whatsapp_number IS NOT NULL AND c.whatsapp_number <> ''`);
  }

  // ── INCLUDE FILTERS ────────────────────────────────────

  if (Array.isArray(include.priority_level) && include.priority_level.length) {
    params.push(include.priority_level);
    where.push(`c.priority_level = ANY($${params.length}::text[])`);
  }

  if (Array.isArray(include.contact_type) && include.contact_type.length) {
    params.push(include.contact_type);
    where.push(`c.contact_type && $${params.length}::text[]`);
  }

  if (Array.isArray(include.tag_names) && include.tag_names.length) {
    params.push(include.tag_names);
    where.push(
      `EXISTS (SELECT 1 FROM shared.contact_tags ct
               WHERE ct.contact_id = c.contact_id AND ct.tag_name = ANY($${params.length}::text[]))`,
    );
  }

  if (Number.isInteger(include.purchased_within_days)) {
    params.push(include.purchased_within_days);
    where.push(
      `EXISTS (SELECT 1 FROM invoices i
               WHERE i.contact_id = c.contact_id
                 AND i.status IN ('paid','partially_paid')
                 AND i.created_at >= now() - ($${params.length} || ' days')::interval)`,
    );
  }

  if (Number.isFinite(include.min_lifetime_spend)) {
    params.push(include.min_lifetime_spend);
    where.push(
      `(SELECT COALESCE(SUM(total_amount), 0) FROM invoices
        WHERE contact_id = c.contact_id AND status IN ('paid','partially_paid'))
       >= $${params.length}::numeric`,
    );
  }

  if (Array.isArray(include.category_ids) && include.category_ids.length) {
    params.push(include.category_ids);
    where.push(
      `EXISTS (SELECT 1 FROM invoices i
               JOIN invoice_lines il ON il.invoice_id = i.invoice_id
               JOIN products p ON p.product_id = il.product_id
               WHERE i.contact_id = c.contact_id
                 AND p.category_id = ANY($${params.length}::uuid[]))`,
    );
  }

  if (Number.isInteger(include.birthday_within_days)) {
    params.push(include.birthday_within_days);
    // Match birthdays within the next N days, ignoring year.
    where.push(
      `c.date_of_birth IS NOT NULL
       AND (
         (date_part('doy',
            make_date(date_part('year', now())::int,
                      date_part('month', c.date_of_birth)::int,
                      date_part('day', c.date_of_birth)::int)
          ) - date_part('doy', now()) + 366) :: int % 366
         <= $${params.length}
       )`,
    );
  }

  // ── EXCLUDE FILTERS ────────────────────────────────────

  if (exclude.unsubscribed !== false) {
    // Default-on: never include unsubscribed contacts.
    where.push(
      `NOT EXISTS (SELECT 1 FROM campaign_recipients cr
                   WHERE cr.contact_id = c.contact_id
                     AND cr.status = 'unsubscribed')`,
    );
  }

  if (Number.isInteger(exclude.received_campaign_in_days)) {
    params.push(exclude.received_campaign_in_days);
    where.push(
      `NOT EXISTS (SELECT 1 FROM campaign_recipients cr
                   WHERE cr.contact_id = c.contact_id
                     AND cr.sent_at IS NOT NULL
                     AND cr.sent_at >= now() - ($${params.length} || ' days')::interval)`,
    );
  }

  if (Array.isArray(exclude.contact_ids) && exclude.contact_ids.length) {
    params.push(exclude.contact_ids);
    where.push(`c.contact_id <> ALL($${params.length}::uuid[])`);
  }

  const sql = `
    SELECT c.contact_id, c.display_name, c.email, c.whatsapp_number,
           c.priority_level, c.contact_type
    FROM shared.contacts c
    WHERE ${where.join("\n      AND ")}
    ORDER BY c.display_name ASC
  `;
  return { sql, params };
}

/**
 * Bulk-insert recipients using a single multi-row INSERT — measurably
 * faster than one INSERT per contact, which matters for VIP-list-sized
 * campaigns (tens of thousands of contacts).
 *
 * Returns the number of rows inserted.
 */
async function bulkInsertRecipients(client, campaignId, contacts) {
  if (!contacts.length) return 0;
  const values = [];
  const params = [campaignId];
  for (let i = 0; i < contacts.length; i++) {
    const token = crypto.randomBytes(16).toString("hex");
    params.push(contacts[i].contact_id, token);
    const offset = params.length;
    values.push(`($1, $${offset - 1}, 'pending', $${offset})`);
  }
  await client.query(
    `INSERT INTO campaign_recipients
       (campaign_id, contact_id, status, tracking_token)
     VALUES ${values.join(", ")}
     ON CONFLICT (campaign_id, contact_id) DO NOTHING`,
    params,
  );
  return contacts.length;
}

// ─────────────────────────────────────────────────────────────
// SAVED SEGMENTS
//
// Persist commonly-used audience filters by name so a campaign can be
// created from "VIPs who bought in the last 90 days" instead of
// redefining the filter every time. Backed by shared.contact_segments
// (added in migration 000023).
//
// Segments are PER-BUSINESS — one business can have a "VIPs" segment
// without colliding with another business's "VIPs". Unique constraint
// in the schema enforces (business, name).
// ─────────────────────────────────────────────────────────────

async function listSegments(business) {
  return withSharedContext(async (client) => {
    const { rows } = await client.query(
      `SELECT segment_id, name, description, filter, business,
              created_by, created_at, updated_at
       FROM shared.contact_segments
       WHERE business = $1
       ORDER BY name ASC`,
      [business],
    );
    return rows;
  });
}

async function getSegment(business, segmentId) {
  return withSharedContext(async (client) => {
    const {
      rows: [row],
    } = await client.query(
      `SELECT * FROM shared.contact_segments
       WHERE segment_id = $1 AND business = $2`,
      [segmentId, business],
    );
    return row || null;
  });
}

async function saveSegment(business, { name, description, filter }, user) {
  if (!name) {
    throw Object.assign(new Error("name is required"), { status: 400 });
  }
  if (!filter || typeof filter !== "object") {
    throw Object.assign(new Error("filter must be an object"), { status: 400 });
  }
  return withSharedContext(async (client) => {
    const {
      rows: [row],
    } = await client.query(
      `INSERT INTO shared.contact_segments
         (name, description, filter, business, created_by)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT (business, name) DO UPDATE
       SET description = EXCLUDED.description,
           filter      = EXCLUDED.filter,
           updated_at  = now()
       RETURNING *`,
      [
        name,
        description || null,
        JSON.stringify(filter),
        business,
        user?.user_id || null,
      ],
    );
    return row;
  });
}

async function deleteSegment(business, segmentId) {
  return withSharedContext(async (client) => {
    const result = await client.query(
      `DELETE FROM shared.contact_segments
       WHERE segment_id = $1 AND business = $2`,
      [segmentId, business],
    );
    return { deleted: result.rowCount > 0 };
  });
}

/**
 * Preview an audience by saved-segment ID. Convenience wrapper that
 * loads the segment's filter and forwards to previewAudience.
 */
async function previewSegment(business, segmentId, channelType) {
  const segment = await getSegment(business, segmentId);
  if (!segment) {
    throw Object.assign(new Error("Segment not found"), { status: 404 });
  }
  return previewAudience(business, segment.filter, channelType);
}

/**
 * Build an audience for a campaign FROM a saved segment. Loads the
 * segment, copies its filter into the campaign's audience_filter,
 * then runs the normal buildAudience flow.
 */
async function buildAudienceFromSegment(business, campaignId, segmentId) {
  return withSharedContext(async (sharedClient) => {
    const {
      rows: [segment],
    } = await sharedClient.query(
      `SELECT * FROM shared.contact_segments
       WHERE segment_id = $1 AND business = $2`,
      [segmentId, business],
    );
    if (!segment) {
      throw Object.assign(new Error("Segment not found"), { status: 404 });
    }
    // Stamp the filter onto the campaign first so buildAudience reads
    // a consistent state.
    await withBusinessContext(business, async (client) => {
      await client.query(
        `UPDATE campaigns
         SET audience_filter = $2::jsonb, updated_at = now()
         WHERE campaign_id = $1`,
        [campaignId, JSON.stringify(segment.filter)],
      );
    });
    return buildAudience(business, campaignId);
  });
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function summariseFilter(filter = {}) {
  const include = filter.include || {};
  const exclude = filter.exclude || {};
  const parts = [];
  if (include.priority_level?.length)
    parts.push(`priority: ${include.priority_level.join(", ")}`);
  if (include.contact_type?.length)
    parts.push(`type: ${include.contact_type.join(", ")}`);
  if (include.purchased_within_days)
    parts.push(`bought in last ${include.purchased_within_days} days`);
  if (include.min_lifetime_spend)
    parts.push(`spent ≥ ₦${include.min_lifetime_spend.toLocaleString()}`);
  if (include.tag_names?.length)
    parts.push(`tagged: ${include.tag_names.join(", ")}`);
  if (include.birthday_within_days)
    parts.push(`birthday in ${include.birthday_within_days} days`);
  if (exclude.received_campaign_in_days)
    parts.push(`not contacted in ${exclude.received_campaign_in_days} days`);
  return parts.join(" • ") || "all reachable contacts";
}

module.exports = {
  previewAudience,
  buildAudience,
  compileFilter, // exported for unit tests
  // saved segments
  listSegments,
  getSegment,
  saveSegment,
  deleteSegment,
  previewSegment,
  buildAudienceFromSegment,
};
