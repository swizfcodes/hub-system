"use strict";

// ─────────────────────────────────────────────────────────────
// integrations/shopify/adapters/order.adapter
//
// Translation layer for Shopify orders.
//
// Hub model: sales_orders + sales_order_items, with optional
// contact_id referencing shared.contacts. Currency stays NGN for
// the jewelry/diffusers brands (Pixie Girl multi-currency is a
// future story, designed but not yet schema-wired here).
//
// Shopify model: order with line_items[], pricing, financial_status,
// fulfillment_status, customer.
//
// This adapter outputs ROWS, not SQL — the webhook (or scheduler
// backfill) decides how to write them. That keeps the adapter
// pure and testable.
// ─────────────────────────────────────────────────────────────

/**
 * Build the sales_order header row for a Shopify order.
 *
 * Returns:
 *   {
 *     external_id, order_number_hint, contact_id, status,
 *     fulfilment_type, total_amount, amount_paid, currency,
 *     channel, placed_at
 *   }
 *
 * The caller is responsible for:
 *   - resolving contact_id (via customer.adapter + a contacts lookup)
 *   - allocating the actual order_number from document_numbering
 *     (or using order_number_hint if the seq is unavailable)
 */
function toSalesOrderHeader(shopifyOrder, { contactId } = {}) {
  const totalAmount = parseFloat(shopifyOrder.total_price || "0");
  const isPaid = shopifyOrder.financial_status === "paid";

  return {
    external_id: String(shopifyOrder.id),
    order_number_hint: `SHOP-${shopifyOrder.id}`,
    contact_id: contactId || null,
    // Shopify orders are always confirmed from Hub's perspective —
    // by the time the webhook fires, the customer has checked out.
    status: "confirmed",
    fulfilment_type: "delivery",
    total_amount: totalAmount,
    amount_paid: isPaid ? totalAmount : 0,
    currency: shopifyOrder.currency || "NGN",
    channel: "shopify",
    placed_at: shopifyOrder.created_at
      ? new Date(shopifyOrder.created_at)
      : new Date(),
    // Carry the raw financial + fulfillment statuses for downstream
    // observability (admin can see the original Shopify state).
    metadata: {
      shopify_order_id: String(shopifyOrder.id),
      shopify_order_number: shopifyOrder.name || null,
      financial_status: shopifyOrder.financial_status || null,
      fulfillment_status: shopifyOrder.fulfillment_status || null,
    },
  };
}

/**
 * Build the sales_order_items rows for the order. One row per
 * Shopify line_item. The caller will set order_id after inserting
 * the header.
 *
 * Each row carries:
 *   - sku                 (so the matcher can find the Hub product)
 *   - shopify_variant_id  (more precise match key when sku is missing)
 *   - quantity, unit_price, discount_amount, line_total
 *
 * product_id is NOT set here — the caller resolves it via a
 * products lookup. If no Hub product matches, the caller decides
 * whether to skip the line, raise it as an exception, or create
 * a manual entry.
 */
function toSalesOrderItems(shopifyOrder) {
  if (!Array.isArray(shopifyOrder.line_items)) return [];
  return shopifyOrder.line_items.map((li) => {
    const quantity = parseInt(li.quantity, 10) || 0;
    const unitPrice = parseFloat(li.price || "0");
    // Shopify discounts come through total_discount (per line) +
    // discount_allocations (split across lines). Use the simpler
    // total_discount; if the merchant uses Shopify Scripts the
    // discount_allocations sum is more accurate but rare for the
    // SME use case this Hub serves.
    const discountAmount = parseFloat(li.total_discount || "0");
    const lineTotal = parseFloat(
      (quantity * unitPrice - discountAmount).toFixed(2),
    );
    return {
      sku: li.sku || null,
      shopify_variant_id: li.variant_id ? String(li.variant_id) : null,
      shopify_product_id: li.product_id ? String(li.product_id) : null,
      description: li.title || li.name || li.sku || "Shopify line item",
      quantity,
      unit_price: unitPrice,
      discount_amount: discountAmount,
      line_total: lineTotal,
    };
  });
}

/**
 * Predicate: did this Shopify order originate from a channel the
 * Hub should track? Used by the scheduler when deciding whether
 * to backfill an order — POS sales done in Shopify's own POS
 * shouldn't double-count with Hub's POS module.
 */
function shouldImport(shopifyOrder) {
  if (!shopifyOrder) return false;
  if (shopifyOrder.cancelled_at) return false;
  // Shopify's source_name is 'web', 'shopify_draft_order', 'pos', etc.
  // We import everything EXCEPT pos — Hub POS owns in-store sales.
  if (shopifyOrder.source_name === "pos") return false;
  return true;
}

module.exports = {
  toSalesOrderHeader,
  toSalesOrderItems,
  shouldImport,
};
