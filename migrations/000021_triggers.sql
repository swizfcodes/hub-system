-- ============================================================
-- MIGRATION 000021 — All database triggers
-- These enforce rules that column constraints cannot express.
-- Run AFTER all tables and indexes exist.
-- ============================================================

-- ── TRIGGER 1: Audit log protection ──────────────────────
-- The audit_log table is append-only forever.
-- This trigger fires BEFORE any UPDATE or DELETE and raises
-- an exception unconditionally. No row may ever be modified.

CREATE OR REPLACE FUNCTION shared.fn_audit_protect()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'ILLEGAL OPERATION: audit_log is append-only. '
    'Attempted % on log_id %. '
    'Contact a senior engineer if this was unintentional.',
    TG_OP, OLD.log_id;
END;
$$;

CREATE TRIGGER trg_audit_protect
  BEFORE UPDATE OR DELETE ON shared.audit_log
  FOR EACH ROW EXECUTE FUNCTION shared.fn_audit_protect();


-- ── TRIGGER 2: Document immutability ─────────────────────
-- Once a document row is created only is_deleted and
-- deleted_at may change. All other columns are frozen.

CREATE OR REPLACE FUNCTION shared.fn_document_protect()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  -- Allow only soft-delete fields to change
  IF NEW.document_id      != OLD.document_id      OR
     NEW.document_number  != OLD.document_number  OR
     NEW.business         != OLD.business         OR
     NEW.document_type    != OLD.document_type    OR
     NEW.file_path        != OLD.file_path        OR
     NEW.content_hash     != OLD.content_hash     OR
     NEW.created_at       != OLD.created_at
  THEN
    RAISE EXCEPTION
      'ILLEGAL OPERATION: document record % is immutable after creation. '
      'Only is_deleted and deleted_at may be changed.',
      OLD.document_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_document_protect
  BEFORE UPDATE ON shared.documents
  FOR EACH ROW EXECUTE FUNCTION shared.fn_document_protect();


-- ── TRIGGER 3: Journal entry balance check ───────────────
-- Every journal entry must balance: SUM(debit) = SUM(credit).
-- Fires AFTER the last line is inserted for an entry.
-- The application service also enforces this — the trigger
-- is the database-level safety net.

CREATE OR REPLACE FUNCTION shared.fn_check_journal_balance()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_total_debit  NUMERIC(15,2);
  v_total_credit NUMERIC(15,2);
BEGIN
  SELECT
    COALESCE(SUM(debit),  0),
    COALESCE(SUM(credit), 0)
  INTO v_total_debit, v_total_credit
  FROM jewelry.journal_lines
  WHERE entry_id = NEW.entry_id;

  IF v_total_debit != v_total_credit THEN
    RAISE EXCEPTION
      'Journal entry % does not balance: debit=% credit=%. '
      'Each journal entry must have equal debits and credits.',
      NEW.entry_id, v_total_debit, v_total_credit;
  END IF;

  RETURN NEW;
END;
$$;

-- Apply to jewelry
CREATE OR REPLACE FUNCTION jewelry.fn_check_journal_balance()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_debit  NUMERIC(15,2);
  v_credit NUMERIC(15,2);
BEGIN
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
  INTO v_debit, v_credit
  FROM jewelry.journal_lines
  WHERE entry_id = NEW.entry_id;

  IF v_debit != v_credit THEN
    RAISE EXCEPTION
      'Journal entry % is unbalanced: DR=% CR=%. Fix before commit.',
      NEW.entry_id, v_debit, v_credit;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_jewelry_journal_balance
  AFTER INSERT OR UPDATE ON jewelry.journal_lines
  FOR EACH ROW EXECUTE FUNCTION jewelry.fn_check_journal_balance();

-- Apply to diffusers
CREATE OR REPLACE FUNCTION diffusers.fn_check_journal_balance()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_debit  NUMERIC(15,2);
  v_credit NUMERIC(15,2);
