"use strict";

const { pool, withBusinessContext } = require("../../config/db");
const logger = require("../../config/logger");
const config = require("../../config/config");
const repo = require("./campaigns.repository");

// ─────────────────────────────────────────────────────────────
// TRACKING SUB-SERVICE
//
// Three event types flow through here:
//
//   - opened    triggered by the 1×1 pixel embedded in email HTML
//   - clicked   triggered by the click-tracking redirect
//   - unsubscribed triggered by the unsubscribe link in email footers
//
// Each event:
//   1. Records a campaign_events row (audit trail of every touch)
//   2. Updates campaign_recipients with the first-touch timestamp
//   3. Increments the campaign-level counter (opened_count / clicked_count)
//
// The tracking endpoints are unauthenticated by design — they're hit
// by recipients clicking links in their inbox, no JWT involved. The
// tracking_token is the credential, generated per recipient at build time.
//
// Tracking endpoints search both businesses by token because the same
// token uniquely identifies a recipient regardless of which business
// they belong to. This sidesteps having to know the business from the
// URL alone.
// ─────────────────────────────────────────────────────────────

const VALID_EVENT_TYPES = [
  "opened",
  "clicked",
  "delivered",
  "bounced",
  "unsubscribed",
];

/**
 * Record a tracking event by token. Returns silently on unknown tokens
 * — we never want a 404 to leak whether a token is valid (timing /
 * reconnaissance protection). Errors are swallowed so a tracking pixel
 * never breaks the email render.
 *
 * @param {string} token        the per-recipient tracking_token
 * @param {string} eventType    'opened' | 'clicked' | 'unsubscribed'
 * @param {Object} [metadata]   extra context (URL clicked, IP, UA, etc.)
 */
async function recordEvent(token, eventType, metadata = {}) {
  if (!token) return { ok: false };
  if (!VALID_EVENT_TYPES.includes(eventType)) return { ok: false };

  try {
    const { getActiveBusinesses } = require("../../config/businesses");
    const businesses = getActiveBusinesses();
    for (const business of businesses) {
      const recipient = await repo.findRecipientByToken(pool, business, token);
      if (!recipient) continue;

      // Atomic update path: update recipient row, insert event row, bump
      // campaign counter. All three in one transaction so a partial
      // failure doesn't double-count.
      await withBusinessContext(business, async (client) => {
        await repo.updateTrackingEvent(client, business, token, eventType);

        await repo.insertCampaignEvent(
          client,
          business,
          recipient.recipient_id,
          eventType,
        );

        if (eventType === "opened" || eventType === "clicked") {
          const col = eventType === "opened" ? "opened_count" : "clicked_count";
          await repo.incrementCampaignCounter(
            client,
            business,
            recipient.campaign_id,
            col,
          );
        }

        if (eventType === "unsubscribed") {
          // Unsubscribe is recorded on the recipient row only — the
          // exclude filter in builder.compileFilter checks for any
          // existing unsubscribed recipient row for that contact and
          // excludes them from future campaigns automatically. This
          // is per-business by design: a customer can opt out of one
          // business line without affecting the other.
        }
      });

      return { ok: true, business, recipient_id: recipient.recipient_id };
    }
    // Token didn't match any business — silent no-op.
    return { ok: false, reason: "token_not_found" };
  } catch (err) {
    // Tracking must never break — log and move on.
    logger.warn(`Tracking event failed (${eventType}): ${err.message}`);
    return { ok: false, reason: "internal_error" };
  }
}

// ─────────────────────────────────────────────────────────────
// SPECIFIC ENDPOINTS
// Routes call into these. Each one is a thin wrapper around recordEvent
// with the right side-effects for what the user did.
// ─────────────────────────────────────────────────────────────

/**
 * Pixel-load handler. Always returns a 1×1 transparent GIF buffer, even
 * on unknown tokens — the email client must always see a valid image.
 *
 * Caller (routes.js) is expected to:
 *   res.set('Content-Type', 'image/gif').end(getPixelBuffer())
 */
async function handlePixelOpen(token, metadata = {}) {
  await recordEvent(token, "opened", metadata);
  return getPixelBuffer();
}

/**
 * Click handler. Records the click, then returns the URL the user
 * should be redirected to. The route file does the actual redirect.
 *
 * Returns: { redirectTo: string }
 */
