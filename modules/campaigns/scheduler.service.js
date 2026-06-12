"use strict";

const { withBusinessContext } = require("../../config/db");
const { sendEmail } = require("../../lib/email/sender");
// EXTERNAL-COMMS-DISABLED: WhatsApp adapter needs Meta API access.
// const whatsapp = require("../../integrations/messaging/adapters/whatsapp");
const logger = require("../../config/logger");
const config = require("../../config/config");
const repo = require("./campaigns.repository");
const builder = require("./builder.service");

// ─────────────────────────────────────────────────────────────
// SCHEDULER SUB-SERVICE
//
// Owns the lifecycle of getting a campaign from 'queued' to 'sent':
//
//   1. Validate the campaign is ready to send (has audience, valid
//      content, future-or-now scheduled time).
//   2. Lock the campaign by flipping status to 'sending' atomically —
//      important because the cron and the API can both call this and
//      we must guarantee a campaign sends exactly once.
//   3. Iterate recipients in batches (default 50 per batch) with a
//      short pause between batches to stay under provider rate limits.
//   4. Track success/failure per recipient; mark bounced if the
//      provider reports an undeliverable address.
//   5. Finalise the campaign — set sent_at and the delivered_count.
//
// This file is called both from the API (sendNow) and the cron job
// (jobs/runScheduledCampaigns → runScheduledSweep) — both paths go
// through processSend so the behaviour is identical. The sweep also
// resumes campaigns abandoned mid-send (crash/restart/outage) — see
// recoverStaleSends.
// ─────────────────────────────────────────────────────────────

// ─── Batch configuration ──────────────────────────────────────────────────────
// 100 per batch × 3-minute delay = ~25 minutes for 500 recipients.
// Small audiences (< 100) complete in a single batch with no delay.
// Adjust BATCH_DELAY_MS in env to tune for your SMTP provider's rate limit.
const DEFAULT_BATCH_SIZE     = parseInt(process.env.CAMPAIGN_BATCH_SIZE     || "100", 10);
const DEFAULT_BATCH_DELAY_MS = parseInt(process.env.CAMPAIGN_BATCH_DELAY_MS || "180000", 10); // 3 minutes
const MAX_RETRIES_PER_RECIPIENT = 2;

// A campaign left in 'sending' whose row hasn't been touched for this long
// is considered abandoned (process crashed/restarted mid-send, or the send
// loop aborted during a provider outage) and is resumed by the sweep.
// Must comfortably exceed BATCH_DELAY_MS: processSend heartbeats
// campaigns.updated_at after every batch, so a live send never looks stale.
const STALE_SENDING_MINUTES = parseInt(
  process.env.CAMPAIGN_STALE_SENDING_MINUTES || "15",
  10,
);

// Campaign ids with a send loop alive in THIS process. Guards against the
// stale-recovery sweep (or a second sendNow) re-driving an in-flight send.
// In-memory is sufficient — the API runs as a single fork-mode instance
// (ecosystem.config.js); cross-process safety comes from the row-level
// 'pending' → 'sending' recipient claim in pullBatch.
const activeSends = new Set();

/**
 * Schedule a campaign to send at a future time. Validates the campaign
 * is in 'draft' status and has an audience built.
 */
async function schedule(business, campaignId, scheduledAt, user) {
  return withBusinessContext(business, async (client) => {
    const campaign = await repo.findStatusById(client, campaignId);
    if (!campaign) {
      throw Object.assign(new Error("Campaign not found"), { status: 404 });
    }
    if (campaign.status !== "draft") {
      throw Object.assign(
        new Error(
          `Only draft campaigns can be scheduled — current: ${campaign.status}`,
        ),
        { status: 400 },
      );
    }
    if (!campaign.recipient_count) {
      throw Object.assign(
        new Error("Audience must be built before scheduling"),
        { status: 400 },
      );
    }
    assertSendableContent(campaign);

    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime())) {
      throw Object.assign(new Error("Invalid scheduled_at"), { status: 400 });
    }
    if (when.getTime() < Date.now() - 60 * 1000) {
      throw Object.assign(
        new Error("scheduled_at must be now or in the future"),
        { status: 400 },
      );
    }

    return repo.setScheduled(client, campaignId, when.toISOString());
  });
}

