"use strict";

const { withBusinessContext } = require("../../config/db");

// ─────────────────────────────────────────────────────────────
// VALUATION SERVICE
//
// Cost-side companion to stock.service.js (which deals with quantities).
// All cost calculations live here. Three responsibilities:
//
//   1. Per-product cost basis — what is one unit "worth" right now?
//      Method: weighted average of received unit_cost on stock_movements
//      where direction = 1 (inbound). Falls back to products.cost_price
//      if no inbound movements have ever been recorded.
//
//   2. Total stock valuation — for the Balance Sheet "Inventory" line.
//      Returned both at cost and at retail so the dashboard can show
//      cost basis, retail value, and unrealised margin.
//
//   3. COGS on a sale — when sales/POS confirms a transaction it asks
//      this service "what does this product cost me right now?" and the
//      number gets posted as a debit to COGS / credit to Inventory by
//      the journal service.
// ─────────────────────────────────────────────────────────────

/**
 * Weighted-average unit cost for a product, calculated from inbound
 * stock_movements (received_from_supplier, transferred_in from outside,
 * adjustment-in). Falls back to products.cost_price if no inbound
 * movements exist yet (e.g. seed data, opening balance).
 *
 * @returns {number} unit cost in product's currency (NGN by default)
 */
async function getUnitCost(client, productId) {
  const {
    rows: [row],
  } = await client.query(
    `WITH inbound AS (
       SELECT quantity, unit_cost
       FROM stock_movements
       WHERE product_id = $1
         AND direction = 1
         AND unit_cost IS NOT NULL
         AND unit_cost > 0
     )
     SELECT
       CASE
         WHEN COALESCE(SUM(quantity), 0) > 0
           THEN SUM(quantity * unit_cost)::numeric / SUM(quantity)::numeric
         ELSE NULL
       END AS weighted_avg_cost
     FROM inbound`,
    [productId],
  );

  if (row && row.weighted_avg_cost !== null) {
    return parseFloat(row.weighted_avg_cost);
  }

  // Fallback: products.cost_price (set manually or by initial seed).
  const {
    rows: [product],
  } = await client.query(
    `SELECT cost_price FROM products WHERE product_id = $1`,
    [productId],
  );
  return product ? parseFloat(product.cost_price) : 0;
}

/**
 * Same as getUnitCost but resolves business context for callers
 * outside an active transaction (e.g. dashboards).
 */
async function getUnitCostForBusiness(business, productId) {
  return withBusinessContext(business, (client) =>
    getUnitCost(client, productId),
  );
}

/**
 * Calculate cost of goods sold for one line of a sale.
 * Used by sales/POS/invoicing when finalising a transaction.
 *
 * Returns { unit_cost, line_cost } so the caller can post a journal entry
 * crediting Inventory and debiting COGS for line_cost on the sale date.
 */
async function calculateLineCOGS(client, { productId, quantity }) {
  const unitCost = await getUnitCost(client, productId);
  return {
    unit_cost: unitCost,
    line_cost: parseFloat((unitCost * quantity).toFixed(2)),
  };
}

/**
 * COGS for a full sale (multiple lines). Convenience wrapper.
 */
async function calculateSaleCOGS(client, lines) {
  let totalCost = 0;
  const breakdown = [];
  for (const line of lines) {
    const result = await calculateLineCOGS(client, {
      productId: line.product_id,
      quantity: line.quantity,
    });
    totalCost += result.line_cost;
    breakdown.push({
      product_id: line.product_id,
      quantity: line.quantity,
      ...result,
    });
  }
  return {
    total_cost: parseFloat(totalCost.toFixed(2)),
    breakdown,
  };
}

/**
 * Total stock valuation across the entire business.
 *
 * Returns:
 *   - total_units: sum of current quantity across all products
 *   - total_cost_value: sum of (current qty × unit cost)
 *   - total_retail_value: sum of (current qty × selling price)
 *   - unrealised_margin: retail − cost
 *   - unrealised_margin_pct: margin as a % of retail
 *
 * Optional filters:
 *   - locationId: restrict to one location
 *   - categoryId: restrict to one category
 *
 * Implementation note: weighted-average cost is computed inline per
 * product in a single query rather than calling getUnitCost in a loop
 * — this matters when a business has thousands of SKUs.
 */
