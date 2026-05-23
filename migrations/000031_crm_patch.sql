ALTER TABLE jewelry.quotations
  ADD COLUMN crm_deal_id UUID REFERENCES jewelry.crm_deals(deal_id) ON DELETE SET NULL;

ALTER TABLE diffusers.quotations
  ADD COLUMN crm_deal_id UUID REFERENCES diffusers.crm_deals(deal_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jewelry_quotations_deal
  ON jewelry.quotations (crm_deal_id) WHERE crm_deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_diffusers_quotations_deal
  ON diffusers.quotations (crm_deal_id) WHERE crm_deal_id IS NOT NULL;

-- GL account linkage for automated journal entries
ALTER TABLE jewelry.products
  ADD COLUMN IF NOT EXISTS income_account_id    UUID REFERENCES jewelry.chart_of_accounts(account_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventory_account_id UUID REFERENCES jewelry.chart_of_accounts(account_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cogs_account_id      UUID REFERENCES jewelry.chart_of_accounts(account_id) ON DELETE SET NULL;

ALTER TABLE jewelry.product_categories
  ADD COLUMN IF NOT EXISTS income_account_id    UUID REFERENCES jewelry.chart_of_accounts(account_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventory_account_id UUID REFERENCES jewelry.chart_of_accounts(account_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cogs_account_id      UUID REFERENCES jewelry.chart_of_accounts(account_id) ON DELETE SET NULL;

-- repeat for diffusers schema
ALTER TABLE diffusers.products
  ADD COLUMN IF NOT EXISTS income_account_id    UUID REFERENCES diffusers.chart_of_accounts(account_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventory_account_id UUID REFERENCES diffusers.chart_of_accounts(account_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cogs_account_id      UUID REFERENCES diffusers.chart_of_accounts(account_id) ON DELETE SET NULL;

ALTER TABLE diffusers.product_categories
  ADD COLUMN IF NOT EXISTS income_account_id    UUID REFERENCES diffusers.chart_of_accounts(account_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inventory_account_id UUID REFERENCES diffusers.chart_of_accounts(account_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cogs_account_id      UUID REFERENCES diffusers.chart_of_accounts(account_id) ON DELETE SET NULL;