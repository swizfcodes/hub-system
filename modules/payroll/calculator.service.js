"use strict";

const { withBusinessContext } = require("../../config/db");
const { calculateDeductions } = require("./deductions");
const payrollConfig = require("./config");

/**
 * Calculate payslip figures for a single staff member for a given payroll run period.
 * Does NOT write to DB — returns computed values for review before confirmation.
 */
async function calculatePayslip(
  business,
  profileId,
  periodMonth,
  periodYear,
  client,
) {
  // Resolve per-business payroll config (allowance ratios, working days,
  // advance recovery cap). Today this returns Nigerian defaults; future
  // wire-up to business_config will let each brand override without
  // touching this function.
  const cfg = await payrollConfig.resolveConfig(client, business);

  // Get staff base salary from current active contract
  const {
    rows: [profile],
  } = await client.query(
    `SELECT sp.profile_id, sp.base_salary,
            c.display_name,
            COALESCE(sc.gross_salary, sp.base_salary) AS contract_gross
     FROM shared.staff_profiles sp
     JOIN shared.contacts c ON c.contact_id = sp.contact_id
     LEFT JOIN shared.staff_contracts sc
       ON sc.profile_id = sp.profile_id
       AND sc.effective_from <= CURRENT_DATE
       AND (sc.effective_to IS NULL OR sc.effective_to >= CURRENT_DATE)
     WHERE sp.profile_id = $1
     ORDER BY sc.effective_from DESC NULLS LAST
     LIMIT 1`,
    [profileId],
  );
  if (!profile) throw new Error(`Staff profile ${profileId} not found`);

  // Use contract_gross — the COALESCE of the active staff_contracts
  // row's gross_salary and the profile's base_salary. The query goes
  // to the trouble of resolving the active contract; reading
  // profile.base_salary directly (the previous bug) ignored it, so a
  // staff member whose pay was set via a contract would be paid their
  // stale base_salary instead.
  const basicSalary = parseFloat(profile.contract_gross);

  // Guard against a missing/zero salary. Without this, a staff member
  // added with no contract and base_salary = 0 would be issued a ₦0
  // payslip with no error — the payroll run would total up with a
  // silent zero member. Promoting it to a thrown error means
  // payroll.service.initiateRun's per-staff catch logs
  // "Payslip calculation failed for profile X" so it's visible.
  if (!basicSalary || basicSalary <= 0) {
    throw new Error(
      `No salary configured for staff profile ${profileId} ` +
        `(${profile.display_name || "unknown"}). Add a contract or set ` +
        `base_salary before running payroll.`,
    );
  }

  // Standard allowances — ratios come from payroll config so each
  // business can override without code change.
  const housingAllowance = parseFloat(
    (basicSalary * cfg.HOUSING_ALLOWANCE_RATIO).toFixed(2),
  );
  const transportAllowance = parseFloat(
    (basicSalary * cfg.TRANSPORT_ALLOWANCE_RATIO).toFixed(2),
  );

  // Commission earned this period
  const {
    rows: [commRow],
  } = await client.query(
    `SELECT COALESCE(SUM(commission_amount), 0) AS total
     FROM commission_earned
     WHERE profile_id=$1 AND period_month=$2 AND period_year=$3 AND payslip_id IS NULL`,
    [profileId, periodMonth, periodYear],
  );
  const commissionAmount = parseFloat(commRow.total);

  const grossSalary = parseFloat(
    (
      basicSalary +
      housingAllowance +
      transportAllowance +
      commissionAmount
    ).toFixed(2),
  );

  // Outstanding cash advances to recover — capped at the per-business
  // ratio so staff never receive an unworkable net payslip.
  const {
    rows: [advRow],
  } = await client.query(
    `SELECT COALESCE(SUM(outstanding_balance), 0) AS total
     FROM cash_advances
     WHERE profile_id=$1 AND status='disbursed'`,
    [profileId],
  );
  const advanceOutstanding = Math.min(
    parseFloat(advRow.total),
    grossSalary * cfg.ADVANCE_RECOVERY_CAP_RATIO,
  );

  // Absent days deduction — daily rate from config so 6-day-week
  // businesses (26 working days) calculate correctly.
  const {
    rows: [absRow],
  } = await client.query(
    `SELECT COALESCE(SUM(days_requested), 0) AS absent_days
     FROM shared.leave_requests
     WHERE profile_id=$1
       AND leave_type='unpaid'
       AND status='approved'
       AND EXTRACT(MONTH FROM start_date)=$2
       AND EXTRACT(YEAR  FROM start_date)=$3`,
    [profileId, periodMonth, periodYear],
  );
  const daysAbsent = parseInt(absRow.absent_days);
  const dailyRate = basicSalary / cfg.WORKING_DAYS_PER_MONTH;
  const absentDeduct = parseFloat((daysAbsent * dailyRate).toFixed(2));

  const deductions = calculateDeductions({
    basicSalary,
    grossSalary,
    advanceOutstanding,
    otherDeductions: absentDeduct,
  });

  return {
    profileId,
    displayName: profile.display_name,
    basicSalary,
    housingAllowance,
    transportAllowance,
    commissionAmount,
    grossSalary,
    daysAbsent,
    ...deductions,
  };
}

module.exports = { calculatePayslip };
