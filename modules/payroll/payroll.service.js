"use strict";

const { withBusinessContext, nextDocumentNumber } = require("../../config/db");
const { calculatePayslip } = require("./calculator.service");
const { renderToPDF } = require("../../lib/pdf/generator");
const auditService = require("../../shared/audit/audit.service");
const journalService = require("../accounting/journal.service");
const emailSender = require("../../lib/email/sender");
const whatsapp = require("../../integrations/messaging/adapters/whatsapp");
const logger = require("../../config/logger");
const repo = require("./payroll.repository");

async function listRuns(business, { page = 1, limit = 24, status } = {}) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    return {
      data: await repo.listRuns(client, {
        status,
        limit: parseInt(limit),
        offset,
      }),
    };
  });
}

async function initiateRun(business, { period_month, period_year }, user) {
  return withBusinessContext(business, async (client) => {
    const existing = await repo.findExistingRun(client, {
      period_month,
      period_year,
    });
    if (existing.length)
      throw Object.assign(
        new Error(
          `Payroll run already exists for ${period_month}/${period_year}`,
        ),
        { status: 409 },
      );

    const runNumber = await nextDocumentNumber(client, business, "payroll_run");
    const run = await repo.insertRun(client, {
      runNumber,
      period_month,
      period_year,
      userId: user.user_id,
    });

    const staff = await repo.getActiveStaff(client, business);
    if (!staff.length)
      return { ...run, message: "Run created — no active staff found" };

    let totalGross = 0,
      totalNet = 0,
      totalPAYE = 0,
      totalPensionEmployee = 0,
      totalPensionEmployer = 0,
      totalNHF = 0;

    for (const s of staff) {
      try {
        const calc = await calculatePayslip(
          business,
          s.profile_id,
          period_month,
          period_year,
          client,
        );
        await repo.insertPayslip(client, { run_id: run.run_id, calc });
        totalGross += calc.grossSalary;
        totalNet += calc.netSalary;
        totalPAYE += calc.paye;
        totalPensionEmployee += calc.pensionEmployee;
        totalPensionEmployer += calc.pensionEmployer;
        totalNHF += calc.nhf;
      } catch (err) {
        logger.error(
          `Payslip calculation failed for profile ${s.profile_id}`,
          err,
        );
      }
    }

    const updatedRun = await repo.updateRunTotals(client, {
      run_id: run.run_id,
      totalGross,
      totalNet,
      totalPAYE,
      totalPensionEmployee,
      totalPensionEmployer,
      totalNHF,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: "staff",
      business,
      module: "payroll",
      action: "create",
      table: "payroll_runs",
      recordId: run.run_id,
      after: updatedRun,
    });
    return updatedRun;
  });
}

async function getRun(business, runId) {
  return withBusinessContext(business, async (client) => {
    const run = await repo.findRunById(client, runId);
    if (!run)
      throw Object.assign(new Error("Payroll run not found"), { status: 404 });
    return run;
  });
}

async function approveRun(business, runId, user) {
  return withBusinessContext(business, async (client) => {
    const run = await repo.approveRun(client, { runId, userId: user.user_id });
    if (!run)
      throw Object.assign(new Error("Run not found or not in draft"), {
        status: 400,
      });

    await postPayrollJournal(client, business, runId, run);

    await auditService.log(client, {
      userId: user.user_id,
      userName: "staff",
      business,
      module: "payroll",
      action: "approve",
      table: "payroll_runs",
      recordId: runId,
      after: run,
    });
    return run;
  });
}

