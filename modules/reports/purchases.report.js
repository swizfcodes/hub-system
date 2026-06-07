"use strict";

// Purchases report family — supplier spend, expense categories, PO periods.

async function generate(client, { reportType, startDate, endDate }) {
  switch (reportType) {
    case "by_supplier":
      return generateBySupplier(client, { startDate, endDate });
    case "by_category":
      return generateByCategory(client, { startDate, endDate });
    case "by_period":
      return generateByPeriod(client, { startDate, endDate });
    default:
      throw Object.assign(
        new Error("reportType must be: by_supplier, by_category, by_period"),
        { status: 400 },
      );
  }
}

async function generateBySupplier(client, { startDate, endDate }) {
  const { rows } = await client.query(
    `SELECT c.display_name AS supplier_name, c.contact_id,
            COUNT(si.sup_invoice_id) AS invoice_count,
            COALESCE(SUM(si.amount), 0)::NUMERIC AS total_spend,
            COALESCE(SUM(si.amount_paid), 0)::NUMERIC AS amount_paid,
            COALESCE(SUM(si.amount - si.amount_paid), 0)::NUMERIC AS outstanding
     FROM supplier_invoices si
     JOIN shared.contacts c ON c.contact_id = si.supplier_id
     WHERE si.invoice_date BETWEEN $1 AND $2
     GROUP BY c.contact_id, c.display_name
     ORDER BY total_spend DESC`,
    [startDate, endDate],
  );
  const total = rows.reduce((s, r) => s + parseFloat(r.total_spend || 0), 0);
  return {
    meta: {
      title: "Purchases by Supplier",
      subtitle: `${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
      summary: { total_spend: total, supplier_count: rows.length },
    },
    columns: [
      { key: "supplier_name", label: "Supplier", type: "string" },
      { key: "invoice_count", label: "Invoices", type: "int" },
      { key: "total_spend", label: "Total Spend", type: "currency" },
      { key: "amount_paid", label: "Paid", type: "currency" },
      { key: "outstanding", label: "Outstanding", type: "currency" },
    ],
    rows,
  };
}

async function generateByCategory(client, { startDate, endDate }) {
  const { rows } = await client.query(
    `SELECT e.category,
            COUNT(*) AS expense_count,
            COALESCE(SUM(e.amount), 0)::NUMERIC AS total,
            ROUND(COALESCE(SUM(e.amount), 0) * 100.0 /
              NULLIF(SUM(SUM(e.amount)) OVER (), 0), 2) AS pct_of_total
     FROM expenses e
     WHERE e.expense_date BETWEEN $1 AND $2
     GROUP BY e.category
     ORDER BY total DESC`,
    [startDate, endDate],
  );
  const total = rows.reduce((s, r) => s + parseFloat(r.total || 0), 0);
  return {
    meta: {
      title: "Purchases by Category",
      subtitle: `${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
      summary: { total_spend: total },
    },
    columns: [
      { key: "category", label: "Category", type: "string" },
      { key: "expense_count", label: "Count", type: "int" },
      { key: "total", label: "Total", type: "currency" },
      { key: "pct_of_total", label: "% of Total", type: "percent" },
    ],
    rows,
  };
}

async function generateByPeriod(client, { startDate, endDate }) {
  const { rows } = await client.query(
    `SELECT DATE_TRUNC('month', po.order_date)::DATE AS period,
            COUNT(po.po_id) AS po_count,
            COALESCE(SUM(po.total_amount), 0)::NUMERIC AS total_amount,
            COUNT(po.po_id) FILTER (WHERE po.status = 'received') AS received
     FROM purchase_orders po
     WHERE po.order_date BETWEEN $1 AND $2
       AND po.is_deleted = false
     GROUP BY 1 ORDER BY 1`,
    [startDate, endDate],
  );
  return {
    meta: {
      title: "Purchases by Period",
      subtitle: `${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
      summary: {
        total: rows.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0),
      },
    },
    columns: [
      { key: "period", label: "Period", type: "date" },
      { key: "po_count", label: "POs", type: "int" },
      { key: "total_amount", label: "Amount", type: "currency" },
      { key: "received", label: "Received", type: "int" },
    ],
    rows,
  };
}

module.exports = { generate };
