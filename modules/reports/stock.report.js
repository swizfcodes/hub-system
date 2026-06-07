"use strict";

const repo = require("./reports.repository");

// ─────────────────────────────────────────────────────────────
// STOCK REPORTS
//
//   - valuation    cost + retail value per SKU (Balance Sheet inventory)
//   - movements    transaction log for a date range
//   - low_stock    items at or below reorder level
// ─────────────────────────────────────────────────────────────

async function generate(
  client,
  { reportType, startDate, endDate, productId, movementType },
) {
  switch (reportType) {
    case "valuation":
      return generateValuation(client);
    case "movements":
      return generateMovements(client, {
        startDate,
        endDate,
        productId,
        movementType,
      });
    case "low_stock":
      return generateLowStock(client);
    default:
      throw Object.assign(
        new Error("reportType must be one of: valuation, movements, low_stock"),
        { status: 400 },
      );
  }
}

async function generateValuation(client) {
  const rows = await repo.getStockValuation(client);
  const totals = rows.reduce(
    (acc, r) => ({
      current_qty: acc.current_qty + parseInt(r.current_qty || 0),
      cost_value: acc.cost_value + parseFloat(r.cost_value || 0),
      retail_value: acc.retail_value + parseFloat(r.retail_value || 0),
    }),
    { current_qty: 0, cost_value: 0, retail_value: 0 },
  );
  const unrealisedMargin = totals.retail_value - totals.cost_value;
  const marginPct =
    totals.retail_value > 0
      ? (unrealisedMargin / totals.retail_value) * 100
      : 0;

  return {
    meta: {
      title: "Stock Valuation",
      subtitle: `As of ${new Date().toISOString().slice(0, 10)}`,
      generatedAt: new Date().toISOString(),
      summary: {
        ...totals,
        unrealised_margin: unrealisedMargin,
        margin_pct: parseFloat(marginPct.toFixed(2)),
        sku_count: rows.length,
      },
    },
    columns: [
      { key: "sku", label: "SKU", type: "string" },
      { key: "name", label: "Product", type: "string" },
      { key: "category", label: "Category", type: "string" },
      { key: "current_qty", label: "Qty", type: "int" },
      { key: "unit_cost", label: "Unit Cost", type: "currency" },
      { key: "cost_value", label: "Cost Value", type: "currency" },
      { key: "retail_value", label: "Retail Value", type: "currency" },
    ],
    rows,
  };
}

async function generateMovements(
  client,
  { startDate, endDate, productId, movementType },
) {
  const rows = await repo.getStockMovements(client, {
    startDate,
    endDate,
    productId,
    movementType,
  });

  return {
    meta: {
      title: "Stock Movements",
      subtitle: `${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
      summary: { movement_count: rows.length },
    },
    columns: [
      { key: "performed_at", label: "Timestamp", type: "datetime" },
      { key: "sku", label: "SKU", type: "string" },
      { key: "product_name", label: "Product", type: "string" },
      { key: "movement_type", label: "Type", type: "string" },
      { key: "quantity", label: "Qty", type: "int" },
      { key: "direction", label: "Dir", type: "int" },
      { key: "unit_cost", label: "Unit Cost", type: "currency" },
      { key: "reference_type", label: "Reference", type: "string" },
      { key: "performed_by_email", label: "By", type: "string" },
      { key: "notes", label: "Notes", type: "string" },
    ],
    rows,
  };
}

async function generateLowStock(client) {
  const rows = await repo.getLowStockItems(client);
  return {
    meta: {
      title: "Low Stock Items",
      subtitle: `As of ${new Date().toISOString().slice(0, 10)}`,
      generatedAt: new Date().toISOString(),
      summary: { item_count: rows.length },
    },
    columns: [
      { key: "sku", label: "SKU", type: "string" },
      { key: "name", label: "Product", type: "string" },
      { key: "category", label: "Category", type: "string" },
      { key: "current_qty", label: "Current", type: "int" },
      { key: "reorder_level", label: "Reorder Level", type: "int" },
    ],
    rows,
  };
}

module.exports = { generate };