async function postPayrollJournal(client, business, runId, run) {
  // Resolve account IDs via journalService.getAccountId — falls back to
  // null silently for missing codes; we filter null-account lines below.
  const codeMap = {
    salaries: "6110", // Salaries & Wages expense
    pension_employer: "6120", // Employer Pension expense
    paye: "2310", // PAYE Payable (liability)
    pension: "2320", // Pension Payable (liability)
    nhf: "2330", // NHF Payable (liability)
    bank: "1210", // Bank account (asset) — net cash going out
  };
  const accounts = {};
  for (const [key, code] of Object.entries(codeMap)) {
    accounts[key] = await journalService.getAccountId(client, code);
  }

  // Refuse silently if the COA is mis-seeded — the salary/bank pair is
  // the minimum we need to produce a balanced entry.
  if (!accounts.salaries || !accounts.bank) return;

  // ── Main payroll journal ────────────────────────────────────────
  // DR Salaries (gross)
  //   CR PAYE Payable
  //   CR Pension Payable (employee portion)
  //   CR NHF Payable
  //   CR Bank (net to staff)
  //
  // Lines with both debit=0 and credit=0 OR missing account_id are
  // filtered out so a business that doesn't run NHF (etc.) still
  // produces a balanced entry.
  const mainLines = [
    { account_id: accounts.salaries, debit: run.total_gross, credit: 0 },
    { account_id: accounts.paye, debit: 0, credit: run.total_paye },
    {
      account_id: accounts.pension,
      debit: 0,
      credit: run.total_pension_employee,
    },
    { account_id: accounts.nhf, debit: 0, credit: run.total_nhf },
    { account_id: accounts.bank, debit: 0, credit: run.total_net },
  ].filter((l) => l.account_id && (l.debit > 0 || l.credit > 0));

  await journalService.postEntry(client, {
    description: `Payroll Run ${run.run_number} — ${run.period_month}/${run.period_year}`,
    referenceType: "payroll_run",
    referenceId: runId,
    postedBy: run.approved_by,
    lines: mainLines,
  });

  // ── Employer pension journal (separate entry) ──────────────────
  // The employer's 10% pension contribution is an expense to the
  // business, posted separately so the main payroll entry stays a
  // clean "what staff earned vs what staff received" picture.
  //
  // DR Employer Pension Expense
  //   CR Pension Payable
  if (
    accounts.pension_employer &&
    accounts.pension &&
    run.total_pension_employer > 0
  ) {
    await journalService.postEntry(client, {
      description: `Employer Pension — ${run.run_number}`,
      referenceType: "payroll_run",
      referenceId: runId,
      postedBy: run.approved_by,
      lines: [
        {
          account_id: accounts.pension_employer,
          debit: run.total_pension_employer,
          credit: 0,
        },
        {
          account_id: accounts.pension,
          debit: 0,
          credit: run.total_pension_employer,
        },
      ],
    });
  }
}

async function markPaid(business, runId, user) {
  return withBusinessContext(business, async (client) => {
    const run = await repo.markPaid(client, runId);
    if (!run)
      throw Object.assign(
        new Error("Run must be approved before marking paid"),
        { status: 400 },
      );
    await repo.settleAdvances(client, runId);
    await repo.attachCommissions(client, runId);
    return run;
  });
}

async function getPayslips(business, runId) {
  return withBusinessContext(business, async (client) => {
    return { data: await repo.getPayslips(client, runId) };
  });
}

async function getPayslip(business, payslipId, user) {
  return withBusinessContext(business, async (client) => {
    const ps = await repo.findPayslipById(client, payslipId);
    if (!ps)
      throw Object.assign(new Error("Payslip not found"), { status: 404 });

    if (user.permissionScope === "own") {
      const staffProfileId = await repo.getUserStaffProfileId(
        client,
        user.user_id,
      );
      if (staffProfileId !== ps.profile_id)
        throw Object.assign(new Error("Access denied"), { status: 403 });
    }
    return ps;
  });
}