/**
 * Send a campaign immediately. Returns optimistically — the actual
 * delivery happens in the background. Caller can poll getStats() to
 * see progress.
 */
async function sendNow(business, campaignId, user) {
  // Validate + lock inside a transaction.
  const campaign = await withBusinessContext(business, async (client) => {
    const c = await repo.findSendable(client, campaignId);
    if (!c) {
      throw Object.assign(
        new Error("Campaign not in a sendable state (must be draft or queued)"),
        { status: 400 },
      );
    }
    return c;
  });
  assertSendableContent(campaign);

  // If no audience built yet, build it now.
  if (!campaign.recipient_count) {
    await builder.buildAudience(business, campaignId);
  }

  // Atomic flip to 'sending' — fails if another caller beat us to it.
  const locked = await withBusinessContext(business, async (client) => {
    const {
      rows: [row],
    } = await client.query(
      `UPDATE campaigns
       SET status = 'sending', updated_at = now()
       WHERE campaign_id = $1 AND status IN ('draft', 'queued')
       RETURNING campaign_id`,
      [campaignId],
    );
    return row;
  });
  if (!locked) {
    throw Object.assign(
      new Error("Campaign is already sending or has been cancelled"),
      { status: 409 },
    );
  }

  // Kick off the actual send in the background. The API returns immediately
  // so the UI stays responsive. The frontend should poll GET /campaigns/:id/stats
  // to track delivered_count progress rather than waiting on this response.
  setImmediate(() =>
    processSend(business, campaignId).catch((err) => {
      logger.error(`Campaign send failed: ${campaignId}`, err);
    }),
  );

  return {
    sending: true,
    campaign_id: campaignId,
    message: "Campaign is sending in batches. Poll /stats for progress.",
  };
}

/**
 * Send a single test email — no recipients touched, no tracking pixel,
 * no status change. Works on any status so users can re-test sent
 * campaigns. Variables are filled with sample values via a fake
 * recipient so the test looks like the real thing.
 */
async function sendTest(business, campaignId, email, user) {
  const campaign = await withBusinessContext(business, async (client) => {
    const c = await repo.findById(client, campaignId);
    if (!c) {
      throw Object.assign(new Error("Campaign not found"), { status: 404 });
    }
    return c;
  });
  if (campaign.campaign_type !== "email") {
    throw Object.assign(
      new Error("Test sends are only available for email campaigns"),
      { status: 400 },
    );
  }
  assertSendableContent(campaign);

  const sampleRecipient = {
    display_name: user?.display_name || "Adaeze Obi",
    tracking_token: null, // unsubscribe link renders as '#' in tests
  };
  await sendEmail({
    to: email,
    // No [TEST] prefix — the test must be byte-identical to the real
    // send so it exercises the same spam-filter path the customers see.
    subject: personaliseSubject(campaign.subject_line, sampleRecipient),
    html: personaliseContent(campaign.html_content, sampleRecipient),
    from: campaign.from_name,
    business,
  });
  logger.info(`Campaign ${campaignId} test email sent to ${email}`);
  return { sent: true, to: email };
}

/**
 * Cancel a campaign. Only works if it's not yet sent. If currently
 * 'sending', recipients already dispatched are not unsent — only the
 * pending recipients are stopped.
 */
async function cancel(business, campaignId, user) {
  return withBusinessContext(business, async (client) => {
    const cancelled = await repo.setCancelled(client, campaignId);
    if (!cancelled) {
      throw Object.assign(
        new Error("Campaign cannot be cancelled (already sent or cancelled)"),
        { status: 400 },
      );
    }
    logger.info(`Campaign cancelled: ${campaignId}`);
    return cancelled;
  });
}

