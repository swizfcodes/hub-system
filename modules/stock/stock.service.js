"use strict";

const { withBusinessContext, nextDocumentNumber } = require("../../config/db");
const movements = require("./movements.service");
const valuation = require("./valuation.service");
const repo = require("./stock.repository");

// ─────────────────────────────────────────────────────────────
// Stock service — coordination layer for the stock module.
//
// Heavy lifting lives in two sub-services:
//   - movements.service.js → all writes to stock_movements and reservations
//   - valuation.service.js → cost basis, COGS, total stock value
//
// This file orchestrates: current-stock queries, transfers, adjustments,
// low-stock alerts, location list. It re-exports the public API of both
// sub-services so external callers (POS, sales, purchasing, invoicing,
// logistics, retail-partners, dashboards) have a single import path:
//
//   const stockService = require("../stock/stock.service");
//   await stockService.recordMovement(...);   // from movements
//   await stockService.calculateLineCOGS(...); // from valuation
//
// This prevents the cross-module-boundary smell of every consumer
// reaching into ../stock/valuation.service directly.
// ─────────────────────────────────────────────────────────────

async function getCurrentStock(
  business,
  { locationId, search, belowReorder } = {},
) {
  return withBusinessContext(business, async (client) => {
    const rows = await repo.getCurrentStock(client, {
      locationId,
      search,
      belowReorder,
    });
    return { data: rows };
  });
}

async function getMovements(
  business,
  productId,
  { page = 1, limit = 50 } = {},
) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const rows = await repo.getMovements(client, productId, {
      limit: parseInt(limit),
      offset,
    });
    return { data: rows };
  });
}

async function createAdjustment(business, data, user) {
  return withBusinessContext(business, async (client) => {
    const currentQty = await repo.getCurrentQty(client, data.product_id);
    const diff = data.quantity_after - currentQty;
    const direction = diff >= 0 ? 1 : -1;

    if (diff === 0) return { message: "No adjustment needed" };

    const adj = await repo.insertAdjustment(client, {
      product_id: data.product_id,
      location_id: data.location_id,
      adjustment_type: data.adjustment_type,
      currentQty,
      quantity_after: data.quantity_after,
      reason: data.reason,
      userId: user.user_id,
    });

    await movements.recordMovement(client, {
      business,
      productId: data.product_id,
      movementType: "adjustment",
      quantity: Math.abs(diff),
      direction,
      toLocationId: direction === 1 ? data.location_id : null,
      fromLocationId: direction === -1 ? data.location_id : null,
      referenceType: "adjustment",
      referenceId: adj.adjustment_id,
      notes: data.reason,
      performedBy: user.user_id,
    });

    return adj;
  });
}

async function createTransfer(business, data, user) {
  // Creates a pending transfer with line items but NO stock movements
  // yet. Movements happen on dispatch (out) and receive (in). This is
  // a behaviour change from the previous instant-transfer flow — see
  // STOCK_PATCH_NOTES §transfers for migration details.
  return withBusinessContext(business, async (client) => {
    if (!Array.isArray(data.lines) || data.lines.length === 0) {
      throw Object.assign(new Error("Transfer must have at least one line"), {
        status: 400,
      });
    }
    if (data.from_location_id === data.to_location_id) {
      throw Object.assign(new Error("From and To locations must differ"), {
        status: 400,
      });
    }
    const transferNumber = await nextDocumentNumber(
      client,
      business,
      "transfer",
    );
    const transfer = await repo.insertTransferPending(client, {
      transferNumber,
      from_location_id: data.from_location_id,
      to_location_id: data.to_location_id,
      notes: data.notes,
      userId: user.user_id,
    });
    await repo.insertTransferLines(client, transfer.transfer_id, data.lines);
    return repo.findTransferById(client, transfer.transfer_id);
  });
}

async function listTransfers(
  business,
  { status, from, to, page = 1, limit = 50 } = {},
) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const rows = await repo.listTransfers(client, {
      status,
      from,
      to,
      limit: parseInt(limit),
      offset,
    });
    return { data: rows };
  });
}

async function getTransfer(business, transferId) {
  return withBusinessContext(business, async (client) => {
    const t = await repo.findTransferById(client, transferId);
    if (!t)
      throw Object.assign(new Error("Transfer not found"), { status: 404 });
    return t;
  });
}

