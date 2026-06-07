"use strict";

async function listRuns(client, { status, limit, offset }) {
  const { rows } = await client.query(
    `SELECT run_id, run_number, period_month, period_year, status,
            total_gross, total_net, total_paye, created_at
     FROM payroll_runs
     WHERE ($1::TEXT IS NULL OR status = $1)
     ORDER BY period_year DESC, period_month DESC
     LIMIT $2 OFFSET $3`,
    [status || null, limit, offset],
  );
  return rows;
}

async function findExistingRun(client, { period_month, period_year }) {
  const { rows } = await client.query(
    `SELECT run_id FROM payroll_runs WHERE period_month=$1 AND period_year=$2`,
    [period_month, period_year],
  );
  return rows;
}

async function insertRun(
  client,
  { runNumber, period_month, period_year, userId },
) {
  const {
    rows: [run],
  } = await client.query(
    `INSERT INTO payroll_runs (run_number, period_month, period_year, status, created_by) VALUES ($1,$2,$3,'draft',$4) RETURNING *`,
    [runNumber, period_month, period_year, userId],
  );
  return run;
}

async function getActiveStaff(client, business) {
  const { rows } = await client.query(
    `SELECT profile_id FROM shared.staff_profiles WHERE business=$1 AND is_deleted=false AND end_date IS NULL`,
    [business],
  );
  return rows;
}

