"use strict";

async function list(client, { status, campaign_type, limit, offset }) {
  const { rows } = await client.query(
    `SELECT campaign_id, campaign_name, campaign_type, status,
            recipient_count, delivered_count, opened_count, clicked_count,
            scheduled_at, sent_at, created_at
     FROM campaigns
     WHERE ($1::TEXT IS NULL OR status        = $1)
       AND ($2::TEXT IS NULL OR campaign_type = $2)
     ORDER BY created_at DESC
     LIMIT $3 OFFSET $4`,
    [status || null, campaign_type || null, limit, offset],
  );
  return rows;
}

async function insert(
  client,
  {
    campaign_name,
    campaign_type,
    subject_line,
    from_name,
    html_content,
    audience_filter,
    userId,
  },
) {
  const {
    rows: [campaign],
  } = await client.query(
    `INSERT INTO campaigns
       (campaign_name, campaign_type, subject_line, from_name,
        html_content, audience_filter, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'draft',$7)
     RETURNING *`,
    [
      campaign_name,
      campaign_type,
      subject_line || null,
      from_name || null,
      // Column is NOT NULL — drafts created before the Content step
      // store an empty string. Send-time guards reject empty content.
      html_content || "",
      JSON.stringify(audience_filter || {}),
      userId,
    ],
  );
  return campaign;
}

async function findById(client, campaignId) {
  const {
    rows: [campaign],
  } = await client.query(
    `SELECT c.*,
            COUNT(cr.recipient_id) FILTER (WHERE cr.status='sent')        AS sent_count,
            COUNT(cr.recipient_id) FILTER (WHERE cr.status='opened')      AS opened_count_live,
            COUNT(cr.recipient_id) FILTER (WHERE cr.status='clicked')     AS clicked_count_live,
            COUNT(cr.recipient_id) FILTER (WHERE cr.status='bounced')     AS bounced_count,
            COUNT(cr.recipient_id) FILTER (WHERE cr.status='unsubscribed') AS unsub_count
     FROM campaigns c
     LEFT JOIN campaign_recipients cr ON cr.campaign_id = c.campaign_id
     WHERE c.campaign_id = $1
     GROUP BY c.campaign_id`,
    [campaignId],
  );
  return campaign || null;
}

async function findStatusById(client, campaignId) {
  const {
    rows: [c],
  } = await client.query(
    `SELECT status, recipient_count, campaign_type, subject_line, html_content
     FROM campaigns WHERE campaign_id=$1`,
    [campaignId],
  );
  return c || null;
}

async function update(client, campaignId, sets, vals) {
  const {
    rows: [updated],
  } = await client.query(
    `UPDATE campaigns SET ${sets.join(", ")}, updated_at=now()
     WHERE campaign_id=$${vals.length} RETURNING *`,
    vals,
  );
  return updated;
}

async function findAudienceFilter(client, campaignId) {
  const {
    rows: [campaign],
  } = await client.query(
    `SELECT campaign_id, campaign_type, audience_filter FROM campaigns WHERE campaign_id=$1`,
    [campaignId],
  );
  return campaign || null;
}

async function getContactsForAudience(client, { business, where, params }) {
  const { rows } = await client.query(
    `SELECT c.contact_id FROM shared.contacts c WHERE ${where}`,
    params,
  );
  return rows;
}

async function deletePendingRecipients(client, campaignId) {
  await client.query(
    `DELETE FROM campaign_recipients WHERE campaign_id=$1 AND status='pending'`,
    [campaignId],
  );
}

async function insertRecipient(client, campaignId, contactId, token) {
  await client.query(
    `INSERT INTO campaign_recipients (campaign_id, contact_id, status, tracking_token)
     VALUES ($1,$2,'pending',$3)
     ON CONFLICT (campaign_id, contact_id) DO NOTHING`,
    [campaignId, contactId, token],
  );
}

async function updateRecipientCount(client, campaignId, count) {
  await client.query(
    `UPDATE campaigns SET recipient_count=$1 WHERE campaign_id=$2`,
    [count, campaignId],
  );
}

async function setScheduled(client, campaignId, scheduledAt) {
  const {
    rows: [updated],
  } = await client.query(
    `UPDATE campaigns SET status='queued', scheduled_at=$1, updated_at=now()
     WHERE campaign_id=$2 RETURNING *`,
    [scheduledAt, campaignId],
  );
  return updated;
}

async function findSendable(client, campaignId) {
  const {
    rows: [campaign],
  } = await client.query(
    `SELECT * FROM campaigns WHERE campaign_id=$1 AND status IN ('draft','queued')`,
    [campaignId],
  );
  return campaign || null;
}