// ─────────────────────────────────────────────────────────────
// SEND LOOP
//
// processSend is the work-horse. It pulls pending recipients, sends
// in batches, marks results, and finalises the campaign. Called from:
//   - sendNow (above) via setImmediate
//   - the sendScheduledCampaigns cron job (passes campaignId directly)
// ─────────────────────────────────────────────────────────────

async function processSend(business, campaignId, opts = {}) {
  if (activeSends.has(campaignId)) {
    logger.warn(
      `Campaign ${campaignId} send already in progress — skipping duplicate run`,
    );
    return { sent: 0, failed: 0, skipped: true };
  }
  activeSends.add(campaignId);
  try {
    return await runSendLoop(business, campaignId, opts);
  } finally {
    activeSends.delete(campaignId);
  }
}

async function runSendLoop(
  business,
  campaignId,
  {
    batchSize = DEFAULT_BATCH_SIZE,
    batchDelayMs = DEFAULT_BATCH_DELAY_MS,
  } = {},
) {
  let totalSent = 0;
  let totalFailed = 0;
  let aborted = false;
  let campaignContent;

  // Load campaign content once (small payload — single row).
  await withBusinessContext(business, async (client) => {
    const c = await repo.findById(client, campaignId);
    if (!c) throw new Error(`Campaign ${campaignId} not found`);
    campaignContent = c;
    campaignContent._business = business;
  });

  // Process recipients in batches. We pull a batch, dispatch in parallel,
  // mark results, then pull the next batch. This way memory stays bounded
  // for very large audiences.
  while (true) {
    const recipients = await pullBatch(business, campaignId, batchSize);
    if (!recipients.length) break;

    const results = await Promise.allSettled(
      recipients.map((r) => sendToRecipient(campaignContent, r)),
    );

    await markBatchResults(business, campaignId, recipients, results);

    const batchSent = results.filter(
      (r) => r.status === "fulfilled" && r.value?.success,
    ).length;
    const batchBounced = results.filter(
      (r) => r.status === "fulfilled" && !r.value?.success && r.value?.bounced,
    ).length;
    // Soft failures were flipped back to 'pending' and will be re-claimed.
    const batchRequeued = recipients.length - batchSent - batchBounced;

    totalSent += batchSent;
    totalFailed += recipients.length - batchSent;

    // Every send in the batch failed transiently (SMTP outage, network
    // down): stop instead of re-claiming the same recipients forever.
    // The campaign stays 'sending'; the stale-recovery sweep resumes it
    // once STALE_SENDING_MINUTES have passed.
    if (batchSent === 0 && batchBounced === 0 && batchRequeued > 0) {
      aborted = true;
      logger.error(
        `Campaign ${campaignId}: entire batch of ${recipients.length} failed — ` +
          `pausing send; sweep retries in ~${STALE_SENDING_MINUTES}m`,
      );
      break;
    }

    // Check the cancel flag — if someone cancelled mid-send, stop here.
    // (Finalise below only touches campaigns still in 'sending'.)
    const cancelled = await isCancelled(business, campaignId);
    if (cancelled) {
      logger.info(
        `Campaign ${campaignId} cancelled mid-send — stopping (${totalSent} sent, ${totalFailed} failed)`,
      );
      break;
    }

    // Small pause to be polite to provider rate limits. A short batch with
    // nothing requeued means the audience is drained — skip the pause
    // rather than sleeping before an empty pull.
    if (
      batchDelayMs > 0 &&
      !(recipients.length < batchSize && batchRequeued === 0)
    ) {
      await sleep(batchDelayMs);
    }
  }

  if (aborted) {
    return { sent: totalSent, failed: totalFailed, aborted };
  }

  // Finalise — flips 'sending' → 'sent' and derives delivered_count from
  // recipient rows, so resuming a partial send never erases progress.
  await withBusinessContext(business, async (client) => {
    await repo.setSentTotals(client, campaignId);
  });

  logger.info(
    `Campaign ${campaignId} complete: ${totalSent} sent, ${totalFailed} failed`,
  );
  return { sent: totalSent, failed: totalFailed };
}