async function dispatchTransfer(business, transferId, user) {
  // pending → in_transit. Writes one transferred_out movement per line.
  // Stock leaves the source location; nothing arrives at the destination
  // until /receive is called.
  return withBusinessContext(business, async (client) => {
    const t = await repo.findTransferById(client, transferId);
    if (!t)
      throw Object.assign(new Error("Transfer not found"), { status: 404 });
    if (t.status !== "pending") {
      throw Object.assign(
        new Error(`Cannot dispatch — transfer is ${t.status}`),
        { status: 400 },
      );
    }
    const lines = await repo.getTransferLines(client, transferId);
    for (const line of lines) {
      await movements.recordMovement(client, {
        business,
        productId: line.product_id,
        movementType: "transferred_out",
        quantity: line.quantity,
        direction: -1,
        fromLocationId: t.from_location_id,
        referenceType: "transfer",
        referenceId: transferId,
        performedBy: user.user_id,
      });
    }
    await repo.updateTransferStatus(client, transferId, "in_transit");
    return repo.findTransferById(client, transferId);
  });
}

async function receiveTransfer(business, transferId, user) {
  // in_transit → received. Writes one transferred_in movement per line.
  return withBusinessContext(business, async (client) => {
    const t = await repo.findTransferById(client, transferId);
    if (!t)
      throw Object.assign(new Error("Transfer not found"), { status: 404 });
    if (t.status !== "in_transit") {
      throw Object.assign(
        new Error(`Cannot receive — transfer is ${t.status}`),
        { status: 400 },
      );
    }
    const lines = await repo.getTransferLines(client, transferId);
    for (const line of lines) {
      await movements.recordMovement(client, {
        business,
        productId: line.product_id,
        movementType: "transferred_in",
        quantity: line.quantity,
        direction: 1,
        toLocationId: t.to_location_id,
        referenceType: "transfer",
        referenceId: transferId,
        performedBy: user.user_id,
      });
    }
    await repo.updateTransferStatus(client, transferId, "received", {
      received_by: user.user_id,
      received_at: new Date(),
    });
    return repo.findTransferById(client, transferId);
  });
}

async function cancelTransfer(business, transferId, { reason }, user) {
  // Cancel allowed from pending OR in_transit. If in_transit, we write
  // a reversal transferred_in back to the source location so the
  // ledger stays balanced (movements are append-only). If pending,
  // nothing has moved yet — just flip the status.
  return withBusinessContext(business, async (client) => {
    const t = await repo.findTransferById(client, transferId);
    if (!t)
      throw Object.assign(new Error("Transfer not found"), { status: 404 });
    if (!["pending", "in_transit"].includes(t.status)) {
      throw Object.assign(
        new Error(`Cannot cancel — transfer is ${t.status}`),
        { status: 400 },
      );
    }
    if (!reason || !reason.trim()) {
      throw Object.assign(new Error("Cancellation reason is required"), {
        status: 400,
      });
    }
    if (t.status === "in_transit") {
      // Reverse the outbound movements by writing inbound rows back
      // to the source location. We do NOT delete the original
      // transferred_out rows — they happened, and the ledger says so.
      const lines = await repo.getTransferLines(client, transferId);
      for (const line of lines) {
        await movements.recordMovement(client, {
          business,
          productId: line.product_id,
          movementType: "transferred_in",
          quantity: line.quantity,
          direction: 1,
          toLocationId: t.from_location_id, // back to source
          referenceType: "transfer_cancel",
          referenceId: transferId,
          notes: `Reversal — transfer cancelled: ${reason}`,
          performedBy: user.user_id,
        });
      }
    }
    await repo.updateTransferStatus(client, transferId, "cancelled", {
      cancel_reason: reason,
    });
    return repo.findTransferById(client, transferId);
  });
}

// ── On-hand ─────────────────────────────────────────────────────────────────

async function getOnHand(
  business,
  {
    search,
    category_id,
    location_id,
    low_stock_only,
    out_of_stock_only,
    page = 1,
    limit = 200,
  } = {},
) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    return repo.getOnHand(client, {
      search,
      categoryId: category_id,
      locationId: location_id,
      lowStockOnly: low_stock_only,
      outOfStockOnly: out_of_stock_only,
      limit: parseInt(limit),
      offset,
    });
  });
}

async function getOnHandByProduct(business, productId) {
  return withBusinessContext(business, async (client) => {
    const row = await repo.getOnHandByProduct(client, productId);
    if (!row)
      throw Object.assign(new Error("Product not found"), { status: 404 });
    return row;
  });
}

// ── Reservations (service wrappers — heavy lifting in movements.service) ────