async function getTotalValuation(client, { locationId, categoryId } = {}) {
  const { rows } = await client.query(
    `WITH product_qty AS (
       SELECT
         p.product_id,
         p.cost_price,
         p.selling_price,
         p.category_id,
         COALESCE(SUM(sm.quantity * sm.direction), 0) AS current_qty
       FROM products p
       LEFT JOIN stock_movements sm ON sm.product_id = p.product_id
         AND ($1::UUID IS NULL OR COALESCE(sm.to_location_id, sm.from_location_id) = $1)
       WHERE p.is_deleted = false AND p.is_active = true
         AND ($2::UUID IS NULL OR p.category_id = $2)
       GROUP BY p.product_id, p.cost_price, p.selling_price, p.category_id
     ),
     product_cost AS (
       SELECT
         product_id,
         CASE
           WHEN SUM(CASE WHEN direction = 1 AND unit_cost IS NOT NULL AND unit_cost > 0 THEN quantity ELSE 0 END) > 0
             THEN SUM(CASE WHEN direction = 1 AND unit_cost IS NOT NULL AND unit_cost > 0 THEN quantity * unit_cost ELSE 0 END)
                / SUM(CASE WHEN direction = 1 AND unit_cost IS NOT NULL AND unit_cost > 0 THEN quantity ELSE 0 END)
           ELSE NULL
         END AS weighted_avg_cost
       FROM stock_movements
       GROUP BY product_id
     )
     SELECT
       COALESCE(SUM(pq.current_qty), 0) AS total_units,
       COALESCE(SUM(pq.current_qty * COALESCE(pc.weighted_avg_cost, pq.cost_price)), 0) AS total_cost_value,
       COALESCE(SUM(pq.current_qty * pq.selling_price), 0) AS total_retail_value
     FROM product_qty pq
     LEFT JOIN product_cost pc ON pc.product_id = pq.product_id
     WHERE pq.current_qty > 0`,
    [locationId || null, categoryId || null],
  );

  const r = rows[0] || {};
  const cost = parseFloat(r.total_cost_value || 0);
  const retail = parseFloat(r.total_retail_value || 0);
  const margin = retail - cost;

  return {
    total_units: parseInt(r.total_units || 0, 10),
    total_cost_value: parseFloat(cost.toFixed(2)),
    total_retail_value: parseFloat(retail.toFixed(2)),
    unrealised_margin: parseFloat(margin.toFixed(2)),
    unrealised_margin_pct:
      retail > 0 ? parseFloat(((margin / retail) * 100).toFixed(2)) : 0,
  };
}

/**
 * Per-product valuation breakdown — useful for the stock dashboard
 * "top items by value" widget and for the Balance Sheet inventory note.
 */
async function getValuationByProduct(
  client,
  { limit = 100, orderBy = "cost_value_desc" } = {},
) {
  const orderClauses = {
    cost_value_desc: "cost_value DESC",
    cost_value_asc: "cost_value ASC",
    retail_value_desc: "retail_value DESC",
    qty_desc: "current_qty DESC",
    name_asc: "p.name ASC",
  };
  const orderClause = orderClauses[orderBy] || orderClauses.cost_value_desc;

  const { rows } = await client.query(
    `WITH product_cost AS (
       SELECT product_id,
         CASE
           WHEN SUM(CASE WHEN direction = 1 AND unit_cost IS NOT NULL AND unit_cost > 0 THEN quantity ELSE 0 END) > 0
             THEN SUM(CASE WHEN direction = 1 AND unit_cost IS NOT NULL AND unit_cost > 0 THEN quantity * unit_cost ELSE 0 END)
                / SUM(CASE WHEN direction = 1 AND unit_cost IS NOT NULL AND unit_cost > 0 THEN quantity ELSE 0 END)
           ELSE NULL
         END AS weighted_avg_cost
       FROM stock_movements GROUP BY product_id
     )
     SELECT
       p.product_id, p.sku, p.name, p.cost_price, p.selling_price,
       COALESCE(pc.weighted_avg_cost, p.cost_price) AS effective_unit_cost,
       COALESCE(SUM(sm.quantity * sm.direction), 0) AS current_qty,
       COALESCE(SUM(sm.quantity * sm.direction), 0)
         * COALESCE(pc.weighted_avg_cost, p.cost_price) AS cost_value,
       COALESCE(SUM(sm.quantity * sm.direction), 0)
         * p.selling_price AS retail_value
     FROM products p
     LEFT JOIN stock_movements sm ON sm.product_id = p.product_id
     LEFT JOIN product_cost pc ON pc.product_id = p.product_id
     WHERE p.is_deleted = false AND p.is_active = true
     GROUP BY p.product_id, p.sku, p.name, p.cost_price, p.selling_price, pc.weighted_avg_cost
     HAVING COALESCE(SUM(sm.quantity * sm.direction), 0) > 0
     ORDER BY ${orderClause}
     LIMIT $1`,
    [limit],
  );

  return rows.map((r) => ({
    product_id: r.product_id,
    sku: r.sku,
    name: r.name,
    current_qty: parseInt(r.current_qty, 10),
    effective_unit_cost: parseFloat(r.effective_unit_cost),
    selling_price: parseFloat(r.selling_price),
    cost_value: parseFloat(parseFloat(r.cost_value).toFixed(2)),
    retail_value: parseFloat(parseFloat(r.retail_value).toFixed(2)),
  }));
}

/**
 * Business-scoped wrappers — let callers outside an existing transaction
 * (dashboards, reports) ask for valuation without managing the connection.
 */
async function getTotalValuationForBusiness(business, filters) {
  return withBusinessContext(business, (client) =>
    getTotalValuation(client, filters),
  );
}

async function getValuationByProductForBusiness(business, opts) {
  return withBusinessContext(business, (client) =>
    getValuationByProduct(client, opts),
  );
}

module.exports = {
  // Per-product cost
  getUnitCost,
  getUnitCostForBusiness,
  // COGS for sales
  calculateLineCOGS,
  calculateSaleCOGS,
  // Aggregate valuation
  getTotalValuation,
  getTotalValuationForBusiness,
  getValuationByProduct,
  getValuationByProductForBusiness,
};