async function pullBatch(business, campaignId, batchSize) {
  return withBusinessContext(business, async (client) => {
    // Pull pending recipients with their contact details. We claim them
    // by status='sending' so a parallel run can't double-send.
    const { rows } = await client.query(
      `WITH claimed AS (
         SELECT cr.recipient_id
         FROM campaign_recipients cr
         WHERE cr.campaign_id = $1 AND cr.status = 'pending'
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       UPDATE campaign_recipients
       SET status = 'sending'
       FROM claimed
       WHERE campaign_recipients.recipient_id = claimed.recipient_id
       RETURNING
         campaign_recipients.recipient_id,
         campaign_recipients.contact_id,
         campaign_recipients.tracking_token,
         (SELECT email FROM shared.contacts WHERE contact_id = campaign_recipients.contact_id) AS email,
         (SELECT whatsapp_number FROM shared.contacts WHERE contact_id = campaign_recipients.contact_id) AS whatsapp_number,
         (SELECT display_name FROM shared.contacts WHERE contact_id = campaign_recipients.contact_id) AS display_name`,
      [campaignId, batchSize],
    );
    return rows;
  });
}

async function sendToRecipient(campaign, recipient) {
  const personalised = personaliseContent(campaign.html_content, recipient);

  let lastError = null;
  for (let attempt = 0; attempt <= MAX_RETRIES_PER_RECIPIENT; attempt++) {
    try {
      if (campaign.campaign_type === "email") {
        if (!recipient.email) {
          // bounced=true → terminal status. Without it the recipient flips
          // back to 'pending' and is re-claimed on every pass forever.
          return { success: false, reason: "no_email", bounced: true };
        }
        const trackingPixel = buildTrackingPixel(recipient.tracking_token);
        await sendEmail({
          to: recipient.email,
          subject: personaliseSubject(campaign.subject_line, recipient),
          html: personalised + trackingPixel,
          from: campaign.from_name,
          business: campaign._business,
        });
        return { success: true };
      }
      // EXTERNAL-COMMS-DISABLED: WhatsApp campaigns require Meta API access.
      // bounced=true marks recipients terminally so campaigns drain cleanly
      // instead of re-claiming the same recipients on every pass.
      if (campaign.campaign_type === "whatsapp") {
        return { success: false, reason: "whatsapp_disabled", bounced: true };
        // if (!recipient.whatsapp_number) {
        //   return { success: false, reason: "no_whatsapp_number", bounced: true };
        // }
        // // Strip HTML — WhatsApp is plain text.
        // const text = personalised.replace(/<[^>]*>/g, "").trim();
        // await whatsapp.sendMessage({ to: recipient.whatsapp_number, text });
        // return { success: true };
      }
      return { success: false, reason: "unknown_campaign_type", bounced: true };
    } catch (err) {
      lastError = err;
      // Retry on transient errors only — not on validation/permanent failures.
      if (!isTransientError(err) || attempt === MAX_RETRIES_PER_RECIPIENT) {
        break;
      }
      await sleep(500 * Math.pow(2, attempt));
    }
  }
  return {
    success: false,
    reason: lastError?.message || "unknown_failure",
    bounced: isPermanentBounce(lastError),
  };
}

