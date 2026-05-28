"use strict";

const notifService = require("../../shared/notifications/notifications.service");
const { emitToBusiness } = require("../../config/sockets");
const journalService = require("../accounting/journal.service");
const valuation = require("./valuation.service");
const logger = require("../../config/logger");
const repo = require("./stock.repository");

// ─────────────────────────────────────────────────────────────
// MOVEMENTS SERVICE
//
// Every stock_movement row in the database flows through this file.
// Other modules (POS, sales, purchasing, logistics, retail-partners)
// call recordMovement here rather than inserting movements directly,
// so we always have:
//
//   - low-stock check triggered on every outbound movement
//   - real-time socket emit so the stock dashboard updates live
//   - centralised place to add side effects (cost averaging hooks,
//     audit log, batch tracking) in future without touching callers
//
// This service deliberately accepts an existing transaction client
// rather than opening its own — every caller is already inside a
// withBusinessContext block, and we must stay in the same transaction
// so the movement and its parent record (sale, PO receipt, transfer)
// commit or roll back together.
// ─────────────────────────────────────────────────────────────

const VALID_MOVEMENT_TYPES = [
  "received_from_supplier",
  "sold",
  "transferred_in",
  "transferred_out",
  "sent_to_consignment",
  "returned_from_consignment",
  "consignment_sale",
  "wholesale_out",
  "reserved",
  "reservation_released",
  "adjustment",
  "write_off",
  "return_from_customer",
];

/**
 * The central write path for stock_movements. Every other module
 * calls this — never inserts movements directly.
 *
 * @param {Client} client    active pg transaction client (from withBusinessContext)
 * @param {Object} input
 * @param {string} input.business        business key — used only for notifications/sockets
 * @param {string} input.productId
 * @param {string} input.movementType   one of VALID_MOVEMENT_TYPES
 * @param {number} input.quantity        positive integer
 * @param {1|-1}   input.direction       1 = inbound, -1 = outbound
 * @param {string} [input.fromLocationId]
 * @param {string} [input.toLocationId]
 * @param {string} [input.referenceType]  e.g. 'sale', 'po', 'transfer', 'adjustment'
 * @param {string} [input.referenceId]
 * @param {number} [input.unitCost]       captured for inbound movements; feeds valuation
 * @param {string} [input.batchNumber]
 * @param {string} [input.notes]
 * @param {string}  input.performedBy
 */
async function recordMovement(client, input) {
  validateMovementInput(input);

  const movement = await repo.insertMovement(client, {
    productId: input.productId,
    movementType: input.movementType,
    quantity: input.quantity,
    direction: input.direction,
    fromLocationId: input.fromLocationId,
    toLocationId: input.toLocationId,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    unitCost: input.unitCost,
    notes: input.notes,
    performedBy: input.performedBy,
  });

  // Outbound movement — check if we dipped below the reorder level.
  if (input.direction === -1) {
    await checkLowStock(client, input.business, input.productId);
  }

  // Accounting for VALUE-CHANGING movements. Sales/receipts/consignment are
  // journalled by their own modules; here we only handle adjustments and
  // write-offs, which otherwise never touch the ledger.
  //   adjustment (+): DR Inventory (1410)        / CR Adjustment Income (4900)
  //   adjustment (−): DR Inventory Write-off (6900) / CR Inventory (1410)
  //   write_off:      DR Inventory Write-off (6900) / CR Inventory (1410)
  if (
    input.movementType === "adjustment" ||
    input.movementType === "write_off"
  ) {
    await postStockValueJournal(client, movement, input);
  }

  // Real-time stock change broadcast — the stock dashboard listens
  // for this event and updates without a refresh.
  emitToBusiness(input.business, "stock:movement", {
    productId: input.productId,
    movementType: input.movementType,
    quantity: input.quantity,
    direction: input.direction,
    movementId: movement.movement_id,
  });

  return movement;
}

