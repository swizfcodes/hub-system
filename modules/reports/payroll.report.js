"use strict";

const repo = require("./reports.repository");

// ─────────────────────────────────────────────────────────────
// PAYROLL REPORTS
//
//   - summary      one row per payroll run in the period
//   - staff_detail one row per staff member for a specific payroll
//
// These are sensitive — caller must enforce payroll:view permission
// AND the audit logger must record every access. That happens in
// reports.service.
// ─────────────────────────────────────────────────────────────

async function generate(client, { reportType, startDate, endDate, payrollId }) {
  switch (reportType) {
    case "summary":
      return generateSummary(client, { startDate, endDate });
    case "staff_detail":
      return generateStaffDetail(client, { payrollId });
    default:
      throw Object.assign(
        new Error("reportType must be one of: summary, staff_detail"),
        { status: 400 },
      );
  }
}

async function generateSummary(client, { startDate, endDate }) {
  const rows = await repo.getPayrollSummary(client, { startDate, endDate });

  const totals = rows.reduce(
    (acc, r) => ({
      staff_count: acc.staff_count + parseInt(r.staff_count || 0),
      total_gross: acc.total_gross + parseFloat(r.total_gross || 0),
      total_paye: acc.total_paye + parseFloat(r.total_paye || 0),
      total_pension: acc.total_pension + parseFloat(r.total_pension || 0),
      total_nhf: acc.total_nhf + parseFloat(r.total_nhf || 0),
      total_net: acc.total_net + parseFloat(r.total_net || 0),
    }),
    {
      staff_count: 0,
      total_gross: 0,
      total_paye: 0,
      total_pension: 0,
      total_nhf: 0,
      total_net: 0,
    },
  );

  return {
    meta: {
      title: "Payroll Summary",
      subtitle: `${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
      totals,
      sensitive: true,
    },
    columns: [
      { key: "period_start", label: "Period Start", type: "date" },
      { key: "period_end", label: "Period End", type: "date" },
      { key: "status", label: "Status", type: "string" },
      { key: "staff_count", label: "Staff", type: "int" },
      { key: "total_gross", label: "Gross", type: "currency" },
      { key: "total_paye", label: "PAYE", type: "currency" },
      { key: "total_pension", label: "Pension", type: "currency" },
      { key: "total_nhf", label: "NHF", type: "currency" },
      { key: "total_net", label: "Net", type: "currency" },
    ],
    rows,
  };
}

async function generateStaffDetail(client, { payrollId }) {
  if (!payrollId) {
    throw Object.assign(new Error("payrollId is required"), { status: 400 });
  }
  const rows = await repo.getStaffPayrollDetail(client, { payrollId });

  const totals = rows.reduce(
    (acc, r) => ({
      gross_pay: acc.gross_pay + parseFloat(r.gross_pay || 0),
      paye: acc.paye + parseFloat(r.paye || 0),
      net_pay: acc.net_pay + parseFloat(r.net_pay || 0),
    }),
    { gross_pay: 0, paye: 0, net_pay: 0 },
  );

  return {
    meta: {
      title: "Staff Payroll Detail",
      subtitle: `Payroll ID: ${payrollId}`,
      generatedAt: new Date().toISOString(),
      totals,
      sensitive: true,
    },
    columns: [
      { key: "employee_number", label: "Emp #", type: "string" },
      { key: "staff_name", label: "Name", type: "string" },
      { key: "job_title", label: "Title", type: "string" },
      { key: "department", label: "Department", type: "string" },
      { key: "gross_pay", label: "Gross", type: "currency" },
      { key: "allowances", label: "Allowances", type: "currency" },
      { key: "paye", label: "PAYE", type: "currency" },
      { key: "pension_employee", label: "Pension", type: "currency" },
      { key: "nhf", label: "NHF", type: "currency" },
      { key: "other_deductions", label: "Other Deductions", type: "currency" },
      { key: "net_pay", label: "Net", type: "currency" },
    ],
    rows,
  };
}

module.exports = { generate };
