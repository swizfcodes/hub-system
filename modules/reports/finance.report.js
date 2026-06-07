"use strict";

const repo = require("./reports.repository");

// ─────────────────────────────────────────────────────────────
// FINANCE REPORTS
//
// Sub-reports:
//   - profit_and_loss     income, expenses, net for a period
//   - outstanding_invoices  unpaid + overdue ageing
//   - expenses_by_category  spend breakdown
// ─────────────────────────────────────────────────────────────

async function generate(client, { reportType, startDate, endDate, asOfDate }) {
  switch (reportType) {
    case "profit_and_loss":
      return generatePnL(client, { startDate, endDate });
    case "outstanding_invoices":
      return generateOutstanding(client, {
        asOfDate: asOfDate || new Date().toISOString().slice(0, 10),
      });
    case "expenses_by_category":
      return generateExpensesByCategory(client, { startDate, endDate });
    default:
      throw Object.assign(
        new Error(
          "reportType must be one of: profit_and_loss, outstanding_invoices, expenses_by_category",
        ),
        { status: 400 },
      );
  }
}

async function generatePnL(client, { startDate, endDate }) {
  const pnl = await repo.getProfitAndLoss(client, { startDate, endDate });
  const income = parseFloat(pnl.income || 0);
  const expense = parseFloat(pnl.expense || 0);
  const netProfit = parseFloat(pnl.net_profit || 0);
  const marginPct = income > 0 ? (netProfit / income) * 100 : 0;

  return {
    meta: {
      title: "Profit & Loss",
      subtitle: `${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
      summary: {
        income,
        expense,
        net_profit: netProfit,
        margin_pct: parseFloat(marginPct.toFixed(2)),
      },
    },
    columns: [
      { key: "label", label: "Line", type: "string" },
      { key: "amount", label: "Amount", type: "currency" },
    ],
    rows: [
      { label: "Total income", amount: income },
      { label: "Total expense", amount: expense },
      { label: "Net profit", amount: netProfit },
    ],
  };
}

async function generateOutstanding(client, { asOfDate }) {
  const rows = await repo.getOutstandingInvoices(client, { asOfDate });

  // Bucket the ageing.
  const ageing = {
    current: 0,
    "1-30": 0,
    "31-60": 0,
    "61-90": 0,
    "90+": 0,
  };
  for (const r of rows) {
    const days = parseInt(r.days_overdue || 0);
    const amount = parseFloat(r.amount_outstanding || 0);
    if (days <= 0) ageing.current += amount;
    else if (days <= 30) ageing["1-30"] += amount;
    else if (days <= 60) ageing["31-60"] += amount;
    else if (days <= 90) ageing["61-90"] += amount;
    else ageing["90+"] += amount;
  }

  const totalOutstanding = Object.values(ageing).reduce((a, b) => a + b, 0);

  return {
    meta: {
      title: "Outstanding Invoices",
      subtitle: `As of ${asOfDate}`,
      generatedAt: new Date().toISOString(),
      summary: {
        invoice_count: rows.length,
        total_outstanding: totalOutstanding,
        ageing,
      },
    },
    columns: [
      { key: "invoice_number", label: "Invoice", type: "string" },
      { key: "customer", label: "Customer", type: "string" },
      { key: "invoice_date", label: "Date", type: "date" },
      { key: "due_date", label: "Due", type: "date" },
      { key: "total_amount", label: "Total", type: "currency" },
      { key: "amount_paid", label: "Paid", type: "currency" },
      { key: "amount_outstanding", label: "Outstanding", type: "currency" },
      { key: "days_overdue", label: "Days Overdue", type: "int" },
      { key: "status", label: "Status", type: "string" },
    ],
    rows,
  };
}

async function generateExpensesByCategory(client, { startDate, endDate }) {
  const rows = await repo.getExpensesByCategory(client, {
    startDate,
    endDate,
  });
  const total = rows.reduce((sum, r) => sum + parseFloat(r.total || 0), 0);

  // Add percentage column.
  const rowsWithPct = rows.map((r) => ({
    ...r,
    pct_of_total:
      total > 0
        ? parseFloat(((parseFloat(r.total) / total) * 100).toFixed(2))
        : 0,
  }));

  return {
    meta: {
      title: "Expenses by Category",
      subtitle: `${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
      summary: { total_expenses: total, category_count: rows.length },
    },
    columns: [
      { key: "category", label: "Category", type: "string" },
      { key: "expense_count", label: "Count", type: "int" },
      { key: "total", label: "Total", type: "currency" },
      { key: "pct_of_total", label: "% of Total", type: "percent" },
    ],
    rows: rowsWithPct,
  };
}

module.exports = { generate };
