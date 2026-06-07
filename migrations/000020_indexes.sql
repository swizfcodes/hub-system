-- ============================================================
-- MIGRATION 000020 — All remaining indexes
-- Run AFTER all tables exist. These are the performance-critical
-- indexes not already created inline with their tables.
--
-- FIXES vs original:
--   1. idx_sessions_expires  — removed now() from WHERE predicate
--      (now() is STABLE not IMMUTABLE; filter in queries instead)
--   2. All to_tsvector GIN indexes confirmed predicate-free (OK)
--   3. All other partial predicates use only column = constant
--      comparisons which are IMMUTABLE — no changes needed there
-- ============================================================

-- ── SHARED SCHEMA ────────────────────────────────────────────

-- contacts
CREATE INDEX IF NOT EXISTS idx_contacts_deleted
  ON shared.contacts (is_deleted, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_visible_to
  ON shared.contacts USING GIN (visible_to);

-- users
CREATE INDEX IF NOT EXISTS idx_users_active
  ON shared.users (is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_users_business
  ON shared.users (default_business);

-- user_sessions
-- FIX: removed WHERE expires_at > now() — now() is STABLE not IMMUTABLE.
--      Filter live sessions in the query layer instead.
CREATE INDEX IF NOT EXISTS idx_sessions_expires
  ON shared.user_sessions (expires_at);

-- refresh_tokens
CREATE INDEX IF NOT EXISTS idx_refresh_active
  ON shared.refresh_tokens (user_id, expires_at)
  WHERE revoked_at IS NULL;

-- permissions — cached in Redis but fallback must be fast
CREATE INDEX IF NOT EXISTS idx_permissions_lookup
  ON shared.permissions (role_id, module, action);

-- staff_profiles
CREATE INDEX IF NOT EXISTS idx_staff_active
  ON shared.staff_profiles (business, is_deleted)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_staff_employee_number
  ON shared.staff_profiles (employee_number);

-- leave_requests
CREATE INDEX IF NOT EXISTS idx_leave_pending
  ON shared.leave_requests (profile_id, status)
  WHERE status = 'pending';

-- documents
CREATE INDEX IF NOT EXISTS idx_documents_type
  ON shared.documents (business, document_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_hash
  ON shared.documents (content_hash);

-- message_channels
CREATE INDEX IF NOT EXISTS idx_channels_type
  ON shared.message_channels (channel_type, business);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notif_unread
  ON shared.notifications (user_id, created_at DESC)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notif_business
  ON shared.notifications (business, type, created_at DESC);

-- calendar_events
CREATE INDEX IF NOT EXISTS idx_cal_events_type
  ON shared.calendar_events (business, event_type, start_at)
  WHERE is_deleted = false;

-- tasks
CREATE INDEX IF NOT EXISTS idx_tasks_business
  ON shared.tasks (business, status, priority)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_tasks_parent
  ON shared.tasks (parent_task_id)
  WHERE parent_task_id IS NOT NULL;

-- audit_log
CREATE INDEX IF NOT EXISTS idx_audit_business_module
  ON shared.audit_log (business, module, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_action
  ON shared.audit_log (action, occurred_at DESC);

-- webhook_log
CREATE INDEX IF NOT EXISTS idx_webhook_source_type
  ON shared.webhook_log (source, event_type, received_at DESC);

-- currency_rates
CREATE INDEX IF NOT EXISTS idx_currency_latest
  ON shared.currency_rates (from_currency, valid_at DESC);

-- document_numbering
CREATE INDEX IF NOT EXISTS idx_doc_numbering_lookup
  ON shared.document_numbering (business, document_type);


-- ── JEWELRY SCHEMA ───────────────────────────────────────────

-- products
-- NOTE: to_tsvector is STABLE not IMMUTABLE so it cannot appear in a
--       WHERE predicate. GIN expression indexes (no WHERE) are fine.
CREATE INDEX IF NOT EXISTS idx_j_products_name
  ON jewelry.products USING GIN (to_tsvector('english', name));

CREATE INDEX IF NOT EXISTS idx_j_products_price_range
  ON jewelry.products (selling_price, is_active)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_j_products_reorder
  ON jewelry.products (reorder_level)
  WHERE is_active = true AND is_deleted = false;

-- stock_movements — most queried table in the system
CREATE INDEX IF NOT EXISTS idx_j_stock_type_date
  ON jewelry.stock_movements (movement_type, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_j_stock_from_loc
  ON jewelry.stock_movements (from_location_id, performed_at DESC)
  WHERE from_location_id IS NOT NULL;

-- stock_reservations
CREATE INDEX IF NOT EXISTS idx_j_reservations_contact
  ON jewelry.stock_reservations (reserved_for)
  WHERE reserved_for IS NOT NULL AND status = 'active';

-- crm_deals
CREATE INDEX IF NOT EXISTS idx_j_deals_close_date
  ON jewelry.crm_deals (expected_close_date)
  WHERE is_deleted = false AND stage NOT IN ('won', 'lost');

CREATE INDEX IF NOT EXISTS idx_j_deals_value
  ON jewelry.crm_deals (expected_value DESC)
  WHERE is_deleted = false;

-- quotations
CREATE INDEX IF NOT EXISTS idx_j_quotations_expiry
  ON jewelry.quotations (valid_until, status)
  WHERE status IN ('draft', 'sent', 'viewed');

-- sales_orders
CREATE INDEX IF NOT EXISTS idx_j_orders_outstanding
  ON jewelry.sales_orders (amount_outstanding DESC)
  WHERE amount_outstanding > 0;

-- invoices
CREATE INDEX IF NOT EXISTS idx_j_invoices_overdue
  ON jewelry.invoices (due_date, status)
  WHERE status = 'overdue' AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_j_invoices_period
  ON jewelry.invoices (issue_date DESC)
  WHERE is_deleted = false;

-- invoice_payments
CREATE INDEX IF NOT EXISTS idx_j_payments_date
  ON jewelry.invoice_payments (payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_j_payments_confirmed
  ON jewelry.invoice_payments (is_confirmed, created_at DESC)
  WHERE is_confirmed = false;

-- journal_entries
CREATE INDEX IF NOT EXISTS idx_j_je_period_type
  ON jewelry.journal_entries (reference_type, entry_date DESC);

-- journal_lines — P&L queries hit this constantly
CREATE INDEX IF NOT EXISTS idx_j_jl_debit_credit
  ON jewelry.journal_lines (account_id, debit, credit);

-- bank_statements
CREATE INDEX IF NOT EXISTS idx_j_bs_date_amount
  ON jewelry.bank_statements (transaction_date DESC, amount);

-- purchase_orders
CREATE INDEX IF NOT EXISTS idx_j_po_date
  ON jewelry.purchase_orders (order_date DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_j_po_expected_del
  ON jewelry.purchase_orders (expected_delivery, status)
  WHERE status IN ('sent', 'acknowledged', 'partially_received');

-- goods_received
CREATE INDEX IF NOT EXISTS idx_j_gr_date
  ON jewelry.goods_received (received_date DESC);

-- supplier_invoices
CREATE INDEX IF NOT EXISTS idx_j_sup_inv_due
  ON jewelry.supplier_invoices (due_date, status)
  WHERE status IN ('pending', 'matched', 'approved');

-- expenses
CREATE INDEX IF NOT EXISTS idx_j_expenses_date
  ON jewelry.expenses (expense_date DESC);

-- payroll_runs
CREATE INDEX IF NOT EXISTS idx_j_payroll_period
  ON jewelry.payroll_runs (period_year, period_month);

-- payslips
CREATE INDEX IF NOT EXISTS idx_j_payslips_period
  ON jewelry.payslips (run_id, net_salary DESC);

-- commission_earned
CREATE INDEX IF NOT EXISTS idx_j_commission_period
  ON jewelry.commission_earned (period_year, period_month, profile_id);

-- retail_partners
CREATE INDEX IF NOT EXISTS idx_j_partners_active
  ON jewelry.retail_partners (is_active, arrangement_type);

CREATE INDEX IF NOT EXISTS idx_j_partners_balance
  ON jewelry.retail_partners (current_balance DESC)
  WHERE is_active = true;

-- consignment_stock
CREATE INDEX IF NOT EXISTS idx_j_consignment_date
  ON jewelry.consignment_stock (sent_date DESC, status);

-- deliveries
CREATE INDEX IF NOT EXISTS idx_j_deliveries_date
  ON jewelry.deliveries (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_j_deliveries_active
  ON jewelry.deliveries (status, courier)
  WHERE status NOT IN ('delivered', 'returned', 'failed');

-- delivery_tracking
CREATE INDEX IF NOT EXISTS idx_j_tracking_source
  ON jewelry.delivery_tracking (source, occurred_at DESC);

-- campaigns
CREATE INDEX IF NOT EXISTS idx_j_campaigns_type
  ON jewelry.campaigns (campaign_type, status);

-- campaign_recipients
CREATE INDEX IF NOT EXISTS idx_j_recipients_status
  ON jewelry.campaign_recipients (status, campaign_id);

-- loyalty_points
CREATE INDEX IF NOT EXISTS idx_j_loyalty_type
  ON jewelry.loyalty_points (transaction_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_j_loyalty_expires
  ON jewelry.loyalty_points (expires_at)
  WHERE expires_at IS NOT NULL;

-- pos_transactions
CREATE INDEX IF NOT EXISTS idx_j_pos_tx_date
  ON jewelry.pos_transactions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_j_pos_tx_served_date
  ON jewelry.pos_transactions (served_by, created_at DESC);

-- pos_sessions
CREATE INDEX IF NOT EXISTS idx_j_pos_sess_date
  ON jewelry.pos_sessions (opened_at DESC);


-- ── DIFFUSERS SCHEMA — mirrors jewelry exactly ────────────────

CREATE INDEX IF NOT EXISTS idx_d_products_name
  ON diffusers.products USING GIN (to_tsvector('english', name));

CREATE INDEX IF NOT EXISTS idx_d_products_price_range
  ON diffusers.products (selling_price, is_active)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_d_stock_type_date
  ON diffusers.stock_movements (movement_type, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_d_stock_from_loc
  ON diffusers.stock_movements (from_location_id, performed_at DESC)
  WHERE from_location_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_d_deals_close_date
  ON diffusers.crm_deals (expected_close_date)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_d_quotations_expiry
  ON diffusers.quotations (valid_until, status)
  WHERE status IN ('draft', 'sent', 'viewed');

CREATE INDEX IF NOT EXISTS idx_d_orders_outstanding
  ON diffusers.sales_orders (amount_outstanding DESC)
  WHERE amount_outstanding > 0;

CREATE INDEX IF NOT EXISTS idx_d_invoices_overdue
  ON diffusers.invoices (due_date, status)
  WHERE status = 'overdue' AND is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_d_invoices_period
  ON diffusers.invoices (issue_date DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_d_payments_confirmed
  ON diffusers.invoice_payments (is_confirmed, created_at DESC)
  WHERE is_confirmed = false;

CREATE INDEX IF NOT EXISTS idx_d_jl_account
  ON diffusers.journal_lines (account_id, debit, credit);

CREATE INDEX IF NOT EXISTS idx_d_je_period_type
  ON diffusers.journal_entries (reference_type, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_d_po_expected_del
  ON diffusers.purchase_orders (expected_delivery, status)
  WHERE status IN ('sent', 'acknowledged', 'partially_received');

CREATE INDEX IF NOT EXISTS idx_d_sup_inv_due
  ON diffusers.supplier_invoices (due_date, status)
  WHERE status IN ('pending', 'matched', 'approved');

CREATE INDEX IF NOT EXISTS idx_d_expenses_date
  ON diffusers.expenses (expense_date DESC);

CREATE INDEX IF NOT EXISTS idx_d_payroll_period
  ON diffusers.payroll_runs (period_year, period_month);

CREATE INDEX IF NOT EXISTS idx_d_consignment_date
  ON diffusers.consignment_stock (sent_date DESC, status);

CREATE INDEX IF NOT EXISTS idx_d_deliveries_active
  ON diffusers.deliveries (status, courier)
  WHERE status NOT IN ('delivered', 'returned', 'failed');

CREATE INDEX IF NOT EXISTS idx_d_tracking_source
  ON diffusers.delivery_tracking (source, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_d_loyalty_expires
  ON diffusers.loyalty_points (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_d_pos_tx_date
  ON diffusers.pos_transactions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_d_recipients_status
  ON diffusers.campaign_recipients (status, campaign_id);


-- ============================================================
-- Verify index count
-- SELECT schemaname, COUNT(*) FROM pg_indexes
-- WHERE schemaname IN ('shared','jewelry','diffusers')
-- GROUP BY schemaname
-- ORDER BY schemaname;
-- ============================================================