// Posts the ledger entry for a value-changing stock movement (adjustment or
// write-off). Quantity × unit cost gives the value; unit cost comes from the
// movement input if supplied, else the product valuation.
async function postStockValueJournal(client, movement, input) {
  let unitCost = Number(input.unitCost || 0);
  if (!unitCost) {
    try {
      const v = await valuation.calculateLineCOGS(client, {
        productId: input.productId,
        quantity: 1,
      });
      unitCost = Number(v.unit_cost || 0);
    } catch {
      unitCost = 0;
    }
  }
  const value = parseFloat((unitCost * Number(input.quantity)).toFixed(2));
  if (!value || value <= 0) return;

  const isIncrease =
    input.movementType === "adjustment" && input.direction === 1;

  let debitCode;
  let creditCode;
  let description;
  if (isIncrease) {
    debitCode = "1410"; // Inventory
    creditCode = "4900"; // Stock Adjustment Income
    description = `Stock adjustment +${input.quantity} units`;
  } else {
    debitCode = "6900"; // Inventory Write-off
    creditCode = "1410"; // Inventory
    description =
      input.movementType === "write_off"
        ? `Stock write-off — ${input.quantity} units`
        : `Stock adjustment −${input.quantity} units`;
  }

  const [debitAcc, creditAcc] = await Promise.all([
    journalService.getAccountId(client, debitCode),
    journalService.getAccountId(client, creditCode),
  ]);
  if (!debitAcc || !creditAcc) {
    logger.warn(
      `[stock] value journal skipped — missing COA ${debitCode}/${creditCode}`,
    );
    return;
  }

  await journalService.postEntry(client, {
    entryDate: new Date().toISOString().slice(0, 10),
    description,
    referenceType: "stock_movement",
    referenceId: movement.movement_id,
    postedBy: input.performedBy,
    lines: [
      { account_id: debitAcc, debit: value, credit: 0 },
      { account_id: creditAcc, debit: 0, credit: value },
    ],
  });
}

function validateMovementInput(input) {
  if (!input.productId) throw new Error("productId is required");
  if (!input.movementType) throw new Error("movementType is required");
  if (!VALID_MOVEMENT_TYPES.includes(input.movementType)) {
    throw new Error(
      `movementType must be one of: ${VALID_MOVEMENT_TYPES.join(", ")}`,
    );
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error("quantity must be a positive integer");
  }
  if (input.direction !== 1 && input.direction !== -1) {
    throw new Error("direction must be 1 (inbound) or -1 (outbound)");
  }
  if (!input.performedBy) throw new Error("performedBy is required");

  // Inbound movements must have a destination; outbound must have a source.
  if (input.direction === 1 && !input.toLocationId) {
    throw new Error("Inbound movements require a toLocationId");
  }
  if (input.direction === -1 && !input.fromLocationId) {
    throw new Error("Outbound movements require a fromLocationId");
  }
}

// ─────────────────────────────────────────────────────────────
// LOW STOCK CHECK
// Fires on every outbound movement. If the current quantity drops to
// or below the product's reorder_level, we notify stock managers and
// emit a socket event for the dashboard alert badge.
// ─────────────────────────────────────────────────────────────

async function checkLowStock(client, business, productId) {
  const stock = await repo.getLowStockStatus(client, productId);
  if (!stock) return;
  if (stock.current_qty > stock.reorder_level) return;

  const managers = await repo.getStockManagers(client, business);
  for (const manager of managers) {
    await notifService.create(client, {
      userId: manager.user_id,
      business,
      type: "stock_alert",
      title: `Low stock: ${stock.name}`,
      body: `Current quantity (${stock.current_qty}) is at or below reorder level (${stock.reorder_level}).`,
      referenceType: "product",
      referenceId: productId,
      actionUrl: `/stock?productId=${productId}`,
    });
  }

  emitToBusiness(business, "stock:low_alert", {
    productId,
    productName: stock.name,
    currentQty: stock.current_qty,
    reorderLevel: stock.reorder_level,
  });
}

// ─────────────────────────────────────────────────────────────
// AVAILABLE-TO-SELL CALCULATION
// "Current quantity" minus active reservations. Used by POS and Sales
// to decide whether a customer can buy something right now.
// ─────────────────────────────────────────────────────────────

/**
 * How many units of this product can a customer actually walk away with?
 * = sum(stock_movements quantity*direction) − sum(active stock_reservations)
 */
async function getAvailableQty(client, productId, locationId = null) {
  const {
    rows: [row],
  } = await client.query(
    `WITH on_hand AS (
       SELECT COALESCE(SUM(quantity * direction), 0) AS qty
       FROM stock_movements
       WHERE product_id = $1
         AND ($2::UUID IS NULL OR COALESCE(to_location_id, from_location_id) = $2)
     ),
     reserved AS (
       SELECT COALESCE(SUM(quantity), 0) AS qty
       FROM stock_reservations
       WHERE product_id = $1 AND status = 'active' AND expires_at > now()
     )
     SELECT (on_hand.qty - reserved.qty)::int AS available_qty,
            on_hand.qty::int AS on_hand_qty,
            reserved.qty::int AS reserved_qty
     FROM on_hand, reserved`,
    [productId, locationId],
  );
  return row || { available_qty: 0, on_hand_qty: 0, reserved_qty: 0 };
}