async function setStatus(client, campaignId, status) {
  await client.query(
    `UPDATE campaigns SET status=$1, updated_at=now() WHERE campaign_id=$2`,
    [status, campaignId],
  );
}

async function getPendingRecipients(client, campaignId) {
  const { rows } = await client.query(
    `SELECT cr.recipient_id, cr.contact_id, cr.tracking_token,
            c.email, c.whatsapp_number, c.display_name
     FROM campaign_recipients cr
     JOIN shared.contacts c ON c.contact_id = cr.contact_id
     WHERE cr.campaign_id=$1 AND cr.status='pending'`,
    [campaignId],
  );
  return rows;
}

async function markRecipientSent(client, recipientId) {
  await client.query(
    `UPDATE campaign_recipients SET status='sent', sent_at=now() WHERE recipient_id=$1`,
    [recipientId],
  );
}

async function markRecipientBounced(client, recipientId) {
  await client.query(
    `UPDATE campaign_recipients SET status='bounced' WHERE recipient_id=$1`,
    [recipientId],
  );
}

async function setSentTotals(client, campaignId, sentCount) {
  await client.query(
    `UPDATE campaigns
     SET status='sent', sent_at=now(), delivered_count=$1, updated_at=now()
     WHERE campaign_id=$2`,
    [sentCount, campaignId],
  );
}

async function setCancelled(client, campaignId) {
  const {
    rows: [c],
  } = await client.query(
    `UPDATE campaigns SET status='cancelled', updated_at=now()
     WHERE campaign_id=$1 AND status IN ('draft','queued')
     RETURNING *`,
    [campaignId],
  );
  return c || null;
}

async function getStats(client, campaignId) {
  const {
    rows: [stats],
  } = await client.query(
    `SELECT
       COUNT(*)                                            AS total_recipients,
       COUNT(*) FILTER (WHERE status='sent')              AS sent,
       COUNT(*) FILTER (WHERE status='delivered')         AS delivered,
       COUNT(*) FILTER (WHERE status='opened')            AS opened,
       COUNT(*) FILTER (WHERE status='clicked')           AS clicked,
       COUNT(*) FILTER (WHERE status='bounced')           AS bounced,
       COUNT(*) FILTER (WHERE status='unsubscribed')      AS unsubscribed,
       ROUND(COUNT(*) FILTER (WHERE status='opened')::NUMERIC /
             NULLIF(COUNT(*) FILTER (WHERE status='sent'),0) * 100, 2) AS open_rate_pct,
       ROUND(COUNT(*) FILTER (WHERE status='clicked')::NUMERIC /
             NULLIF(COUNT(*) FILTER (WHERE status='opened'),0) * 100, 2) AS click_rate_pct
     FROM campaign_recipients
     WHERE campaign_id=$1`,
    [campaignId],
  );
  return stats;
}

async function findRecipientByToken(pool, business, token) {
  const {
    rows: [r],
  } = await pool.query(
    `SELECT cr.recipient_id, cr.campaign_id
     FROM ${business}.campaign_recipients cr
     WHERE cr.tracking_token=$1 LIMIT 1`,
    [token],
  );
  return r || null;
}

async function updateTrackingEvent(pool, business, token, eventType) {
  await pool.query(
    `UPDATE ${business}.campaign_recipients
     SET status=$1,
         opened_at  = CASE WHEN $1='opened'  AND opened_at  IS NULL THEN now() ELSE opened_at END,
         clicked_at = CASE WHEN $1='clicked' AND clicked_at IS NULL THEN now() ELSE clicked_at END
     WHERE tracking_token=$2`,
    [eventType, token],
  );
}

async function incrementCampaignCounter(pool, business, campaignId, col) {
  await pool.query(
    `UPDATE ${business}.campaigns SET ${col}=${col}+1 WHERE campaign_id=$1`,
    [campaignId],
  );
}

async function insertCampaignEvent(pool, business, recipientId, eventType) {
  await pool.query(
    `INSERT INTO ${business}.campaign_events (recipient_id, event_type) VALUES ($1,$2)`,
    [recipientId, eventType],
  );
}

module.exports = {
  list,
  insert,
  findById,
  findStatusById,
  update,
  findAudienceFilter,
  getContactsForAudience,
  deletePendingRecipients,
  insertRecipient,
  updateRecipientCount,
  setScheduled,
  findSendable,
  setStatus,
  getPendingRecipients,
  markRecipientSent,
  markRecipientBounced,
  setSentTotals,
  setCancelled,
  getStats,
  findRecipientByToken,
  updateTrackingEvent,
  incrementCampaignCounter,
  insertCampaignEvent,
};
