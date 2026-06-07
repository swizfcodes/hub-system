-- ============================================================
-- MIGRATION 000015 — Per-business: Expenses
-- expenses, expense_receipts, cash_advances
-- ============================================================

-- ┌── JEWELRY ──────────────────────────────────────────────┐

CREATE TABLE jewelry.cash_advances (
  advance_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            UUID        NOT NULL REFERENCES shared.staff_profiles (profile_id),
  purpose               TEXT        NOT NULL,
  amount_requested      NUMERIC(12,2) NOT NULL CHECK (amount_requested > 0),
  amount_approved       NUMERIC(12,2),
  reason                TEXT        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','disbursed','settled','cancelled')),
  outstanding_balance   NUMERIC(12,2) NOT NULL DEFAULT 0,
  approved_by           UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ,
  disbursed_at          TIMESTAMPTZ,
  settled_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_cash_advances_updated_at
  BEFORE UPDATE ON jewelry.cash_advances
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_jewelry_cash_advances_profile ON jewelry.cash_advances (profile_id, status);

CREATE TABLE jewelry.expenses (
  expense_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number        TEXT        NOT NULL UNIQUE,
  profile_id            UUID        NOT NULL REFERENCES shared.staff_profiles (profile_id),
  expense_type          TEXT        NOT NULL CHECK (expense_type IN ('reimbursement','cash_advance_retirement')),
  category              TEXT        NOT NULL,
  -- Categories: transport | office_supplies | client_entertainment | utilities | maintenance | other
  amount                NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency              TEXT        NOT NULL DEFAULT 'NGN',
  description           TEXT        NOT NULL,
  expense_date          DATE        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','paid')),
  receipt_document_id   UUID        REFERENCES shared.documents (document_id) ON DELETE SET NULL,
  approved_by           UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ,
  rejection_reason      TEXT,
  paid_at               TIMESTAMPTZ,
  linked_advance_id     UUID        REFERENCES jewelry.cash_advances (advance_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_expenses_updated_at
  BEFORE UPDATE ON jewelry.expenses
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_jewelry_expenses_profile ON jewelry.expenses (profile_id, status);
CREATE INDEX idx_jewelry_expenses_status  ON jewelry.expenses (status);

CREATE TABLE jewelry.expense_receipts (
  receipt_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id            UUID        NOT NULL REFERENCES jewelry.expenses (expense_id) ON DELETE CASCADE,
  document_id           UUID        NOT NULL REFERENCES shared.documents (document_id),
  receipt_date          DATE,
  merchant_name         TEXT,
  amount_on_receipt     NUMERIC(12,2),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jewelry_expense_receipts ON jewelry.expense_receipts (expense_id);

-- ┌── DIFFUSERS ────────────────────────────────────────────┐

CREATE TABLE diffusers.cash_advances (
  advance_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            UUID        NOT NULL REFERENCES shared.staff_profiles (profile_id),
  purpose               TEXT        NOT NULL,
  amount_requested      NUMERIC(12,2) NOT NULL CHECK (amount_requested > 0),
  amount_approved       NUMERIC(12,2),
  reason                TEXT        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','disbursed','settled','cancelled')),
  outstanding_balance   NUMERIC(12,2) NOT NULL DEFAULT 0,
  approved_by           UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ,
  disbursed_at          TIMESTAMPTZ,
  settled_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_cash_advances_updated_at BEFORE UPDATE ON diffusers.cash_advances FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE TABLE diffusers.expenses (
  expense_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number        TEXT        NOT NULL UNIQUE,
  profile_id            UUID        NOT NULL REFERENCES shared.staff_profiles (profile_id),
  expense_type          TEXT        NOT NULL CHECK (expense_type IN ('reimbursement','cash_advance_retirement')),
  category              TEXT        NOT NULL,
  amount                NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency              TEXT        NOT NULL DEFAULT 'NGN',
  description           TEXT        NOT NULL,
  expense_date          DATE        NOT NULL,
  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','paid')),
  receipt_document_id   UUID        REFERENCES shared.documents (document_id) ON DELETE SET NULL,
  approved_by           UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ,
  rejection_reason      TEXT,
  paid_at               TIMESTAMPTZ,
  linked_advance_id     UUID        REFERENCES diffusers.cash_advances (advance_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_expenses_updated_at BEFORE UPDATE ON diffusers.expenses FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_diffusers_expenses_profile ON diffusers.expenses (profile_id, status);

CREATE TABLE diffusers.expense_receipts (
  receipt_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id            UUID        NOT NULL REFERENCES diffusers.expenses (expense_id) ON DELETE CASCADE,
  document_id           UUID        NOT NULL REFERENCES shared.documents (document_id),
  receipt_date          DATE,
  merchant_name         TEXT,
  amount_on_receipt     NUMERIC(12,2),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- MIGRATION 000016 — Per-business: Payroll
-- payroll_runs, payslips, payroll_deductions,
-- commission_rules, commission_earned
-- ============================================================

-- ┌── JEWELRY ──────────────────────────────────────────────┐

CREATE TABLE jewelry.payroll_runs (
  run_id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_number            TEXT        NOT NULL UNIQUE,
  period_month          SMALLINT    NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year           SMALLINT    NOT NULL CHECK (period_year >= 2020),
  status                TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','under_review','approved','paid')),
  total_gross           NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_paye            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_pension_employee NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_pension_employer NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_nhf             NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_deductions      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_net             NUMERIC(14,2) NOT NULL DEFAULT 0,
  approved_by           UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,
  notes                 TEXT,
  created_by            UUID        NOT NULL REFERENCES shared.users (user_id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_month, period_year)   -- one run per calendar month
);
CREATE TRIGGER trg_jewelry_payroll_runs_updated_at
  BEFORE UPDATE ON jewelry.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_jewelry_payroll_runs_status ON jewelry.payroll_runs (status);

CREATE TABLE jewelry.payslips (
  payslip_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                UUID        NOT NULL REFERENCES jewelry.payroll_runs (run_id) ON DELETE CASCADE,
  profile_id            UUID        NOT NULL REFERENCES shared.staff_profiles (profile_id),
  -- Earnings
  basic_salary          NUMERIC(12,2) NOT NULL DEFAULT 0,
  housing_allowance     NUMERIC(12,2) NOT NULL DEFAULT 0,
  transport_allowance   NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_allowances      NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross_salary          NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Deductions
  paye_deduction        NUMERIC(12,2) NOT NULL DEFAULT 0,
  pension_employee      NUMERIC(12,2) NOT NULL DEFAULT 0,   -- 8% employee
  pension_employer      NUMERIC(12,2) NOT NULL DEFAULT 0,   -- 10% employer
  nhf_deduction         NUMERIC(12,2) NOT NULL DEFAULT 0,   -- 2.5% of basic
  advance_recovery      NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_deductions      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_deductions      NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_salary            NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Attendance
  days_absent           SMALLINT    NOT NULL DEFAULT 0,
  leave_days_taken      SMALLINT    NOT NULL DEFAULT 0,
  -- Generated PDF
  document_id           UUID        REFERENCES shared.documents (document_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, profile_id)
);
CREATE INDEX idx_jewelry_payslips_run     ON jewelry.payslips (run_id);
CREATE INDEX idx_jewelry_payslips_profile ON jewelry.payslips (profile_id);

CREATE TABLE jewelry.payroll_deductions (
  deduction_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payslip_id            UUID        NOT NULL REFERENCES jewelry.payslips (payslip_id) ON DELETE CASCADE,
  deduction_type        TEXT        NOT NULL,
  description           TEXT        NOT NULL,
  amount                NUMERIC(12,2) NOT NULL CHECK (amount > 0)
);
CREATE INDEX idx_jewelry_payroll_deductions ON jewelry.payroll_deductions (payslip_id);

CREATE TABLE jewelry.commission_rules (
  rule_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            UUID        REFERENCES shared.staff_profiles (profile_id) ON DELETE CASCADE,
  role_id               UUID        REFERENCES shared.roles (role_id) ON DELETE CASCADE,
  rule_type             TEXT        NOT NULL CHECK (rule_type IN ('percentage_of_sales','fixed_per_item','tiered')),
  rate                  NUMERIC(7,4),
  tiers                 JSONB,      -- [{min_sales, max_sales, rate}]
  applicable_to         TEXT        NOT NULL DEFAULT 'all'
                        CHECK (applicable_to IN ('all','jewelry_only','diffusers_only')),
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rule_profile_or_role CHECK (
    (profile_id IS NOT NULL AND role_id IS NULL) OR
    (profile_id IS NULL AND role_id IS NOT NULL)
  )
);

CREATE TABLE jewelry.commission_earned (
  earned_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            UUID        NOT NULL REFERENCES shared.staff_profiles (profile_id),
  rule_id               UUID        REFERENCES jewelry.commission_rules (rule_id) ON DELETE SET NULL,
  reference_type        TEXT        NOT NULL,  -- 'pos_transaction','sales_order'
  reference_id          UUID        NOT NULL,
  sale_amount           NUMERIC(14,2) NOT NULL,
  commission_amount     NUMERIC(12,2) NOT NULL,
  period_month          SMALLINT    NOT NULL,
  period_year           SMALLINT    NOT NULL,
  payslip_id            UUID        REFERENCES jewelry.payslips (payslip_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jewelry_commission_earned_period  ON jewelry.commission_earned (profile_id, period_year, period_month);
CREATE INDEX idx_jewelry_commission_earned_payslip ON jewelry.commission_earned (payslip_id) WHERE payslip_id IS NOT NULL;

-- ┌── DIFFUSERS ────────────────────────────────────────────┐

CREATE TABLE diffusers.payroll_runs (
  run_id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_number            TEXT        NOT NULL UNIQUE,
  period_month          SMALLINT    NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year           SMALLINT    NOT NULL CHECK (period_year >= 2020),
  status                TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','under_review','approved','paid')),
  total_gross           NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_paye            NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_pension_employee NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_pension_employer NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_nhf             NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_deductions      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_net             NUMERIC(14,2) NOT NULL DEFAULT 0,
  approved_by           UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  approved_at           TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,
  notes                 TEXT,
  created_by            UUID        NOT NULL REFERENCES shared.users (user_id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_month, period_year)
);
CREATE TRIGGER trg_diffusers_payroll_runs_updated_at BEFORE UPDATE ON diffusers.payroll_runs FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE TABLE diffusers.payslips (
  payslip_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                UUID        NOT NULL REFERENCES diffusers.payroll_runs (run_id) ON DELETE CASCADE,
  profile_id            UUID        NOT NULL REFERENCES shared.staff_profiles (profile_id),
  basic_salary          NUMERIC(12,2) NOT NULL DEFAULT 0,
  housing_allowance     NUMERIC(12,2) NOT NULL DEFAULT 0,
  transport_allowance   NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_allowances      NUMERIC(12,2) NOT NULL DEFAULT 0,
  gross_salary          NUMERIC(12,2) NOT NULL DEFAULT 0,
  paye_deduction        NUMERIC(12,2) NOT NULL DEFAULT 0,
  pension_employee      NUMERIC(12,2) NOT NULL DEFAULT 0,
  pension_employer      NUMERIC(12,2) NOT NULL DEFAULT 0,
  nhf_deduction         NUMERIC(12,2) NOT NULL DEFAULT 0,
  advance_recovery      NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_deductions      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_deductions      NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_salary            NUMERIC(12,2) NOT NULL DEFAULT 0,
  days_absent           SMALLINT    NOT NULL DEFAULT 0,
  leave_days_taken      SMALLINT    NOT NULL DEFAULT 0,
  document_id           UUID        REFERENCES shared.documents (document_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, profile_id)
);

CREATE TABLE diffusers.payroll_deductions (
  deduction_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payslip_id            UUID        NOT NULL REFERENCES diffusers.payslips (payslip_id) ON DELETE CASCADE,
  deduction_type        TEXT        NOT NULL,
  description           TEXT        NOT NULL,
  amount                NUMERIC(12,2) NOT NULL CHECK (amount > 0)
);

CREATE TABLE diffusers.commission_rules (
  rule_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            UUID        REFERENCES shared.staff_profiles (profile_id) ON DELETE CASCADE,
  role_id               UUID        REFERENCES shared.roles (role_id) ON DELETE CASCADE,
  rule_type             TEXT        NOT NULL CHECK (rule_type IN ('percentage_of_sales','fixed_per_item','tiered')),
  rate                  NUMERIC(7,4),
  tiers                 JSONB,
  applicable_to         TEXT        NOT NULL DEFAULT 'all'
                        CHECK (applicable_to IN ('all','jewelry_only','diffusers_only')),
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE diffusers.commission_earned (
  earned_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            UUID        NOT NULL REFERENCES shared.staff_profiles (profile_id),
  rule_id               UUID        REFERENCES diffusers.commission_rules (rule_id) ON DELETE SET NULL,
  reference_type        TEXT        NOT NULL,
  reference_id          UUID        NOT NULL,
  sale_amount           NUMERIC(14,2) NOT NULL,
  commission_amount     NUMERIC(12,2) NOT NULL,
  period_month          SMALLINT    NOT NULL,
  period_year           SMALLINT    NOT NULL,
  payslip_id            UUID        REFERENCES diffusers.payslips (payslip_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- MIGRATION 000017 — Per-business: Retail Partners
-- retail_partners, consignment_stock, consignment_sales,
-- partner_settlements
-- Also wires up deferred FK on stock_locations.partner_id
-- ============================================================

-- ┌── JEWELRY ──────────────────────────────────────────────┐

CREATE TABLE jewelry.retail_partners (
  partner_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id            UUID        NOT NULL UNIQUE REFERENCES shared.contacts (contact_id),
  partner_code          TEXT        NOT NULL UNIQUE,
  arrangement_type      TEXT        NOT NULL CHECK (arrangement_type IN ('consignment','wholesale','both')),
  consignment_margin_pct NUMERIC(5,2) DEFAULT 0,
  wholesale_discount_pct NUMERIC(5,2) DEFAULT 0,
  payment_terms_days    SMALLINT    NOT NULL DEFAULT 30,
  settlement_cycle      TEXT        NOT NULL DEFAULT 'monthly'
                        CHECK (settlement_cycle IN ('weekly','biweekly','monthly')),
  credit_limit          NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_balance       NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_retail_partners_updated_at
  BEFORE UPDATE ON jewelry.retail_partners
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_jewelry_retail_partners_code ON jewelry.retail_partners (partner_code);

-- Wire up deferred FK on stock_locations → retail_partners
ALTER TABLE jewelry.stock_locations
  ADD CONSTRAINT fk_jewelry_stock_locations_partner
    FOREIGN KEY (partner_id) REFERENCES jewelry.retail_partners (partner_id) ON DELETE SET NULL;

CREATE TABLE jewelry.consignment_stock (
  consignment_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id            UUID        NOT NULL REFERENCES jewelry.retail_partners (partner_id),
  product_id            UUID        NOT NULL REFERENCES jewelry.products (product_id),
  quantity_sent         INTEGER     NOT NULL CHECK (quantity_sent > 0),
  quantity_sold         INTEGER     NOT NULL DEFAULT 0,
  quantity_returned     INTEGER     NOT NULL DEFAULT 0,
  quantity_outstanding  INTEGER     GENERATED ALWAYS AS
                          (quantity_sent - quantity_sold - quantity_returned) STORED,
  agreed_price          NUMERIC(14,2) NOT NULL,
  sent_date             DATE        NOT NULL DEFAULT CURRENT_DATE,
  status                TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','partially_returned','fully_settled','recalled')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_consignment_stock_updated_at
  BEFORE UPDATE ON jewelry.consignment_stock
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_jewelry_consignment_partner ON jewelry.consignment_stock (partner_id, status);
CREATE INDEX idx_jewelry_consignment_product ON jewelry.consignment_stock (product_id);

CREATE TABLE jewelry.consignment_sales (
  sale_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  consignment_id        UUID        NOT NULL REFERENCES jewelry.consignment_stock (consignment_id),
  partner_id            UUID        NOT NULL REFERENCES jewelry.retail_partners (partner_id),
  quantity_sold         INTEGER     NOT NULL CHECK (quantity_sold > 0),
  sale_price            NUMERIC(14,2) NOT NULL,
  sale_date             DATE        NOT NULL,
  notes                 TEXT,
  recorded_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jewelry_consignment_sales_partner ON jewelry.consignment_sales (partner_id, sale_date DESC);

CREATE TABLE jewelry.partner_settlements (
  settlement_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_number     TEXT        NOT NULL UNIQUE,
  partner_id            UUID        NOT NULL REFERENCES jewelry.retail_partners (partner_id),
  period_start          DATE        NOT NULL,
  period_end            DATE        NOT NULL,
  total_sales_value     NUMERIC(14,2) NOT NULL DEFAULT 0,
  partner_commission    NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_due_to_us      NUMERIC(14,2) NOT NULL DEFAULT 0,
  status                TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent','paid')),
  invoice_id            UUID        REFERENCES jewelry.invoices (invoice_id) ON DELETE SET NULL,
  document_id           UUID        REFERENCES shared.documents (document_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_partner_settlements_updated_at
  BEFORE UPDATE ON jewelry.partner_settlements
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_jewelry_partner_settlements ON jewelry.partner_settlements (partner_id, status);

-- ┌── DIFFUSERS ────────────────────────────────────────────┐

CREATE TABLE diffusers.retail_partners (
  partner_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id            UUID        NOT NULL UNIQUE REFERENCES shared.contacts (contact_id),
  partner_code          TEXT        NOT NULL UNIQUE,
  arrangement_type      TEXT        NOT NULL CHECK (arrangement_type IN ('consignment','wholesale','both')),
  consignment_margin_pct NUMERIC(5,2) DEFAULT 0,
  wholesale_discount_pct NUMERIC(5,2) DEFAULT 0,
  payment_terms_days    SMALLINT    NOT NULL DEFAULT 30,
  settlement_cycle      TEXT        NOT NULL DEFAULT 'monthly'
                        CHECK (settlement_cycle IN ('weekly','biweekly','monthly')),
  credit_limit          NUMERIC(14,2) NOT NULL DEFAULT 0,
  current_balance       NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active             BOOLEAN     NOT NULL DEFAULT true,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_retail_partners_updated_at BEFORE UPDATE ON diffusers.retail_partners FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

ALTER TABLE diffusers.stock_locations
  ADD CONSTRAINT fk_diffusers_stock_locations_partner
    FOREIGN KEY (partner_id) REFERENCES diffusers.retail_partners (partner_id) ON DELETE SET NULL;

CREATE TABLE diffusers.consignment_stock (
  consignment_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id            UUID        NOT NULL REFERENCES diffusers.retail_partners (partner_id),
  product_id            UUID        NOT NULL REFERENCES diffusers.products (product_id),
  quantity_sent         INTEGER     NOT NULL CHECK (quantity_sent > 0),
  quantity_sold         INTEGER     NOT NULL DEFAULT 0,
  quantity_returned     INTEGER     NOT NULL DEFAULT 0,
  quantity_outstanding  INTEGER     GENERATED ALWAYS AS
                          (quantity_sent - quantity_sold - quantity_returned) STORED,
  agreed_price          NUMERIC(14,2) NOT NULL,
  sent_date             DATE        NOT NULL DEFAULT CURRENT_DATE,
  status                TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','partially_returned','fully_settled','recalled')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_consignment_stock_updated_at BEFORE UPDATE ON diffusers.consignment_stock FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_diffusers_consignment_partner ON diffusers.consignment_stock (partner_id, status);

CREATE TABLE diffusers.consignment_sales (
  sale_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  consignment_id        UUID        NOT NULL REFERENCES diffusers.consignment_stock (consignment_id),
  partner_id            UUID        NOT NULL REFERENCES diffusers.retail_partners (partner_id),
  quantity_sold         INTEGER     NOT NULL CHECK (quantity_sold > 0),
  sale_price            NUMERIC(14,2) NOT NULL,
  sale_date             DATE        NOT NULL,
  notes                 TEXT,
  recorded_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE diffusers.partner_settlements (
  settlement_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_number     TEXT        NOT NULL UNIQUE,
  partner_id            UUID        NOT NULL REFERENCES diffusers.retail_partners (partner_id),
  period_start          DATE        NOT NULL,
  period_end            DATE        NOT NULL,
  total_sales_value     NUMERIC(14,2) NOT NULL DEFAULT 0,
  partner_commission    NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_due_to_us      NUMERIC(14,2) NOT NULL DEFAULT 0,
  status                TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent','paid')),
  invoice_id            UUID        REFERENCES diffusers.invoices (invoice_id) ON DELETE SET NULL,
  document_id           UUID        REFERENCES shared.documents (document_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_partner_settlements_updated_at BEFORE UPDATE ON diffusers.partner_settlements FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();


-- ============================================================
-- MIGRATION 000018 — Per-business: Logistics
-- deliveries, delivery_items, delivery_tracking,
-- delivery_notes, courier_webhooks
-- ============================================================

-- ┌── JEWELRY ──────────────────────────────────────────────┐

CREATE TABLE jewelry.deliveries (
  delivery_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_number       TEXT        NOT NULL UNIQUE,
  reference_type        TEXT        NOT NULL CHECK (reference_type IN ('pos_transaction','sales_order')),
  reference_id          UUID        NOT NULL,
  contact_id            UUID        NOT NULL REFERENCES shared.contacts (contact_id),
  delivery_address      JSONB       NOT NULL,  -- {line1, area, city, state, landmark, recipient_name, phone}
  courier               TEXT        NOT NULL CHECK (courier IN ('chowdeck','gigl','manual')),
  courier_order_id      TEXT,                  -- Chowdeck / GIGL API reference
  waybill_number        TEXT,                  -- GIGL waybill
  status                TEXT        NOT NULL DEFAULT 'pending_dispatch'
                        CHECK (status IN ('pending_dispatch','dispatched','picked_up',
                                          'in_transit','delivered','failed','returned')),
  delivery_fee          NUMERIC(10,2) NOT NULL DEFAULT 0,
  fee_borne_by          TEXT        NOT NULL DEFAULT 'customer'
                        CHECK (fee_borne_by IN ('customer','business','split')),
  dispatched_at         TIMESTAMPTZ,
  delivered_at          TIMESTAMPTZ,
  failure_reason        TEXT,
  document_id           UUID        REFERENCES shared.documents (document_id) ON DELETE SET NULL,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_deliveries_updated_at
  BEFORE UPDATE ON jewelry.deliveries
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_jewelry_deliveries_courier_id ON jewelry.deliveries (courier_order_id) WHERE courier_order_id IS NOT NULL;
CREATE INDEX idx_jewelry_deliveries_status     ON jewelry.deliveries (status, created_at DESC);
CREATE INDEX idx_jewelry_deliveries_contact    ON jewelry.deliveries (contact_id);

CREATE TABLE jewelry.delivery_items (
  item_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id           UUID        NOT NULL REFERENCES jewelry.deliveries (delivery_id) ON DELETE CASCADE,
  product_id            UUID        REFERENCES jewelry.products (product_id) ON DELETE SET NULL,
  description           TEXT        NOT NULL,
  quantity              INTEGER     NOT NULL CHECK (quantity > 0),
  serial_numbers        TEXT[]      DEFAULT '{}'
);
CREATE INDEX idx_jewelry_delivery_items ON jewelry.delivery_items (delivery_id);

-- APPEND-ONLY status log
CREATE TABLE jewelry.delivery_tracking (
  track_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id           UUID        NOT NULL REFERENCES jewelry.deliveries (delivery_id) ON DELETE CASCADE,
  status                TEXT        NOT NULL,
  location              TEXT,
  message               TEXT,
  source                TEXT        NOT NULL CHECK (source IN ('chowdeck_webhook','gigl_webhook','manual','system')),
  raw_payload           JSONB,
  occurred_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jewelry_delivery_tracking ON jewelry.delivery_tracking (delivery_id, occurred_at DESC);

CREATE TABLE jewelry.delivery_notes (
  note_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id           UUID        NOT NULL REFERENCES jewelry.deliveries (delivery_id) ON DELETE CASCADE,
  content               TEXT        NOT NULL,
  is_customer_visible   BOOLEAN     NOT NULL DEFAULT false,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE jewelry.courier_webhooks (
  webhook_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  courier               TEXT        NOT NULL CHECK (courier IN ('chowdeck','gigl')),
  event_type            TEXT        NOT NULL,
  payload               JSONB       NOT NULL,
  delivery_id           UUID        REFERENCES jewelry.deliveries (delivery_id) ON DELETE SET NULL,
  processed             BOOLEAN     NOT NULL DEFAULT false,
  processed_at          TIMESTAMPTZ,
  error_message         TEXT,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jewelry_courier_webhooks_delivery    ON jewelry.courier_webhooks (delivery_id)  WHERE delivery_id IS NOT NULL;
CREATE INDEX idx_jewelry_courier_webhooks_unprocessed ON jewelry.courier_webhooks (courier, processed, received_at)
  WHERE processed = false;

-- ┌── DIFFUSERS ────────────────────────────────────────────┐

CREATE TABLE diffusers.deliveries (
  delivery_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_number       TEXT        NOT NULL UNIQUE,
  reference_type        TEXT        NOT NULL CHECK (reference_type IN ('pos_transaction','sales_order')),
  reference_id          UUID        NOT NULL,
  contact_id            UUID        NOT NULL REFERENCES shared.contacts (contact_id),
  delivery_address      JSONB       NOT NULL,
  courier               TEXT        NOT NULL CHECK (courier IN ('chowdeck','gigl','manual')),
  courier_order_id      TEXT,
  waybill_number        TEXT,
  status                TEXT        NOT NULL DEFAULT 'pending_dispatch'
                        CHECK (status IN ('pending_dispatch','dispatched','picked_up',
                                          'in_transit','delivered','failed','returned')),
  delivery_fee          NUMERIC(10,2) NOT NULL DEFAULT 0,
  fee_borne_by          TEXT        NOT NULL DEFAULT 'customer'
                        CHECK (fee_borne_by IN ('customer','business','split')),
  dispatched_at         TIMESTAMPTZ,
  delivered_at          TIMESTAMPTZ,
  failure_reason        TEXT,
  document_id           UUID        REFERENCES shared.documents (document_id) ON DELETE SET NULL,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_deliveries_updated_at BEFORE UPDATE ON diffusers.deliveries FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_diffusers_deliveries_status  ON diffusers.deliveries (status, created_at DESC);
CREATE INDEX idx_diffusers_deliveries_courier ON diffusers.deliveries (courier_order_id) WHERE courier_order_id IS NOT NULL;

CREATE TABLE diffusers.delivery_items (
  item_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id           UUID        NOT NULL REFERENCES diffusers.deliveries (delivery_id) ON DELETE CASCADE,
  product_id            UUID        REFERENCES diffusers.products (product_id) ON DELETE SET NULL,
  description           TEXT        NOT NULL,
  quantity              INTEGER     NOT NULL CHECK (quantity > 0),
  serial_numbers        TEXT[]      DEFAULT '{}'
);

CREATE TABLE diffusers.delivery_tracking (
  track_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id           UUID        NOT NULL REFERENCES diffusers.deliveries (delivery_id) ON DELETE CASCADE,
  status                TEXT        NOT NULL,
  location              TEXT,
  message               TEXT,
  source                TEXT        NOT NULL CHECK (source IN ('chowdeck_webhook','gigl_webhook','manual','system')),
  raw_payload           JSONB,
  occurred_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_diffusers_delivery_tracking ON diffusers.delivery_tracking (delivery_id, occurred_at DESC);

CREATE TABLE diffusers.delivery_notes (
  note_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id           UUID        NOT NULL REFERENCES diffusers.deliveries (delivery_id) ON DELETE CASCADE,
  content               TEXT        NOT NULL,
  is_customer_visible   BOOLEAN     NOT NULL DEFAULT false,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE diffusers.courier_webhooks (
  webhook_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  courier               TEXT        NOT NULL CHECK (courier IN ('chowdeck','gigl')),
  event_type            TEXT        NOT NULL,
  payload               JSONB       NOT NULL,
  delivery_id           UUID        REFERENCES diffusers.deliveries (delivery_id) ON DELETE SET NULL,
  processed             BOOLEAN     NOT NULL DEFAULT false,
  processed_at          TIMESTAMPTZ,
  error_message         TEXT,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_diffusers_courier_webhooks_unprocessed ON diffusers.courier_webhooks (courier, processed, received_at)
  WHERE processed = false;


-- ============================================================
-- MIGRATION 000019 — Per-business: Marketing
-- campaigns, campaign_recipients, campaign_events,
-- loyalty_points, loyalty_tiers, dashboard_configs, saved_reports
-- ============================================================

-- ┌── JEWELRY ──────────────────────────────────────────────┐

CREATE TABLE jewelry.campaigns (
  campaign_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name         TEXT        NOT NULL,
  campaign_type         TEXT        NOT NULL CHECK (campaign_type IN ('email','whatsapp')),
  subject_line          TEXT,
  from_name             TEXT,
  html_content          TEXT        NOT NULL,
  audience_filter       JSONB       NOT NULL DEFAULT '{}',
  status                TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','queued','sending','sent','paused','cancelled')),
  scheduled_at          TIMESTAMPTZ,
  sent_at               TIMESTAMPTZ,
  recipient_count       INTEGER     NOT NULL DEFAULT 0,
  delivered_count       INTEGER     NOT NULL DEFAULT 0,
  opened_count          INTEGER     NOT NULL DEFAULT 0,
  clicked_count         INTEGER     NOT NULL DEFAULT 0,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_campaigns_updated_at
  BEFORE UPDATE ON jewelry.campaigns
  FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
CREATE INDEX idx_jewelry_campaigns_status ON jewelry.campaigns (status, scheduled_at);

CREATE TABLE jewelry.campaign_recipients (
  recipient_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID        NOT NULL REFERENCES jewelry.campaigns (campaign_id) ON DELETE CASCADE,
  contact_id            UUID        NOT NULL REFERENCES shared.contacts (contact_id),
  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','sent','delivered','opened','clicked','bounced','unsubscribed')),
  sent_at               TIMESTAMPTZ,
  opened_at             TIMESTAMPTZ,
  clicked_at            TIMESTAMPTZ,
  tracking_token        TEXT        UNIQUE,
  unsubscribed_at       TIMESTAMPTZ,
  UNIQUE (campaign_id, contact_id)
);
CREATE INDEX idx_jewelry_campaign_recipients_campaign ON jewelry.campaign_recipients (campaign_id, status);
CREATE INDEX idx_jewelry_campaign_recipients_contact  ON jewelry.campaign_recipients (contact_id);
CREATE INDEX idx_jewelry_campaign_recipients_token    ON jewelry.campaign_recipients (tracking_token)
  WHERE tracking_token IS NOT NULL;

CREATE TABLE jewelry.campaign_events (
  event_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id          UUID        NOT NULL REFERENCES jewelry.campaign_recipients (recipient_id) ON DELETE CASCADE,
  event_type            TEXT        NOT NULL CHECK (event_type IN ('sent','delivered','opened','clicked','bounced','unsubscribed')),
  occurred_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata              JSONB       DEFAULT '{}'
);
CREATE INDEX idx_jewelry_campaign_events ON jewelry.campaign_events (recipient_id, event_type);

-- APPEND-ONLY loyalty ledger
CREATE TABLE jewelry.loyalty_points (
  transaction_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id            UUID        NOT NULL REFERENCES shared.contacts (contact_id),
  transaction_type      TEXT        NOT NULL CHECK (transaction_type IN ('earned','redeemed','expired','bonus','adjustment')),
  points                INTEGER     NOT NULL,  -- positive=earned, negative=redeemed/expired
  reference_type        TEXT,
  reference_id          UUID,
  notes                 TEXT,
  expires_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jewelry_loyalty_points_contact ON jewelry.loyalty_points (contact_id, created_at DESC);

CREATE TABLE jewelry.loyalty_tiers (
  tier_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name             TEXT        NOT NULL UNIQUE,
  min_points            INTEGER     NOT NULL DEFAULT 0,
  max_points            INTEGER,
  benefits              JSONB       NOT NULL DEFAULT '{}',
  colour                TEXT        DEFAULT '#64748B',
  display_order         SMALLINT    NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE jewelry.dashboard_configs (
  config_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES shared.users (user_id) ON DELETE CASCADE,
  dashboard_name        TEXT        NOT NULL,
  layout                JSONB       NOT NULL DEFAULT '[]',
  widgets               JSONB       NOT NULL DEFAULT '[]',
  is_default            BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_dashboard_configs_updated_at BEFORE UPDATE ON jewelry.dashboard_configs FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE TABLE jewelry.saved_reports (
  report_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by            UUID        NOT NULL REFERENCES shared.users (user_id) ON DELETE CASCADE,
  report_name           TEXT        NOT NULL,
  report_type           TEXT        NOT NULL,
  filters               JSONB       NOT NULL DEFAULT '{}',
  columns               JSONB       NOT NULL DEFAULT '[]',
  sort_config           JSONB       DEFAULT '{}',
  is_shared             BOOLEAN     NOT NULL DEFAULT false,
  schedule              JSONB,      -- {frequency, recipients, format}
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_jewelry_saved_reports_updated_at BEFORE UPDATE ON jewelry.saved_reports FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

-- ┌── DIFFUSERS ────────────────────────────────────────────┐

CREATE TABLE diffusers.campaigns (
  campaign_id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name         TEXT        NOT NULL,
  campaign_type         TEXT        NOT NULL CHECK (campaign_type IN ('email','whatsapp')),
  subject_line          TEXT,
  from_name             TEXT,
  html_content          TEXT        NOT NULL,
  audience_filter       JSONB       NOT NULL DEFAULT '{}',
  status                TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','queued','sending','sent','paused','cancelled')),
  scheduled_at          TIMESTAMPTZ,
  sent_at               TIMESTAMPTZ,
  recipient_count       INTEGER     NOT NULL DEFAULT 0,
  delivered_count       INTEGER     NOT NULL DEFAULT 0,
  opened_count          INTEGER     NOT NULL DEFAULT 0,
  clicked_count         INTEGER     NOT NULL DEFAULT 0,
  created_by            UUID        REFERENCES shared.users (user_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_campaigns_updated_at BEFORE UPDATE ON diffusers.campaigns FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE TABLE diffusers.campaign_recipients (
  recipient_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID        NOT NULL REFERENCES diffusers.campaigns (campaign_id) ON DELETE CASCADE,
  contact_id            UUID        NOT NULL REFERENCES shared.contacts (contact_id),
  status                TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','sent','delivered','opened','clicked','bounced','unsubscribed')),
  sent_at               TIMESTAMPTZ,
  opened_at             TIMESTAMPTZ,
  clicked_at            TIMESTAMPTZ,
  tracking_token        TEXT        UNIQUE,
  unsubscribed_at       TIMESTAMPTZ,
  UNIQUE (campaign_id, contact_id)
);
CREATE INDEX idx_diffusers_campaign_recipients_token ON diffusers.campaign_recipients (tracking_token)
  WHERE tracking_token IS NOT NULL;

CREATE TABLE diffusers.campaign_events (
  event_id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id          UUID        NOT NULL REFERENCES diffusers.campaign_recipients (recipient_id) ON DELETE CASCADE,
  event_type            TEXT        NOT NULL CHECK (event_type IN ('sent','delivered','opened','clicked','bounced','unsubscribed')),
  occurred_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata              JSONB       DEFAULT '{}'
);

CREATE TABLE diffusers.loyalty_points (
  transaction_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id            UUID        NOT NULL REFERENCES shared.contacts (contact_id),
  transaction_type      TEXT        NOT NULL CHECK (transaction_type IN ('earned','redeemed','expired','bonus','adjustment')),
  points                INTEGER     NOT NULL,
  reference_type        TEXT,
  reference_id          UUID,
  notes                 TEXT,
  expires_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_diffusers_loyalty_points_contact ON diffusers.loyalty_points (contact_id, created_at DESC);

CREATE TABLE diffusers.loyalty_tiers (
  tier_id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name             TEXT        NOT NULL UNIQUE,
  min_points            INTEGER     NOT NULL DEFAULT 0,
  max_points            INTEGER,
  benefits              JSONB       NOT NULL DEFAULT '{}',
  colour                TEXT        DEFAULT '#64748B',
  display_order         SMALLINT    NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE diffusers.dashboard_configs (
  config_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES shared.users (user_id) ON DELETE CASCADE,
  dashboard_name        TEXT        NOT NULL,
  layout                JSONB       NOT NULL DEFAULT '[]',
  widgets               JSONB       NOT NULL DEFAULT '[]',
  is_default            BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_dashboard_configs_updated_at BEFORE UPDATE ON diffusers.dashboard_configs FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();

CREATE TABLE diffusers.saved_reports (
  report_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by            UUID        NOT NULL REFERENCES shared.users (user_id) ON DELETE CASCADE,
  report_name           TEXT        NOT NULL,
  report_type           TEXT        NOT NULL,
  filters               JSONB       NOT NULL DEFAULT '{}',
  columns               JSONB       NOT NULL DEFAULT '[]',
  sort_config           JSONB       DEFAULT '{}',
  is_shared             BOOLEAN     NOT NULL DEFAULT false,
  schedule              JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_diffusers_saved_reports_updated_at BEFORE UPDATE ON diffusers.saved_reports FOR EACH ROW EXECUTE FUNCTION shared.fn_set_updated_at();