async function markBatchResults(business, campaignId, recipients, results) {
  return withBusinessContext(business, async (client) => {
    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
      const outcome = results[i];
      if (outcome.status === "fulfilled" && outcome.value.success) {
        await repo.markRecipientSent(client, r.recipient_id);
      } else if (outcome.status === "fulfilled" && outcome.value.bounced) {
        await repo.markRecipientBounced(client, r.recipient_id);
      } else {
        // Soft failure — flip back to pending so the next sweep picks it up.
        await client.query(
          `UPDATE campaign_recipients SET status = 'pending'
           WHERE recipient_id = $1`,
          [r.recipient_id],
        );
      }
    }
    // Heartbeat: a live send touches the campaign row every batch, so only
    // crashed/aborted sends ever look stale to the recovery sweep.
    await client.query(
      `UPDATE campaigns SET updated_at = now() WHERE campaign_id = $1`,
      [campaignId],
    );
  });
}

async function isCancelled(business, campaignId) {
  return withBusinessContext(business, async (client) => {
    const {
      rows: [row],
    } = await client.query(
      `SELECT status FROM campaigns WHERE campaign_id = $1`,
      [campaignId],
    );
    return row?.status === "cancelled";
  });
}

// ─────────────────────────────────────────────────────────────
// CRON ENTRY POINT
// Called every minute by jobs/runScheduledCampaigns. Picks up any
// 'queued' campaign whose scheduled_at has passed and runs the send,
// then resumes campaigns abandoned mid-send.
// ─────────────────────────────────────────────────────────────

async function runScheduledSweep() {
  const { getActiveBusinesses } = require("../../config/businesses");
  const businesses = getActiveBusinesses();

  for (const business of businesses) {
    const due = await withBusinessContext(business, async (client) => {
      const { rows } = await client.query(
        `SELECT campaign_id, campaign_name
         FROM campaigns
         WHERE status = 'queued' AND scheduled_at <= now()
         FOR UPDATE SKIP LOCKED`,
      );
      return rows;
    });

    for (const c of due) {
      try {
        // Flip status to sending atomically before processing.
        const locked = await withBusinessContext(business, async (client) => {
          const {
            rows: [row],
          } = await client.query(
            `UPDATE campaigns
             SET status = 'sending', updated_at = now()
             WHERE campaign_id = $1 AND status = 'queued'
             RETURNING campaign_id`,
            [c.campaign_id],
          );
          return row;
        });
        if (!locked) continue;

        logger.info(
          `[scheduler] Sending due campaign: ${c.campaign_name} (${c.campaign_id}) [${business}]`,
        );
        await processSend(business, c.campaign_id);
      } catch (err) {
        logger.error(
          `[scheduler] Campaign ${c.campaign_id} failed: ${err.message}`,
        );
      }
    }

    try {
      await recoverStaleSends(business);
    } catch (err) {
      logger.error(
        `[scheduler] Stale-send recovery failed for ${business}: ${err.message}`,
      );
    }
  }
}

/**
 * Resume campaigns abandoned mid-send. A campaign sits in 'sending' with a
 * stale updated_at when the process crashed or restarted between the status
 * flip and finalise, or when a previous run aborted on an all-fail batch
 * (provider outage). Without this, such campaigns are stuck forever — the
 * due-campaign sweep above only looks at 'queued'.
 *
 * Recipients claimed by a dead worker (stuck in 'sending') are returned to
 * 'pending' first; pullBatch only ever claims 'pending' rows, so recipients
 * that were already dispatched are never re-sent.
 */