async function listReservations(
  business,
  { status, product_id, page = 1, limit = 50 } = {},
) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const rows = await repo.listReservations(client, {
      status,
      productId: product_id,
      limit: parseInt(limit),
      offset,
    });
    return { data: rows };
  });
}

async function createReservationService(business, data, user) {
  return withBusinessContext(business, async (client) => {
    const reservation = await movements.createReservation(client, {
      business,
      productId: data.product_id,
      quantity: data.quantity,
      reservedFor: data.reserved_for || null,
      crmDealId: data.crm_deal_id || null,
      expiresAt: data.expires_at,
      notes: data.notes || null,
      userId: user.user_id,
    });
    return repo.findReservationById(client, reservation.reservation_id);
  });
}

async function releaseReservationService(business, reservationId, user) {
  return withBusinessContext(business, async (client) => {
    await movements.releaseReservation(
      client,
      business,
      reservationId,
      user.user_id,
    );
    return repo.findReservationById(client, reservationId);
  });
}

async function convertReservationService(business, reservationId) {
  return withBusinessContext(business, async (client) => {
    await movements.convertReservationToSale(client, reservationId);
    return repo.findReservationById(client, reservationId);
  });
}

// ── Quality checks ──────────────────────────────────────────────────────────

async function listQualityChecks(
  business,
  { product_id, check_type, result, page = 1, limit = 50 } = {},
) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const rows = await repo.listQualityChecks(client, {
      productId: product_id,
      checkType: check_type,
      result,
      limit: parseInt(limit),
      offset,
    });
    return { data: rows };
  });
}

async function createQualityCheck(business, data, user) {
  return withBusinessContext(business, async (client) => {
    return repo.insertQualityCheck(client, {
      product_id: data.product_id,
      check_type: data.check_type,
      result: data.result,
      notes: data.notes,
      userId: user.user_id,
    });
  });
}

async function getLowStockAlerts(business) {
  return withBusinessContext(business, async (client) => {
    const rows = await repo.getLowStockAlerts(client);
    return { data: rows };
  });
}

async function getLocations(business) {
  return withBusinessContext(business, async (client) => {
    const rows = await repo.getLocations(client);
    return { data: rows };
  });
}

module.exports = {
  getCurrentStock,
  getMovements,
  // ── Movements (re-exported from movements.service) ──────────
  // POS, sales, purchasing, logistics already import these via
  // stock.service so the import paths stay stable across modules.
  recordMovement: movements.recordMovement,
  checkLowStock: movements.checkLowStock,
  getAvailableQty: movements.getAvailableQty,
  createReservation: movements.createReservation,
  releaseReservation: movements.releaseReservation,
  convertReservationToSale: movements.convertReservationToSale,
  expireReservations: movements.expireReservations,
  // Semantic shortcuts for the four common movement cases.
  recordSale: movements.recordSale,
  recordReceipt: movements.recordReceipt,
  recordWriteOff: movements.recordWriteOff,
  recordReturnFromCustomer: movements.recordReturnFromCustomer,
  // ── Valuation (re-exported from valuation.service) ──────────
  // Per-product cost basis — used by POS/sales/invoicing to compute
  // COGS at the moment of sale.
  getUnitCost: valuation.getUnitCost,
  getUnitCostForBusiness: valuation.getUnitCostForBusiness,
  calculateLineCOGS: valuation.calculateLineCOGS,
  calculateSaleCOGS: valuation.calculateSaleCOGS,
  // Aggregate valuation — used by dashboards and the Balance Sheet
  // inventory note.
  getTotalValuation: valuation.getTotalValuation,
  getTotalValuationForBusiness: valuation.getTotalValuationForBusiness,
  getValuationByProduct: valuation.getValuationByProduct,
  getValuationByProductForBusiness: valuation.getValuationByProductForBusiness,
  // ── Local operations ────────────────────────────────────────
  createAdjustment,
  createTransfer,
  listTransfers,
  getTransfer,
  dispatchTransfer,
  receiveTransfer,
  cancelTransfer,
  getOnHand,
  getOnHandByProduct,
  // Reservations — service wrappers around movements.service.* that
  // open their own transaction; the *_Service suffix avoids shadowing
  // the re-exported lower-level versions above.
  listReservations,
  createReservationService,
  releaseReservationService,
  convertReservationService,
  // Quality checks
  listQualityChecks,
  createQualityCheck,
  getLowStockAlerts,
  getLocations,
};