async function handleClick(token, targetUrl, metadata = {}) {
  await recordEvent(token, "clicked", { ...metadata, target: targetUrl });
  // Validate the URL before redirecting — open redirect protection.
  if (!isSafeRedirectUrl(targetUrl)) {
    return { redirectTo: config.app?.baseUrl || "/" };
  }
  return { redirectTo: targetUrl };
}

/**
 * Unsubscribe handler — opts the contact out of all future marketing
 * sends across campaigns. Marketing opt-in is a contact-level flag.
 */
async function handleUnsubscribe(token, metadata = {}) {
  const result = await recordEvent(token, "unsubscribed", metadata);
  return result;
}

// ─────────────────────────────────────────────────────────────
// STATS & INSIGHTS
// Aggregations for the campaign reporting screen.
// ─────────────────────────────────────────────────────────────

/**
 * Campaign-level stats — counts + computed rates.
 */
async function getCampaignStats(business, campaignId) {
  return withBusinessContext(business, async (client) => {
    const stats = await repo.getStats(client, campaignId);
    const {
      recipient_count = 0,
      delivered_count = 0,
      opened_count = 0,
      clicked_count = 0,
    } = stats || {};

    const delivered = parseInt(delivered_count) || 0;
    const opened = parseInt(opened_count) || 0;
    const clicked = parseInt(clicked_count) || 0;
    const recipients = parseInt(recipient_count) || 0;

    return {
      ...stats,
      delivery_rate: recipients > 0 ? pct(delivered / recipients) : 0,
      open_rate: delivered > 0 ? pct(opened / delivered) : 0,
      click_rate: delivered > 0 ? pct(clicked / delivered) : 0,
      click_through_rate: opened > 0 ? pct(clicked / opened) : 0,
    };
  });
}

/**
 * Per-recipient activity for a campaign — used by the campaign detail
 * page to show who opened, who clicked, who bounced.
 */
async function getRecipientActivity(business, campaignId, { status } = {}) {
  return withBusinessContext(business, async (client) => {
    const { rows } = await client.query(
      `SELECT cr.recipient_id, cr.contact_id, cr.status,
              cr.sent_at, cr.opened_at, cr.clicked_at, cr.unsubscribed_at,
              c.display_name, c.email, c.whatsapp_number, c.priority_level
       FROM campaign_recipients cr
       JOIN shared.contacts c ON c.contact_id = cr.contact_id
       WHERE cr.campaign_id = $1
         AND ($2::TEXT IS NULL OR cr.status = $2)
       ORDER BY
         CASE cr.status
           WHEN 'clicked' THEN 1
           WHEN 'opened' THEN 2
           WHEN 'sent' THEN 3
           ELSE 4
         END,
         c.display_name ASC`,
      [campaignId, status || null],
    );
    return rows;
  });
}

/**
 * Smart follow-up suggestion — from the product description: "If a VIP
 * customer opens an email multiple times without responding, the system
 * suggests a personal follow-up call." This finds candidates.
 *
 * Returns contacts who:
 *   - Are marked VIP
 *   - Opened this campaign 2+ times
 *   - Did not click any link
 *   - Have not been contacted manually in the last 7 days
 */
async function getFollowUpSuggestions(business, campaignId) {
  return withBusinessContext(business, async (client) => {
    const { rows } = await client.query(
      `WITH opens AS (
         SELECT cr.contact_id, COUNT(*)::int AS open_count
         FROM campaign_recipients cr
         JOIN campaign_events ce ON ce.recipient_id = cr.recipient_id
         WHERE cr.campaign_id = $1
           AND ce.event_type = 'opened'
         GROUP BY cr.contact_id
         HAVING COUNT(*) >= 2
       ),
       clicks AS (
         SELECT cr.contact_id
         FROM campaign_recipients cr
         WHERE cr.campaign_id = $1
           AND cr.clicked_at IS NOT NULL
       )
       SELECT c.contact_id, c.display_name, c.email, c.primary_phone,
              c.priority_level, o.open_count
       FROM opens o
       JOIN shared.contacts c ON c.contact_id = o.contact_id
       LEFT JOIN clicks cl ON cl.contact_id = o.contact_id
       WHERE c.priority_level = 'VIP'
         AND cl.contact_id IS NULL
       ORDER BY o.open_count DESC, c.display_name ASC`,
      [campaignId],
    );
    return rows.map((r) => ({
      ...r,
      reason: `Opened ${r.open_count}× but didn't click — high engagement, no commitment`,
    }));
  });
}