async function recoverStaleSends(business) {
  const stale = await withBusinessContext(business, async (client) => {
    const { rows } = await client.query(
      `SELECT campaign_id, campaign_name
       FROM campaigns
       WHERE status = 'sending'
         AND updated_at < now() - make_interval(mins => $1)`,
      [STALE_SENDING_MINUTES],
    );
    return rows;
  });

  for (const c of stale) {
    // A live send loop heartbeats updated_at every batch, so a stale row
    // should never be in-flight — this guards the edge cases anyway.
    if (activeSends.has(c.campaign_id)) continue;
    try {
      await withBusinessContext(business, async (client) => {
        await client.query(
          `UPDATE campaign_recipients SET status = 'pending'
           WHERE campaign_id = $1 AND status = 'sending'`,
          [c.campaign_id],
        );
        // Touch the campaign so a resume that crashes early doesn't get
        // re-attempted by every sweep tick — retries stay paced at
        // STALE_SENDING_MINUTES intervals.
        await client.query(
          `UPDATE campaigns SET updated_at = now() WHERE campaign_id = $1`,
          [c.campaign_id],
        );
      });
      logger.warn(
        `[scheduler] Resuming campaign stuck in 'sending': ${c.campaign_name} (${c.campaign_id}) [${business}]`,
      );
      await processSend(business, c.campaign_id);
    } catch (err) {
      logger.error(
        `[scheduler] Resume of campaign ${c.campaign_id} failed: ${err.message}`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Guard shared by schedule() and sendNow(): a campaign must have real
 * content (and a subject line, for email) before it can leave 'draft'.
 * Drafts are allowed to be empty — the wizard saves progressively.
 */
function assertSendableContent(campaign) {
  if (!campaign.html_content || !campaign.html_content.trim()) {
    throw Object.assign(
      new Error("Campaign content is empty — complete the Content step first"),
      { status: 400 },
    );
  }
  if (
    campaign.campaign_type === "email" &&
    !(campaign.subject_line || "").trim()
  ) {
    throw Object.assign(
      new Error("Email campaigns need a subject line before sending"),
      { status: 400 },
    );
  }
}

// Used when a contact has no display_name. Deliberately the FULL phrase
// for first-name tokens too — "Hi Valued" (split fallback) reads broken.
const FALLBACK_NAME = "Valued Customer";

function personalise(text, recipient) {
  if (!text) return text || "";
  const rawName   = (recipient.display_name || "").trim();
  const name      = rawName || FALLBACK_NAME;
  const firstName = rawName ? rawName.split(/\s+/)[0] : FALLBACK_NAME;
  // Per-recipient unsubscribe link (design-studio footer blocks emit
  // {{unsubscribe_url}}). Falls back to '#' for test sends.
  const baseUrl = config.app?.hubBaseUrl || "";
  const unsubscribeUrl =
    recipient.tracking_token && baseUrl
      ? `${baseUrl}/api/campaigns/unsubscribe/${recipient.tracking_token}`
      : "#";
  return text
    .replace(/\{\{name\}\}/g,            name)
    .replace(/\{\{full_name\}\}/g,        name)
    .replace(/\{\{first_name\}\}/g,       firstName)
    .replace(/\{\{customer_name\}\}/g,    name)   // advertised in UI as "full name" — must match
    .replace(/\{\{display_name\}\}/g,     name)
    .replace(/\{\{unsubscribe_url\}\}/g,  unsubscribeUrl);
}

function personaliseContent(html, recipient) {
  return personalise(html, recipient);
}

function personaliseSubject(subject, recipient) {
  return personalise(subject, recipient);
}

function buildTrackingPixel(token) {
  const baseUrl = config.app?.hubBaseUrl || "";
  if (!baseUrl) return "";
  const url = `${baseUrl}/api/campaigns/track/${token}?type=opened`;
  return `<img src="${url}" width="1" height="1" alt="" style="display:none" />`;
}

function isTransientError(err) {
  if (!err) return false;
  const code = err.code || err.responseCode || 0;
  // 4xx SMTP codes are transient (greylist, rate limit). 5xx are permanent.
  if (code >= 400 && code < 500) return true;
  // Network blips.
  return /ECONNRESET|ETIMEDOUT|ECONNREFUSED/i.test(err.message || "");
}

function isPermanentBounce(err) {
  if (!err) return false;
  const code = err.code || err.responseCode || 0;
  // 5xx SMTP codes = permanent bounce (no such mailbox, etc.)
  return code >= 500 && code < 600;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  schedule,
  sendNow,
  sendTest,
  cancel,
  processSend,
  runScheduledSweep,
};