BEGIN
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
  INTO v_debit, v_credit
  FROM diffusers.journal_lines
  WHERE entry_id = NEW.entry_id;

  IF v_debit != v_credit THEN
    RAISE EXCEPTION
      'Journal entry % is unbalanced: DR=% CR=%. Fix before commit.',
      NEW.entry_id, v_debit, v_credit;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_diffusers_journal_balance
  AFTER INSERT OR UPDATE ON diffusers.journal_lines
  FOR EACH ROW EXECUTE FUNCTION diffusers.fn_check_journal_balance();


-- ── TRIGGER 4: Stock non-negative check ──────────────────
-- Prevents stock from going below zero for non-adjustment
-- movement types. Adjustments bypass this (they are explicit
-- corrections with a reason and approval).

CREATE OR REPLACE FUNCTION jewelry.fn_stock_no_negative()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_current_stock INTEGER;
BEGIN
  -- Only check outbound movements that are not adjustments
  IF NEW.direction = -1 AND NEW.movement_type != 'adjustment' THEN
    SELECT COALESCE(SUM(quantity * direction), 0)
    INTO v_current_stock
    FROM jewelry.stock_movements
    WHERE product_id = NEW.product_id;

    -- After this movement would stock go negative?
    IF (v_current_stock + (NEW.quantity * NEW.direction)) < 0 THEN
      RAISE EXCEPTION
        'Insufficient stock for product %. '
        'Current: %, Requested: %. '
        'Use movement_type=adjustment with approval to correct stock counts.',
        NEW.product_id, v_current_stock, NEW.quantity;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_jewelry_stock_no_negative
  BEFORE INSERT ON jewelry.stock_movements
  FOR EACH ROW EXECUTE FUNCTION jewelry.fn_stock_no_negative();

CREATE OR REPLACE FUNCTION diffusers.fn_stock_no_negative()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_current_stock INTEGER;
BEGIN
  IF NEW.direction = -1 AND NEW.movement_type != 'adjustment' THEN
    SELECT COALESCE(SUM(quantity * direction), 0)
    INTO v_current_stock
    FROM diffusers.stock_movements
    WHERE product_id = NEW.product_id;

    IF (v_current_stock + (NEW.quantity * NEW.direction)) < 0 THEN
      RAISE EXCEPTION
        'Insufficient stock for product %. Current: %, Requested: %.',
        NEW.product_id, v_current_stock, NEW.quantity;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_diffusers_stock_no_negative
  BEFORE INSERT ON diffusers.stock_movements
  FOR EACH ROW EXECUTE FUNCTION diffusers.fn_stock_no_negative();


-- ── TRIGGER 5: Auto-update invoice amount_paid and status ─
-- When a payment is inserted against an invoice, recalculate
-- the invoice's amount_paid and update status accordingly.

CREATE OR REPLACE FUNCTION jewelry.fn_update_invoice_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_total_paid    NUMERIC(14,2);
  v_total_amount  NUMERIC(14,2);
  v_new_status    TEXT;
BEGIN
  -- Sum all confirmed payments for this invoice
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_paid
  FROM jewelry.invoice_payments
  WHERE invoice_id = NEW.invoice_id;

  SELECT total_amount
  INTO v_total_amount
  FROM jewelry.invoices
  WHERE invoice_id = NEW.invoice_id;

  -- Determine new status
  IF v_total_paid <= 0 THEN
    v_new_status := 'sent';
  ELSIF v_total_paid >= v_total_amount THEN
    v_new_status := 'paid';
  ELSE
    v_new_status := 'partially_paid';
  END IF;

  UPDATE jewelry.invoices
  SET
    amount_paid = v_total_paid,
    status      = v_new_status,
    paid_at     = CASE WHEN v_new_status = 'paid' THEN now() ELSE NULL END,
    updated_at  = now()
  WHERE invoice_id = NEW.invoice_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_jewelry_invoice_payment_update
  AFTER INSERT OR UPDATE ON jewelry.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION jewelry.fn_update_invoice_on_payment();