async function insertPayslip(client, { run_id, calc }) {
  await client.query(
    `INSERT INTO payslips (run_id, profile_id, basic_salary, housing_allowance, transport_allowance, commission_amount, gross_salary, paye_deduction, pension_employee, pension_employer, nhf_deduction, advance_recovery, other_deductions, total_deductions, net_salary, days_absent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      run_id,
      calc.profileId,
      calc.basicSalary,
      calc.housingAllowance,
      calc.transportAllowance,
      calc.commissionAmount,
      calc.grossSalary,
      calc.paye,
      calc.pensionEmployee,
      calc.pensionEmployer,
      calc.nhf,
      calc.advanceRecovery,
      calc.otherDeductions,
      calc.totalDeductions,
      calc.netSalary,
      calc.daysAbsent,
    ],
  );
}

async function updateRunTotals(
  client,
  {
    run_id,
    totalGross,
    totalNet,
    totalPAYE,
    totalPensionEmployee,
    totalPensionEmployer,
    totalNHF,
  },
) {
  const {
    rows: [updatedRun],
  } = await client.query(
    `UPDATE payroll_runs SET total_gross=$1, total_net=$2, total_paye=$3, total_pension_employee=$4, total_pension_employer=$5, total_nhf=$6, total_deductions=$7 WHERE run_id=$8 RETURNING *`,
    [
      totalGross,
      totalNet,
      totalPAYE,
      totalPensionEmployee,
      totalPensionEmployer,
      totalNHF,
      totalPAYE + totalPensionEmployee + totalNHF,
      run_id,
    ],
  );
  return updatedRun;
}

async function findRunById(client, runId) {
  const {
    rows: [run],
  } = await client.query(
    `SELECT r.*, COUNT(p.payslip_id) AS payslip_count FROM payroll_runs r LEFT JOIN payslips p ON p.run_id = r.run_id WHERE r.run_id = $1 GROUP BY r.run_id`,
    [runId],
  );
  return run || null;
}

async function approveRun(client, { runId, userId }) {
  const {
    rows: [run],
  } = await client.query(
    `UPDATE payroll_runs SET status='approved', approved_by=$1, approved_at=now() WHERE run_id=$2 AND status='draft' RETURNING *`,
    [userId, runId],
  );
  return run || null;
}

// NOTE: getCOAAccount, insertJournalEntry, and insertJournalLine were
// removed in May 14 polish. Payroll journals are now posted through
// the canonical accounting/journal.service.postEntry, which provides:
//   - DR=CR balance validation (with 0.01 tolerance)
//   - fiscal period auto-assignment
//   - consistent entry numbering across all modules
// See modules/payroll/payroll.service.js → postPayrollJournal.

async function markPaid(client, runId) {
  const {
    rows: [run],
  } = await client.query(
    `UPDATE payroll_runs SET status='paid', paid_at=now() WHERE run_id=$1 AND status='approved' RETURNING *`,
    [runId],
  );
  return run || null;
}

async function settleAdvances(client, runId) {
  await client.query(
    `UPDATE cash_advances ca SET outstanding_balance = outstanding_balance - p.advance_recovery, status = CASE WHEN outstanding_balance - p.advance_recovery <= 0 THEN 'settled' ELSE status END FROM payslips p WHERE p.run_id=$1 AND ca.profile_id=p.profile_id AND ca.status='disbursed' AND p.advance_recovery > 0`,
    [runId],
  );
}

async function attachCommissions(client, runId) {
  await client.query(
    `UPDATE commission_earned ce SET payslip_id = p.payslip_id FROM payslips p WHERE p.run_id=$1 AND ce.profile_id=p.profile_id AND ce.payslip_id IS NULL`,
    [runId],
  );
}

async function getPayslips(client, runId) {
  const { rows } = await client.query(
    `SELECT p.payslip_id, p.profile_id, p.gross_salary, p.net_salary, p.paye_deduction, p.pension_employee, p.days_absent, c.display_name, sp.job_title FROM payslips p JOIN shared.staff_profiles sp ON sp.profile_id = p.profile_id JOIN shared.contacts c ON c.contact_id = sp.contact_id WHERE p.run_id = $1 ORDER BY c.display_name`,
    [runId],
  );
  return rows;
}

async function findPayslipById(client, payslipId) {
  const {
    rows: [ps],
  } = await client.query(
    `SELECT p.*, c.display_name, c.email, c.whatsapp_number, sp.job_title, sp.employee_number, sp.bank_name, sp.bank_account_number, r.run_number, r.period_month, r.period_year FROM payslips p JOIN payroll_runs r ON r.run_id = p.run_id JOIN shared.staff_profiles sp ON sp.profile_id = p.profile_id JOIN shared.contacts c ON c.contact_id = sp.contact_id WHERE p.payslip_id = $1`,
    [payslipId],
  );
  return ps || null;
}

async function getUserStaffProfileId(client, userId) {
  const {
    rows: [staffUser],
  } = await client.query(
    `SELECT u.staff_profile_id FROM shared.users u WHERE u.user_id=$1`,
    [userId],
  );
  return staffUser?.staff_profile_id || null;
}

async function listCommissionRules(client) {
  const { rows } = await client.query(
    `SELECT cr.*, sp.profile_id, c.display_name AS staff_name, r.role_name FROM commission_rules cr LEFT JOIN shared.staff_profiles sp ON sp.profile_id = cr.profile_id LEFT JOIN shared.contacts c ON c.contact_id = sp.contact_id LEFT JOIN shared.roles r ON r.role_id = cr.role_id WHERE cr.is_active = true ORDER BY cr.created_at DESC`,
  );
  return rows;
}

async function insertCommissionRule(
  client,
  { profile_id, role_id, rule_type, rate, tiers, applicable_to },
) {
  const {
    rows: [rule],
  } = await client.query(
    `INSERT INTO commission_rules (profile_id, role_id, rule_type, rate, tiers, applicable_to, is_active) VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING *`,
    [
      profile_id || null,
      role_id || null,
      rule_type,
      rate || null,
      tiers ? JSON.stringify(tiers) : null,
      applicable_to || "all",
    ],
  );
  return rule;
}

module.exports = {
  listRuns,
  findExistingRun,
  insertRun,
  getActiveStaff,
  insertPayslip,
  updateRunTotals,
  findRunById,
  approveRun,
  markPaid,
  settleAdvances,
  attachCommissions,
  getPayslips,
  findPayslipById,
  getUserStaffProfileId,
  listCommissionRules,
  insertCommissionRule,
};