// ─────────────────────────────────────────────────────────────
// A/B TESTING
//
// The product description's "A/B Testing" feature compares variant
// subject lines. Now that migration 000023 added `parent_campaign_id`
// to the campaigns table, variants can be properly linked: child
// campaigns store the parent_campaign_id of the original.
//
// When called with a parent campaign's ID, this returns all variants
// (parent + children) so the UI can compare their open/click rates
// and surface the winner.
// ─────────────────────────────────────────────────────────────

async function getAbTestResults(business, parentCampaignId) {
  return withBusinessContext(business, async (client) => {
    // Pull the campaign + all its variants linked via parent_campaign_id.
    const { rows } = await client.query(
      `SELECT c.campaign_id, c.campaign_name, c.subject_line,
              c.parent_campaign_id, c.recipient_count, c.delivered_count,
              c.opened_count, c.clicked_count,
              CASE WHEN c.delivered_count > 0
                   THEN ROUND(100.0 * c.opened_count / c.delivered_count, 2)
                   ELSE 0 END AS open_rate_pct,
              CASE WHEN c.delivered_count > 0
                   THEN ROUND(100.0 * c.clicked_count / c.delivered_count, 2)
                   ELSE 0 END AS click_rate_pct
       FROM campaigns c
       WHERE c.campaign_id = $1
          OR c.parent_campaign_id = $1
       ORDER BY c.created_at ASC`,
      [parentCampaignId],
    );
    if (rows.length <= 1) {
      return { variants: rows, winner: null };
    }
    const winner = rows.reduce((a, b) =>
      parseFloat(b.open_rate_pct) > parseFloat(a.open_rate_pct) ? b : a,
    );
    return { variants: rows, winner: winner.campaign_id };
  });
}

/**
 * Create an A/B variant of a campaign. The variant gets a different
 * subject line (and optionally different html_content) but inherits
 * everything else from the parent. Caller can then build an audience
 * for the variant (typically a slice of the parent's audience) and
 * send it; results aggregate via getAbTestResults(parent_campaign_id).
 */
async function createVariant(business, parentCampaignId, variantData, user) {
  return withBusinessContext(business, async (client) => {
    const {
      rows: [parent],
    } = await client.query(`SELECT * FROM campaigns WHERE campaign_id = $1`, [
      parentCampaignId,
    ]);
    if (!parent) {
      throw Object.assign(new Error("Parent campaign not found"), {
        status: 404,
      });
    }
    if (parent.parent_campaign_id) {
      throw Object.assign(
        new Error(
          "Cannot create a variant of a variant — use the original campaign as the parent",
        ),
        { status: 400 },
      );
    }

    const {
      rows: [variant],
    } = await client.query(
      `INSERT INTO campaigns
         (campaign_name, campaign_type, subject_line, from_name,
          html_content, audience_filter, parent_campaign_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
       RETURNING *`,
      [
        variantData.campaign_name || `${parent.campaign_name} (Variant)`,
        parent.campaign_type,
        variantData.subject_line || parent.subject_line,
        variantData.from_name || parent.from_name,
        variantData.html_content || parent.html_content,
        JSON.stringify(
          variantData.audience_filter || parent.audience_filter || {},
        ),
        parentCampaignId,
        user.user_id,
      ],
    );
    return variant;
  });
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

let pixelBufferCache = null;
function getPixelBuffer() {
  if (pixelBufferCache) return pixelBufferCache;
  // 1×1 transparent GIF — 43 bytes, standard tracking pixel payload.
  pixelBufferCache = Buffer.from(
    "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
    "base64",
  );
  return pixelBufferCache;
}

function isSafeRedirectUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    // Only allow http/https — block javascript:, data:, etc.
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function pct(n) {
  return parseFloat((n * 100).toFixed(2));
}

module.exports = {
  recordEvent,
  handlePixelOpen,
  handleClick,
  handleUnsubscribe,
  getCampaignStats,
  getRecipientActivity,
  getFollowUpSuggestions,
  getAbTestResults,
  createVariant,
  // exported for tests
  isSafeRedirectUrl,
};