CREATE OR REPLACE FUNCTION diffusers.fn_update_invoice_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_total_paid    NUMERIC(14,2);
  v_total_amount  NUMERIC(14,2);
  v_new_status    TEXT;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_paid
  FROM diffusers.invoice_payments
  WHERE invoice_id = NEW.invoice_id;

  SELECT total_amount
  INTO v_total_amount
  FROM diffusers.invoices
  WHERE invoice_id = NEW.invoice_id;

  IF v_total_paid <= 0 THEN
    v_new_status := 'sent';
  ELSIF v_total_paid >= v_total_amount THEN
    v_new_status := 'paid';
  ELSE
    v_new_status := 'partially_paid';
  END IF;

  UPDATE diffusers.invoices
  SET
    amount_paid = v_total_paid,
    status      = v_new_status,
    paid_at     = CASE WHEN v_new_status = 'paid' THEN now() ELSE NULL END,
    updated_at  = now()
  WHERE invoice_id = NEW.invoice_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_diffusers_invoice_payment_update
  AFTER INSERT OR UPDATE ON diffusers.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION diffusers.fn_update_invoice_on_payment();


-- ── TRIGGER 6: Payslip totals recalculation ──────────────
-- Recomputes gross_salary, total_deductions, and net_salary
-- from component columns before any insert or update.
-- Prevents manual override of derived values.

CREATE OR REPLACE FUNCTION jewelry.fn_recalc_payslip()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.gross_salary := NEW.basic_salary
                    + NEW.housing_allowance
                    + NEW.transport_allowance
                    + NEW.commission_amount
                    + NEW.other_allowances;

  NEW.total_deductions := NEW.paye_deduction
                        + NEW.pension_employee
                        + NEW.nhf_deduction
                        + NEW.advance_recovery
                        + NEW.other_deductions;

  NEW.net_salary := NEW.gross_salary - NEW.total_deductions;

  IF NEW.net_salary < 0 THEN
    RAISE EXCEPTION
      'Payslip for profile % results in negative net salary (%). '
      'Check deductions.',
      NEW.profile_id, NEW.net_salary;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_jewelry_payslip_recalc
  BEFORE INSERT OR UPDATE ON jewelry.payslips
  FOR EACH ROW EXECUTE FUNCTION jewelry.fn_recalc_payslip();

CREATE OR REPLACE FUNCTION diffusers.fn_recalc_payslip()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.gross_salary := NEW.basic_salary
                    + NEW.housing_allowance
                    + NEW.transport_allowance
                    + NEW.commission_amount
                    + NEW.other_allowances;

  NEW.total_deductions := NEW.paye_deduction
                        + NEW.pension_employee
                        + NEW.nhf_deduction
                        + NEW.advance_recovery
                        + NEW.other_deductions;

  NEW.net_salary := NEW.gross_salary - NEW.total_deductions;

  IF NEW.net_salary < 0 THEN
    RAISE EXCEPTION
      'Negative net salary for profile %. Check deductions.',
      NEW.profile_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_diffusers_payslip_recalc
  BEFORE INSERT OR UPDATE ON diffusers.payslips
  FOR EACH ROW EXECUTE FUNCTION diffusers.fn_recalc_payslip();


-- ── TRIGGER 7: Consignment quantity validation ────────────
-- Ensures quantity_sold + quantity_returned never exceeds
-- quantity_sent on a consignment record.

CREATE OR REPLACE FUNCTION jewelry.fn_validate_consignment_qty()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.quantity_sold + NEW.quantity_returned) > NEW.quantity_sent THEN
    RAISE EXCEPTION
      'Consignment % quantity violation: sold(%) + returned(%) > sent(%).',
      NEW.consignment_id, NEW.quantity_sold, NEW.quantity_returned, NEW.quantity_sent;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_jewelry_consignment_qty_check
  BEFORE INSERT OR UPDATE ON jewelry.consignment_stock
  FOR EACH ROW EXECUTE FUNCTION jewelry.fn_validate_consignment_qty();

CREATE OR REPLACE FUNCTION diffusers.fn_validate_consignment_qty()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.quantity_sold + NEW.quantity_returned) > NEW.quantity_sent THEN
    RAISE EXCEPTION
      'Consignment % quantity violation: sold + returned > sent.',
      NEW.consignment_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_diffusers_consignment_qty_check
  BEFORE INSERT OR UPDATE ON diffusers.consignment_stock
  FOR EACH ROW EXECUTE FUNCTION diffusers.fn_validate_consignment_qty();


