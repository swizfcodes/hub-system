-- ============================================================
-- MIGRATION 000071 — Campaign design studio
--
-- The campaign wizard gains an in-app block-based email builder
-- ("studio"). design_json stores the studio's source design
-- (versioned block list) so a draft can be re-opened and edited.
-- html_content remains the compiled, send-ready output — the send
-- pipeline (scheduler.service.js) is unchanged and never reads
-- design_json.
--
-- NULL design_json = campaign authored as raw HTML (legacy or
-- power-user mode).
-- ============================================================

ALTER TABLE jewelry.campaigns   ADD COLUMN IF NOT EXISTS design_json JSONB;
ALTER TABLE diffusers.campaigns ADD COLUMN IF NOT EXISTS design_json JSONB;
