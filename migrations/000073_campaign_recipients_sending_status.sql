-- ============================================================
-- MIGRATION 000073 — campaign_recipients: allow 'sending' status
--
-- The batched campaign scheduler (modules/campaigns/scheduler.service.js
-- pullBatch) claims recipients by flipping status to 'sending' before
-- dispatch, but the 000019 CHECK list predates batching and rejects that
-- value. Every scheduled / send-now campaign therefore failed on its
-- first batch with a check-constraint violation, leaving the campaign
-- stuck at status='sending' with every recipient still 'pending' and
-- delivered_count=0 — and the scheduler sweep only retries 'queued'
-- campaigns, so they never recovered.
-- ============================================================

ALTER TABLE jewelry.campaign_recipients
  DROP CONSTRAINT IF EXISTS campaign_recipients_status_check;
ALTER TABLE jewelry.campaign_recipients
  ADD CONSTRAINT campaign_recipients_status_check
  CHECK (status IN ('pending','sending','sent','delivered','opened','clicked','bounced','unsubscribed'));

ALTER TABLE diffusers.campaign_recipients
  DROP CONSTRAINT IF EXISTS campaign_recipients_status_check;
ALTER TABLE diffusers.campaign_recipients
  ADD CONSTRAINT campaign_recipients_status_check
  CHECK (status IN ('pending','sending','sent','delivered','opened','clicked','bounced','unsubscribed'));

-- Rescue campaigns already stranded by the bug: anything sitting in
-- 'sending' goes back to 'queued' so the next scheduler sweep re-fires
-- it. Safe even if a send is genuinely in flight — recipients are
-- claimed row-by-row ('pending' → 'sending'), so a re-fired campaign
-- can never double-send. Send-now campaigns have no scheduled_at, and
-- the sweep only picks rows with scheduled_at <= now(), so backfill it.
UPDATE jewelry.campaigns
   SET status = 'queued',
       scheduled_at = COALESCE(scheduled_at, now())
 WHERE status = 'sending';

UPDATE diffusers.campaigns
   SET status = 'queued',
       scheduled_at = COALESCE(scheduled_at, now())
 WHERE status = 'sending';
