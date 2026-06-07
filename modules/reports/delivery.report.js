"use strict";

const repo = require("./reports.repository");

// ─────────────────────────────────────────────────────────────
// DELIVERY REPORTS
//
//   - performance     line per delivery with timing
//   - by_courier      aggregated per courier (Chowdeck, GIGL, manual)
// ─────────────────────────────────────────────────────────────

async function generate(client, { reportType, startDate, endDate }) {
  switch (reportType) {
    case "performance":
      return generatePerformance(client, { startDate, endDate });
    case "by_courier":
      return generateByCourier(client, { startDate, endDate });
    default:
      throw Object.assign(
        new Error("reportType must be one of: performance, by_courier"),
        { status: 400 },
      );
  }
}

async function generatePerformance(client, { startDate, endDate }) {
  const rows = await repo.getDeliveryPerformance(client, {
    startDate,
    endDate,
  });

  return {
    meta: {
      title: "Delivery Performance",
      subtitle: `${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
      summary: {
        delivery_count: rows.length,
        delivered: rows.filter((r) => r.status === "delivered").length,
        failed: rows.filter((r) => r.status === "failed").length,
      },
    },
    columns: [
      { key: "delivery_number", label: "Delivery", type: "string" },
      { key: "courier", label: "Courier", type: "string" },
      { key: "customer", label: "Customer", type: "string" },
      { key: "status", label: "Status", type: "string" },
      { key: "created_at", label: "Created", type: "datetime" },
      { key: "dispatched_at", label: "Dispatched", type: "datetime" },
      { key: "delivered_at", label: "Delivered", type: "datetime" },
      { key: "hours_in_transit", label: "Hrs", type: "decimal" },
      { key: "delivery_fee", label: "Fee", type: "currency" },
    ],
    rows,
  };
}

async function generateByCourier(client, { startDate, endDate }) {
  const rows = await repo.getDeliveriesByCourier(client, {
    startDate,
    endDate,
  });

  // Add success-rate column.
  const rowsWithRate = rows.map((r) => {
    const total = parseInt(r.total || 0);
    const delivered = parseInt(r.delivered || 0);
    return {
      ...r,
      success_rate_pct:
        total > 0 ? parseFloat(((delivered / total) * 100).toFixed(2)) : 0,
    };
  });

  return {
    meta: {
      title: "Deliveries by Courier",
      subtitle: `${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
      summary: {
        total_deliveries: rows.reduce(
          (sum, r) => sum + parseInt(r.total || 0),
          0,
        ),
        total_fees: rows.reduce(
          (sum, r) => sum + parseFloat(r.total_fees || 0),
          0,
        ),
      },
    },
    columns: [
      { key: "courier", label: "Courier", type: "string" },
      { key: "total", label: "Total", type: "int" },
      { key: "delivered", label: "Delivered", type: "int" },
      { key: "failed", label: "Failed", type: "int" },
      { key: "returned", label: "Returned", type: "int" },
      { key: "success_rate_pct", label: "Success %", type: "percent" },
      { key: "avg_hours_in_transit", label: "Avg Hrs", type: "decimal" },
      { key: "total_fees", label: "Total Fees", type: "currency" },
    ],
    rows: rowsWithRate,
  };
}

module.exports = { generate };
