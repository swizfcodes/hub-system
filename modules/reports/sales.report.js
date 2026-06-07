"use strict";

const repo = require("./reports.repository");

// ─────────────────────────────────────────────────────────────
// SALES REPORTS
//
// Three sub-reports:
//   - by_period   line per day/week/month
//   - by_product  line per SKU, sorted by revenue
//   - by_customer line per buyer, sorted by total spend
//
// Each fetches via reports.repository and returns:
//   - meta:    title, date range, totals row
//   - columns: ordered display columns for the formatter
//   - rows:    raw data rows
//
// The reports.service uses this shape to render PDF or Excel.
// ─────────────────────────────────────────────────────────────

async function generate(
  client,
  { reportType, startDate, endDate, groupBy, limit },
) {
  switch (reportType) {
    case "by_period":
      return generateByPeriod(client, { startDate, endDate, groupBy });
    case "by_product":
      return generateByProduct(client, { startDate, endDate, limit });
    case "by_customer":
      return generateByCustomer(client, { startDate, endDate, limit });
    default:
      throw Object.assign(
        new Error(
          "reportType must be one of: by_period, by_product, by_customer",
        ),
        { status: 400 },
      );
  }
}

async function generateByPeriod(
  client,
  { startDate, endDate, groupBy = "day" },
) {
  const rows = await repo.getSalesByPeriod(client, {
    startDate,
    endDate,
    groupBy,
  });

  const totals = rows.reduce(
    (acc, r) => ({
      invoice_count: acc.invoice_count + parseInt(r.invoice_count || 0),
      subtotal: acc.subtotal + parseFloat(r.subtotal || 0),
      tax: acc.tax + parseFloat(r.tax || 0),
      total: acc.total + parseFloat(r.total || 0),
    }),
    { invoice_count: 0, subtotal: 0, tax: 0, total: 0 },
  );

  return {
    meta: {
      title: `Sales by ${groupBy}`,
      subtitle: `${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
      totals,
    },
    columns: [
      { key: "period", label: "Period", type: "date" },
      { key: "invoice_count", label: "Invoices", type: "int" },
      { key: "customer_count", label: "Customers", type: "int" },
      { key: "subtotal", label: "Subtotal", type: "currency" },
      { key: "tax", label: "Tax", type: "currency" },
      { key: "total", label: "Total", type: "currency" },
    ],
    rows,
  };
}

async function generateByProduct(client, { startDate, endDate, limit = 100 }) {
  const rows = await repo.getSalesByProduct(client, {
    startDate,
    endDate,
    limit,
  });

  const totals = rows.reduce(
    (acc, r) => ({
      units_sold: acc.units_sold + parseInt(r.units_sold || 0),
      revenue: acc.revenue + parseFloat(r.revenue || 0),
    }),
    { units_sold: 0, revenue: 0 },
  );

  return {
    meta: {
      title: "Sales by Product",
      subtitle: `${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
      totals,
    },
    columns: [
      { key: "sku", label: "SKU", type: "string" },
      { key: "product_name", label: "Product", type: "string" },
      { key: "category_name", label: "Category", type: "string" },
      { key: "units_sold", label: "Units", type: "int" },
      { key: "avg_unit_price", label: "Avg Price", type: "currency" },
      { key: "revenue", label: "Revenue", type: "currency" },
    ],
    rows,
  };
}

async function generateByCustomer(client, { startDate, endDate, limit = 100 }) {
  const rows = await repo.getSalesByCustomer(client, {
    startDate,
    endDate,
    limit,
  });

  const totals = rows.reduce(
    (acc, r) => ({
      invoice_count: acc.invoice_count + parseInt(r.invoice_count || 0),
      total_spend: acc.total_spend + parseFloat(r.total_spend || 0),
    }),
    { invoice_count: 0, total_spend: 0 },
  );

  return {
    meta: {
      title: "Sales by Customer",
      subtitle: `${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
      totals,
    },
    columns: [
      { key: "display_name", label: "Customer", type: "string" },
      { key: "priority_level", label: "Tier", type: "string" },
      { key: "invoice_count", label: "Invoices", type: "int" },
      { key: "total_spend", label: "Total Spend", type: "currency" },
    ],
    rows,
  };
}

module.exports = { generate };
