"use strict";

const repo = require("./accounting.repository");

function getPeriodDates(query) {
  const now = new Date();
  const sd = query.start_date || `${now.getFullYear()}-01-01`;
  const ed = query.end_date || `${now.getFullYear()}-12-31`;
  return { startDate: sd, endDate: ed };
}

async function profitAndLoss(client, query) {
  const { startDate, endDate } = getPeriodDates(query);
  const rows = await repo.getPLData(client, { startDate, endDate });
  const income = rows.filter((r) => r.account_type === "income");
  const expenses = rows.filter((r) => r.account_type === "expense");
  return {
    period: { startDate, endDate },
    income,
    expenses,
    total_income: income.reduce((s, r) => s + parseFloat(r.balance), 0),
    total_expenses: expenses.reduce((s, r) => s + parseFloat(r.balance), 0),
    net_profit:
      income.reduce((s, r) => s + parseFloat(r.balance), 0) -
      expenses.reduce((s, r) => s + parseFloat(r.balance), 0),
  };
}

async function balanceSheet(client, query) {
  const asOfDate = query.as_of_date || new Date().toISOString().split("T")[0];
  const rows = await repo.getBalanceSheetData(client, { asOfDate });
  const assets = rows.filter((r) => r.account_type === "asset");
  const liabilities = rows.filter((r) => r.account_type === "liability");
  const equity = rows.filter((r) => r.account_type === "equity");
  return {
    as_of_date: asOfDate,
    assets,
    liabilities,
    equity,
    total_assets: assets.reduce((s, r) => s + parseFloat(r.balance), 0),
    total_liabilities: liabilities.reduce(
      (s, r) => s + parseFloat(r.balance),
      0,
    ),
    total_equity: equity.reduce((s, r) => s + parseFloat(r.balance), 0),
  };
}

async function trialBalance(client, query) {
  const { startDate, endDate } = getPeriodDates(query);
  const rows = await repo.getTrialBalanceData(client, { startDate, endDate });
  return { period: { startDate, endDate }, data: rows };
}

async function cashFlow(client, query) {
  const { startDate, endDate } = getPeriodDates(query);
  const { opening_cash, items } = await repo.getCashFlowData(client, {
    startDate,
    endDate,
  });
  const bucket = (cat) =>
    items
      .filter((i) => i.category === cat)
      .map((i) => ({ label: i.label, amount: parseFloat(i.amount) || 0 }));
  const operating = bucket("operating");
  const investing = bucket("investing");
  const financing = bucket("financing");
  const sum = (arr) => arr.reduce((s, i) => s + i.amount, 0);
  const net_operating = sum(operating);
  const net_investing = sum(investing);
  const net_financing = sum(financing);
  const net_cash_movement = net_operating + net_investing + net_financing;
  const opening = parseFloat(opening_cash) || 0;
  return {
    period_start: startDate,
    period_end: endDate,
    operating_activities: operating,
    investing_activities: investing,
    financing_activities: financing,
    net_operating,
    net_investing,
    net_financing,
    net_cash_movement,
    opening_cash: opening,
    closing_cash: opening + net_cash_movement,
  };
}

module.exports = { profitAndLoss, balanceSheet, trialBalance, cashFlow };