-- ── TRIGGER 8: Auto-generate delivery tracking entry ─────
-- When a delivery status changes, automatically append a
-- tracking row so the history is always complete.

CREATE OR REPLACE FUNCTION jewelry.fn_auto_delivery_tracking()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status != OLD.status THEN
    INSERT INTO jewelry.delivery_tracking
      (delivery_id, status, source, message, occurred_at)
    VALUES
      (NEW.delivery_id, NEW.status, 'system',
       'Status changed from ' || OLD.status || ' to ' || NEW.status,
       now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_jewelry_delivery_auto_tracking
  AFTER UPDATE ON jewelry.deliveries
  FOR EACH ROW EXECUTE FUNCTION jewelry.fn_auto_delivery_tracking();

CREATE OR REPLACE FUNCTION diffusers.fn_auto_delivery_tracking()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status != OLD.status THEN
    INSERT INTO diffusers.delivery_tracking
      (delivery_id, status, source, message, occurred_at)
    VALUES
      (NEW.delivery_id, NEW.status, 'system',
       'Status changed from ' || OLD.status || ' to ' || NEW.status,
       now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_diffusers_delivery_auto_tracking
  AFTER UPDATE ON diffusers.deliveries
  FOR EACH ROW EXECUTE FUNCTION diffusers.fn_auto_delivery_tracking();


-- ── TRIGGER 9: PO line received qty guard ─────────────────
-- Prevents marking more quantity received than was ordered
-- on a purchase order line.

CREATE OR REPLACE FUNCTION jewelry.fn_po_line_received_check()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.quantity_received > NEW.quantity_ordered THEN
    RAISE EXCEPTION
      'PO line %: quantity_received (%) cannot exceed quantity_ordered (%).',
      NEW.line_id, NEW.quantity_received, NEW.quantity_ordered;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_jewelry_po_line_received
  BEFORE INSERT OR UPDATE ON jewelry.po_lines
  FOR EACH ROW EXECUTE FUNCTION jewelry.fn_po_line_received_check();

CREATE OR REPLACE FUNCTION diffusers.fn_po_line_received_check()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.quantity_received > NEW.quantity_ordered THEN
    RAISE EXCEPTION
      'PO line %: received cannot exceed ordered.',
      NEW.line_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_diffusers_po_line_received
  BEFORE INSERT OR UPDATE ON diffusers.po_lines
  FOR EACH ROW EXECUTE FUNCTION diffusers.fn_po_line_received_check();


-- ── TRIGGER 10: Overdue invoice auto-flag ─────────────────
-- A daily cron job calls this function to mark overdue invoices.
-- Not a row trigger — called explicitly by the scheduler.

CREATE OR REPLACE FUNCTION jewelry.fn_mark_overdue_invoices()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE jewelry.invoices
  SET status = 'overdue', updated_at = now()
  WHERE due_date < CURRENT_DATE
    AND status IN ('sent','partially_paid')
    AND is_deleted = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION diffusers.fn_mark_overdue_invoices()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE diffusers.invoices
  SET status = 'overdue', updated_at = now()
  WHERE due_date < CURRENT_DATE
    AND status IN ('sent','partially_paid')
    AND is_deleted = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Usage from Node.js cron:
-- await pool.query("SELECT jewelry.fn_mark_overdue_invoices()");
-- await pool.query("SELECT diffusers.fn_mark_overdue_invoices()");


-- ── TRIGGER 11: Expire stock reservations ─────────────────
-- Called by cron. Releases reservations past their expiry.

CREATE OR REPLACE FUNCTION jewelry.fn_expire_reservations()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE jewelry.stock_reservations
  SET status = 'released', updated_at = now()
  WHERE expires_at < now()
    AND status = 'active';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION diffusers.fn_expire_reservations()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE diffusers.stock_reservations
  SET status = 'released', updated_at = now()
  WHERE expires_at < now()
    AND status = 'active';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ============================================================
-- Verify triggers
-- SELECT trigger_name, event_object_schema, event_object_table,
--        event_manipulation
-- FROM information_schema.triggers
-- WHERE trigger_schema IN ('shared','jewelry','diffusers')
-- ORDER BY event_object_schema, event_object_table, trigger_name;
-- ============================================================