function buildPayslipTemplateData(payslip) {
  const fmtAmt = (n) =>
    `NGN ${Number(n || 0).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const esc = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const periodLabel = `${monthName(payslip.period_month)} ${payslip.period_year}`;

  return {
    run_number: esc(payslip.run_number || "—"),
    period_label: esc(periodLabel),
    display_name: esc(payslip.display_name || "—"),
    job_title: esc(payslip.job_title || "—"),
    employee_number: esc(payslip.employee_number || "—"),
    bank_name: esc(payslip.bank_name || "—"),
    bank_account_number: esc(payslip.bank_account_number || "—"),
    basic_salary: fmtAmt(payslip.basic_salary),
    housing_allowance: fmtAmt(payslip.housing_allowance),
    transport_allowance: fmtAmt(payslip.transport_allowance),
    commission_amount: fmtAmt(payslip.commission_amount),
    gross_salary: fmtAmt(payslip.gross_salary),
    paye_deduction: fmtAmt(payslip.paye_deduction),
    pension_employee: fmtAmt(payslip.pension_employee),
    nhf_deduction: fmtAmt(payslip.nhf_deduction),
    advance_recovery: fmtAmt(payslip.advance_recovery),
    other_deductions: fmtAmt(payslip.other_deductions),
    total_deductions: fmtAmt(payslip.total_deductions),
    net_salary: fmtAmt(payslip.net_salary),
    days_absent: String(payslip.days_absent || 0),
    // Conditional rows
    commission_row_style:
      Number(payslip.commission_amount || 0) > 0 ? "" : "display:none",
    advance_row_style:
      Number(payslip.advance_recovery || 0) > 0 ? "" : "display:none",
    other_deductions_style:
      Number(payslip.other_deductions || 0) > 0 ? "" : "display:none",
  };
}

async function generatePayslipPDF(business, payslipId, user) {
  const payslip = await getPayslip(business, payslipId, user);
  return renderToPDF("payslips", buildPayslipTemplateData(payslip));
}

async function listCommissionRules(business) {
  return withBusinessContext(business, async (client) => {
    return { data: await repo.listCommissionRules(client) };
  });
}

async function createCommissionRule(business, data, user) {
  return withBusinessContext(business, async (client) => {
    return repo.insertCommissionRule(client, {
      profile_id: data.profile_id,
      role_id: data.role_id,
      rule_type: data.rule_type,
      rate: data.rate,
      tiers: data.tiers,
      applicable_to: data.applicable_to,
    });
  });
}

function monthName(m) {
  return [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][(parseInt(m) || 1) - 1];
}

function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header, rows) {
  return [header.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join(
    "\n",
  );
}

// PAYE schedule — TIN lives on contacts.tin in this schema.
async function generatePayeSchedule(business, runId) {
  return withBusinessContext(business, async (client) => {
    const { rows } = await client.query(
      `SELECT c.display_name, c.tin, sp.employee_number,
              p.gross_salary, p.paye_deduction,
              p.pension_employee, p.nhf_deduction
       FROM payslips p
       JOIN shared.staff_profiles sp ON sp.profile_id = p.profile_id
       JOIN shared.contacts c ON c.contact_id = sp.contact_id
       WHERE p.run_id = $1 ORDER BY c.display_name`,
      [runId],
    );
    return toCsv(
      ["Name", "TIN", "Employee No", "Gross Salary", "PAYE", "Pension", "NHF"],
      rows.map((r) => [
        r.display_name,
        r.tin || "",
        r.employee_number || "",
        r.gross_salary,
        r.paye_deduction,
        r.pension_employee,
        r.nhf_deduction,
      ]),
    );
  });
}

// PENCOM file — pension_pin on staff_profiles (no separate PFA name column).
async function generatePencomFile(business, runId) {
  return withBusinessContext(business, async (client) => {
    const { rows } = await client.query(
      `SELECT c.display_name, sp.pension_pin,
              p.pension_employee, p.pension_employer
       FROM payslips p
       JOIN shared.staff_profiles sp ON sp.profile_id = p.profile_id
       JOIN shared.contacts c ON c.contact_id = sp.contact_id
       WHERE p.run_id = $1 ORDER BY c.display_name`,
      [runId],
    );
    return toCsv(
      ["Name", "RSA PIN", "Employee Pension", "Employer Pension", "Total"],
      rows.map((r) => [
        r.display_name,
        r.pension_pin || "",
        r.pension_employee,
        r.pension_employer,
        (
          parseFloat(r.pension_employee) + parseFloat(r.pension_employer)
        ).toFixed(2),
      ]),
    );
  });
}

// NHF schedule.
async function generateNhfSchedule(business, runId) {
  return withBusinessContext(business, async (client) => {
    const { rows } = await client.query(
      `SELECT c.display_name, sp.nhf_number, sp.employee_number, p.nhf_deduction
       FROM payslips p
       JOIN shared.staff_profiles sp ON sp.profile_id = p.profile_id
       JOIN shared.contacts c ON c.contact_id = sp.contact_id
       WHERE p.run_id = $1 ORDER BY c.display_name`,
      [runId],
    );
    return toCsv(
      ["Name", "NHF Number", "Employee No", "NHF Contribution"],
      rows.map((r) => [
        r.display_name,
        r.nhf_number || "",
        r.employee_number || "",
        r.nhf_deduction,
      ]),
    );
  });
}

// Bulk bank payment schedule.
async function generatePaymentSchedule(business, runId) {
  return withBusinessContext(business, async (client) => {
    const { rows } = await client.query(
      `SELECT c.display_name, sp.bank_name, sp.bank_account_number,
              sp.bank_sort_code, p.net_salary
       FROM payslips p
       JOIN shared.staff_profiles sp ON sp.profile_id = p.profile_id
       JOIN shared.contacts c ON c.contact_id = sp.contact_id
       WHERE p.run_id = $1 ORDER BY c.display_name`,
      [runId],
    );
    return toCsv(
      ["Name", "Bank", "Account Number", "Sort Code", "Net Salary"],
      rows.map((r) => [
        r.display_name,
        r.bank_name || "",
        r.bank_account_number || "",
        r.bank_sort_code || "",
        r.net_salary,
      ]),
    );
  });
}

// Deliver a payslip by email and/or WhatsApp.
async function sendPayslip(business, payslipId, { channel = "email" }, user) {
  const payslip = await getPayslip(business, payslipId, user);
  const pdf = await renderToPDF("payslips", buildPayslipTemplateData(payslip));

  const results = {};
  if (["email", "both"].includes(channel) && payslip.email) {
    await emailSender.sendWithAttachment({
      to: payslip.email,
      subject: `Your Payslip — ${monthName(payslip.period_month)} ${payslip.period_year}`,
      html: `<p>Dear ${payslip.display_name},</p><p>Please find your payslip attached.</p>`,
      filename: `payslip-${payslip.run_number}.pdf`,
      pdfBuffer: pdf,
    });
    results.email = "sent";
  }
  if (["whatsapp", "both"].includes(channel) && payslip.whatsapp_number) {
    await whatsapp.sendMessage({
      to: payslip.whatsapp_number,
      text: `Your payslip for ${monthName(payslip.period_month)} ${payslip.period_year} is ready. Net pay: ₦${Number(payslip.net_salary).toLocaleString()}. Please check your email for the full payslip PDF.`,
    });
    results.whatsapp = "sent";
  }
  if (!Object.keys(results).length) {
    throw Object.assign(
      new Error("No delivery channel available for this payslip"),
      { status: 400 },
    );
  }
  return results;
}

module.exports = {
  listRuns,
  initiateRun,
  getRun,
  approveRun,
  markPaid,
  getPayslips,
  getPayslip,
  generatePayslipPDF,
  listCommissionRules,
  createCommissionRule,
  generatePayeSchedule,
  generatePencomFile,
  generateNhfSchedule,
  generatePaymentSchedule,
  sendPayslip,
};
