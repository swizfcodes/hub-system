"use strict";

const { withBusinessContext } = require("../../config/db");
const { sendEmail } = require("../../lib/email/sender");
const whatsapp = require("../../integrations/messaging/adapters/whatsapp");
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
// (jobs/sendScheduledCampaigns) — both paths go through processSend
// so the behaviour is identical.
// ─────────────────────────────────────────────────────────────

// ─── Batch configuration ──────────────────────────────────────────────────────
// 100 per batch × 3-minute delay = ~25 minutes for 500 recipients.
// Small audiences (< 100) complete in a single batch with no delay.
// Adjust BATCH_DELAY_MS in env to tune for your SMTP provider's rate limit.
const DEFAULT_BATCH_SIZE     = parseInt(process.env.CAMPAIGN_BATCH_SIZE     || "100", 10);
const DEFAULT_BATCH_DELAY_MS = parseInt(process.env.CAMPAIGN_BATCH_DELAY_MS || "180000", 10); // 3 minutes
const MAX_RETRIES_PER_RECIPIENT = 2;

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

async function processSend(
  business,
  campaignId,
  {
    batchSize = DEFAULT_BATCH_SIZE,
    batchDelayMs = DEFAULT_BATCH_DELAY_MS,
  } = {},
) {
  let totalSent = 0;
  let totalFailed = 0;
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

    await markBatchResults(business, recipients, results);

    totalSent += results.filter(
      (r) => r.status === "fulfilled" && r.value?.success,
    ).length;
    totalFailed += results.filter(
      (r) => r.status === "rejected" || !r.value?.success,
    ).length;

    // Small pause to be polite to provider rate limits.
    if (batchDelayMs > 0) {
      await sleep(batchDelayMs);
    }

    // Check the cancel flag — if someone cancelled mid-send, stop here.
    const cancelled = await isCancelled(business, campaignId);
    if (cancelled) {
      logger.info(
        `Campaign ${campaignId} cancelled mid-send — stopping (${totalSent} sent, ${totalFailed} failed)`,
      );
      break;
    }
  }

  // Finalise.
  await withBusinessContext(business, async (client) => {
    await repo.setSentTotals(client, campaignId, totalSent);
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
          return { success: false, reason: "no_email" };
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
      if (campaign.campaign_type === "whatsapp") {
        if (!recipient.whatsapp_number) {
          return { success: false, reason: "no_whatsapp_number" };
        }
        // Strip HTML — WhatsApp is plain text.
        const text = personalised.replace(/<[^>]*>/g, "").trim();
        await whatsapp.sendMessage({ to: recipient.whatsapp_number, text });
        return { success: true };
      }
      return { success: false, reason: "unknown_campaign_type" };
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

async function markBatchResults(business, recipients, results) {
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
// Called by jobs/sendScheduledCampaigns. Picks up any 'queued'
// campaign whose scheduled_at has passed and runs the send.
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
  }
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function personalise(text, recipient) {
  if (!text) return text || "";
  const name      = recipient.display_name || "Valued Customer";
  const firstName = name.split(" ")[0];
  return text
    .replace(/\{\{name\}\}/g,           name)
    .replace(/\{\{full_name\}\}/g,       name)
    .replace(/\{\{first_name\}\}/g,      firstName)
    .replace(/\{\{customer_name\}\}/g,   firstName)   // advertised in UI — must work
    .replace(/\{\{display_name\}\}/g,    name);
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
  cancel,
  processSend,
  runScheduledSweep,
};