// ─────────────────────────────────────────────────────────────
// CUSTOMER HOLD / RESERVATION
// "Customer Hold" in the product description: a customer expresses
// interest in an item, the system locks it so it can't be sold to
// someone else. Implemented via stock_reservations + a 'reserved'
// movement (no movement is actually recorded — the reservation row
// is the lock).
// ─────────────────────────────────────────────────────────────

async function createReservation(
  client,
  {
    business,
    productId,
    quantity = 1,
    reservedFor,
    crmDealId,
    expiresAt,
    notes,
    userId,
  },
) {
  // Confirm we have stock to reserve.
  const { available_qty } = await getAvailableQty(client, productId);
  if (available_qty < quantity) {
    throw Object.assign(
      new Error(
        `Cannot reserve ${quantity} unit(s) — only ${available_qty} available`,
      ),
      { status: 409 },
    );
  }

  const {
    rows: [reservation],
  } = await client.query(
    `INSERT INTO stock_reservations
       (product_id, quantity, reserved_for, crm_deal_id, expires_at, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      productId,
      quantity,
      reservedFor || null,
      crmDealId || null,
      expiresAt,
      notes || null,
      userId,
    ],
  );

  emitToBusiness(business, "stock:reserved", {
    productId,
    reservationId: reservation.reservation_id,
    quantity,
    expiresAt,
  });

  return reservation;
}

async function releaseReservation(client, business, reservationId, userId) {
  const {
    rows: [reservation],
  } = await client.query(
    `UPDATE stock_reservations
     SET status = 'released', updated_at = now()
     WHERE reservation_id = $1 AND status = 'active'
     RETURNING *`,
    [reservationId],
  );
  if (!reservation) {
    throw Object.assign(
      new Error("Reservation not found or already released"),
      { status: 404 },
    );
  }
  emitToBusiness(business, "stock:reservation_released", {
    productId: reservation.product_id,
    reservationId,
  });
  return reservation;
}

/**
 * Mark a reservation as converted to a sale. Called from sales/POS
 * when a customer who had a hold actually checks out — the reservation
 * row is closed so it stops blocking other sales of the same SKU.
 */
async function convertReservationToSale(client, reservationId) {
  const {
    rows: [reservation],
  } = await client.query(
    `UPDATE stock_reservations
     SET status = 'converted_to_sale', updated_at = now()
     WHERE reservation_id = $1 AND status = 'active'
     RETURNING *`,
    [reservationId],
  );
  return reservation || null;
}

/**
 * Sweep expired active reservations — run by the expireReservations
 * cron job. Each reservation that has passed its expiry is flipped
 * to 'released' and the item becomes available again automatically.
 */
async function expireReservations(client) {
  const { rows } = await client.query(
    `UPDATE stock_reservations
     SET status = 'released', updated_at = now()
     WHERE status = 'active' AND expires_at <= now()
     RETURNING reservation_id, product_id`,
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────
// CONVENIENCE HELPERS
// Used by sales/POS/logistics — quick wrappers around recordMovement
// for the four most common cases. Keeps callers concise.
// ─────────────────────────────────────────────────────────────

function recordSale(client, opts) {
  return recordMovement(client, {
    ...opts,
    movementType: "sold",
    direction: -1,
  });
}

function recordReceipt(client, opts) {
  return recordMovement(client, {
    ...opts,
    movementType: "received_from_supplier",
    direction: 1,
  });
}

function recordWriteOff(client, opts) {
  return recordMovement(client, {
    ...opts,
    movementType: "write_off",
    direction: -1,
  });
}

function recordReturnFromCustomer(client, opts) {
  return recordMovement(client, {
    ...opts,
    movementType: "return_from_customer",
    direction: 1,
  });
}

module.exports = {
  // core write path
  recordMovement,
  // low-stock chain
  checkLowStock,
  // availability
  getAvailableQty,
  // reservations / customer hold
  createReservation,
  releaseReservation,
  convertReservationToSale,
  expireReservations,
  // semantic shortcuts
  recordSale,
  recordReceipt,
  recordWriteOff,
  recordReturnFromCustomer,
  // exposed for unit tests
  VALID_MOVEMENT_TYPES,
};
