"use strict";

const crypto = require("crypto");
const { withBusinessContext, nextDocumentNumber } = require("../../config/db");
const stockService = require("../stock/stock.service");
const journalService = require("../accounting/journal.service");
const auditService = require("../../shared/audit/audit.service");
const repo = require("./purchasing.repository");

// ── SUPPLIERS ────────────────────────────────────────────────

async function listSuppliers(business, { page = 1, limit = 50, search } = {}) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    return {
      data: await repo.listSuppliers(client, {
        search,
        limit: parseInt(limit),
        offset,
      }),
    };
  });
}

async function createSupplier(business, data, user) {
  return withBusinessContext(business, async (client) => {
    // Use the atomic document-numbering sequence rather than COUNT(*)+1.
    // The old COUNT-based approach had a race: two concurrent createSupplier
    // calls read the same count and produced the same SUP-000N code, and
    // with no UNIQUE constraint on supplier_code both inserts succeeded —
    // leaving two suppliers with an identical code. nextDocumentNumber
    // locks the sequence row, so concurrent callers get distinct codes.
    const code = await nextDocumentNumber(client, business, "supplier");
    const supplier = await repo.insertSupplier(client, {
      contact_id: data.contact_id,
      code,
      payment_terms_days: data.payment_terms_days,
      preferred_currency: data.preferred_currency,
      notes: data.notes,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "purchasing",
      action: "create",
      table: "suppliers",
      recordId: supplier.supplier_id,
      after: supplier,
    });
    return supplier;
  });
}

async function getSupplier(business, supplierId) {
  return withBusinessContext(business, async (client) => {
    const s = await repo.findSupplierById(client, supplierId);
    if (!s)
      throw Object.assign(new Error("Supplier not found"), { status: 404 });
    return s;
  });
}

async function generateSupplierInvite(business, supplierId, user) {
  return withBusinessContext(business, async (client) => {
    const s = await repo.findSupplierById(client, supplierId);
    if (!s)
      throw Object.assign(new Error("Supplier not found"), { status: 404 });
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await repo.upsertSupplierPortalToken(client, {
      supplierId,
      token,
      expiresAt,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "purchasing",
      action: "invite",
      table: "suppliers",
      recordId: supplierId,
    });
    return { token, expires_at: expiresAt };
  });
}

// ── RFQs ─────────────────────────────────────────────────────

async function listRFQs(business, { page = 1, limit = 20, status } = {}) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    return {
      data: await repo.listRFQs(client, {
        status,
        limit: parseInt(limit),
        offset,
      }),
    };
  });
}

async function getRFQ(business, rfqId) {
  return withBusinessContext(business, async (client) => {
    const rfq = await repo.findRFQById(client, rfqId);
    if (!rfq) throw Object.assign(new Error("RFQ not found"), { status: 404 });
    return rfq;
  });
}

async function createRFQ(business, data, user) {
  return withBusinessContext(business, async (client) => {
    const rfqNumber = await nextDocumentNumber(client, business, "rfq");
    const rfq = await repo.insertRFQ(client, {
      rfqNumber,
      title: data.title,
      response_deadline: data.response_deadline,
      notes: data.notes,
      userId: user.user_id,
    });
    for (const l of data.lines) {
      await repo.insertRFQLine(client, {
        rfq_id: rfq.rfq_id,
        product_id: l.product_id,
        description: l.description,
        quantity_needed: l.quantity_needed,
        target_price: l.target_price,
      });
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "purchasing",
      action: "create",
      table: "rfqs",
      recordId: rfq.rfq_id,
      after: rfq,
    });
    return rfq;
  });
}

async function sendRFQ(business, rfqId, user) {
  return withBusinessContext(business, async (client) => {
    const rfq = await repo.findRFQById(client, rfqId);
    if (!rfq) throw Object.assign(new Error("RFQ not found"), { status: 404 });
    if (rfq.status !== "draft") {
      throw Object.assign(
        new Error(`Cannot send RFQ in status '${rfq.status}'`),
        { status: 400 },
      );
    }
    const updated = await repo.updateRFQStatus(client, rfqId, "sent");
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "purchasing",
      action: "send",
      table: "rfqs",
      recordId: rfqId,
      before: { status: "draft" },
      after: { status: "sent" },
    });
    return updated;
  });
}

async function closeRFQ(business, rfqId, user) {
  return withBusinessContext(business, async (client) => {
    const rfq = await repo.findRFQById(client, rfqId);
    if (!rfq) throw Object.assign(new Error("RFQ not found"), { status: 404 });
    if (rfq.status !== "sent" && rfq.status !== "responses_received") {
      throw Object.assign(
        new Error(`Cannot close RFQ in status '${rfq.status}'`),
        { status: 400 },
      );
    }
    const updated = await repo.updateRFQStatus(client, rfqId, "closed");
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "purchasing",
      action: "close",
      table: "rfqs",
      recordId: rfqId,
      before: { status: rfq.status },
      after: { status: "closed" },
    });
    return updated;
  });
}

async function cancelRFQ(business, rfqId, user) {
  return withBusinessContext(business, async (client) => {
    const rfq = await repo.findRFQById(client, rfqId);
    if (!rfq) throw Object.assign(new Error("RFQ not found"), { status: 404 });
    if (["closed", "cancelled"].includes(rfq.status)) {
      throw Object.assign(
        new Error(`Cannot cancel RFQ in status '${rfq.status}'`),
        { status: 400 },
      );
    }
    const updated = await repo.updateRFQStatus(client, rfqId, "cancelled");
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "purchasing",
      action: "cancel",
      table: "rfqs",
      recordId: rfqId,
      before: { status: rfq.status },
      after: { status: "cancelled" },
    });
    return updated;
  });
}

// Public (no auth) — token-gated supplier portal
async function getRFQByToken(token) {
  const { pool } = require("../../config/db");
  // portal_access_token is on the suppliers table — find the supplier,
  // then look up their active RFQs that are in 'sent' status.
  const {
    rows: [supplier],
  } = await pool.query(
    `SELECT s.supplier_id, s.supplier_code, c.display_name
     FROM shared.contacts c
     JOIN (
       SELECT supplier_id, supplier_code, contact_id FROM jewelry.suppliers WHERE portal_access_token = $1
       UNION ALL
       SELECT supplier_id, supplier_code, contact_id FROM diffusers.suppliers WHERE portal_access_token = $1
     ) s ON s.contact_id = c.contact_id
     LIMIT 1`,
    [token],
  );
  if (!supplier) {
    throw Object.assign(new Error("Invalid or expired portal token"), {
      status: 401,
    });
  }
  return { supplier };
}

async function submitSupplierQuote(business, data) {
  return withBusinessContext(business, async (client) => {
    const { rfq_id, supplier_id, lines, notes } = data;
    const rfq = await repo.findRFQById(client, rfq_id);
    if (!rfq || rfq.status !== "sent") {
      throw Object.assign(new Error("RFQ not available for quoting"), {
        status: 400,
      });
    }
    const quotes = [];
    for (const l of lines) {
      const q = await repo.insertSupplierQuote(client, {
        rfq_id,
        supplier_id,
        rfq_line_id: l.rfq_line_id,
        unit_price: l.unit_price,
        currency: l.currency,
        lead_time_days: l.lead_time_days,
        valid_until: l.valid_until,
        notes: l.notes,
      });
      quotes.push(q);
    }
    // Move RFQ to responses_received
    await repo.updateRFQStatus(client, rfq_id, "responses_received");
    return { quotes };
  });
}

// ── PURCHASE ORDERS ──────────────────────────────────────────

async function listPOs(
  business,
  { page = 1, limit = 20, status, supplierId } = {},
) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    return {
      data: await repo.listPOs(client, {
        status,
        supplierId,
        limit: parseInt(limit),
        offset,
      }),
    };
  });
}

async function createPO(business, data, user) {
  return withBusinessContext(business, async (client) => {
    const poNumber = await nextDocumentNumber(
      client,
      business,
      "purchase_order",
    );
    let subtotal = 0;
    for (const l of data.lines) subtotal += l.unit_price * l.quantity_ordered;
    const total =
      subtotal +
      (data.shipping_cost || 0) +
      (data.import_duty || 0) +
      (data.other_charges || 0);

    const po = await repo.insertPO(client, {
      poNumber,
      supplier_id: data.supplier_id,
      expected_delivery: data.expected_delivery,
      subtotal,
      shipping_cost: data.shipping_cost,
      import_duty: data.import_duty,
      other_charges: data.other_charges,
      total,
      currency: data.currency,
      exchange_rate: data.exchange_rate,
      ngn_equivalent: data.exchange_rate ? total * data.exchange_rate : null,
      notes: data.notes,
      userId: user.user_id,
    });

    for (const l of data.lines) {
      await repo.insertPOLine(client, {
        po_id: po.po_id,
        product_id: l.product_id,
        quantity_ordered: l.quantity_ordered,
        unit_price: l.unit_price,
      });
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "purchasing",
      action: "create",
      table: "purchase_orders",
      recordId: po.po_id,
      after: po,
    });
    return po;
  });
}

async function getPO(business, poId) {
  return withBusinessContext(business, async (client) => {
    const po = await repo.findPOById(client, poId);
    if (!po) throw Object.assign(new Error("PO not found"), { status: 404 });
    return po;
  });
}

async function updatePO(business, poId, data, user) {
  return withBusinessContext(business, async (client) => {
    const po = await repo.findPOById(client, poId);
    if (!po) throw Object.assign(new Error("PO not found"), { status: 404 });
    if (!["draft"].includes(po.status)) {
      throw Object.assign(new Error("Only draft POs can be edited"), {
        status: 400,
      });
    }
    const updated = await repo.updatePOFields(client, poId, {
      expected_delivery: data.expected_delivery,
      notes: data.notes,
      currency: data.currency,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "purchasing",
      action: "update",
      table: "purchase_orders",
      recordId: poId,
      before: po,
      after: updated,
    });
    return updated;
  });
}

async function sendPO(business, poId, user) {
  return withBusinessContext(business, async (client) => {
    const po = await repo.findPOById(client, poId);
    if (!po) throw Object.assign(new Error("PO not found"), { status: 404 });
    if (po.status !== "draft") {
      throw Object.assign(
        new Error(`Cannot send PO in status '${po.status}'`),
        { status: 400 },
      );
    }
    const updated = await repo.updatePOStatusDirect(client, poId, "sent");
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "purchasing",
      action: "send",
      table: "purchase_orders",
      recordId: poId,
      before: { status: "draft" },
      after: { status: "sent" },
    });
    return updated;
  });
}

async function approvePO(business, poId, user) {
  return withBusinessContext(business, async (client) => {
    const po = await repo.findPOById(client, poId);
    if (!po) throw Object.assign(new Error("PO not found"), { status: 404 });
    if (po.status !== "sent" && po.status !== "acknowledged") {
      throw Object.assign(
        new Error(`Cannot approve PO in status '${po.status}'`),
        { status: 400 },
      );
    }
    // Threshold check — read from business_config
    const {
      rows: [cfg],
    } = await client.query(
      `SELECT cash_handling_rules FROM shared.business_config WHERE business_key = $1 LIMIT 1`,
      [business],
    );
    const threshold = cfg?.cash_handling_rules?.po_approval_threshold_ngn;
    if (threshold && po.ngn_equivalent && po.ngn_equivalent >= threshold) {
      // The route already gates on purchasing.approve permission — this is a
      // belt-and-suspenders check if the threshold is set but the role lacks
      // explicit approve permission (future-proofing).
      const hasPerm = user.permissions?.purchasing?.includes("approve");
      if (!hasPerm) {
        throw Object.assign(
          new Error(
            `PO value exceeds approval threshold (₦${threshold.toLocaleString()}). Purchasing.approve permission required.`,
          ),
          { status: 403 },
        );
      }
    }
    const updated = await repo.updatePOStatusDirect(
      client,
      poId,
      "acknowledged",
    );
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "purchasing",
      action: "approve",
      table: "purchase_orders",
      recordId: poId,
      before: { status: po.status },
      after: { status: "acknowledged" },
    });
    return updated;
  });
}

async function cancelPO(business, poId, user) {
  return withBusinessContext(business, async (client) => {
    const po = await repo.findPOById(client, poId);
    if (!po) throw Object.assign(new Error("PO not found"), { status: 404 });
    if (["received", "invoiced", "paid", "cancelled"].includes(po.status)) {
      throw Object.assign(
        new Error(`Cannot cancel PO in status '${po.status}'`),
        { status: 400 },
      );
    }
    const updated = await repo.updatePOStatusDirect(client, poId, "cancelled");
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "purchasing",
      action: "cancel",
      table: "purchase_orders",
      recordId: poId,
      before: { status: po.status },
      after: { status: "cancelled" },
    });
    return updated;
  });
}

async function listReceiptsForPO(business, poId) {
  return withBusinessContext(business, async (client) => {
    return repo.listReceiptsByPO(client, poId);
  });
}

async function receiveGoods(
  business,
  poId,
  { lines, notes, receiving_location_id },
  user,
) {
  return withBusinessContext(business, async (client) => {
    // Goods receipt is an INBOUND stock movement, so it needs a
    // destination location. Use the explicitly-supplied location if
    // the caller passed one, otherwise fall back to the first active
    // warehouse. If neither exists, fail loudly — silently skipping
    // the stock movement (the old behaviour after the movement-type
    // bug) meant POs were marked received but stock never rose.
    let receivingLocationId = receiving_location_id || null;
    if (!receivingLocationId) {
      const {
        rows: [loc],
      } = await client.query(
        `SELECT location_id FROM stock_locations
         WHERE location_type = 'warehouse' AND is_active = true
         ORDER BY created_at LIMIT 1`,
      );
      receivingLocationId = loc?.location_id || null;
    }
    if (!receivingLocationId) {
      throw Object.assign(
        new Error(
          "No receiving location available. Pass receiving_location_id or create a warehouse location first.",
        ),
        { status: 400 },
      );
    }

    const receipt = await repo.insertGoodsReceipt(client, {
      poId,
      userId: user.user_id,
      notes,
    });

    let grnTotalCost = 0;

    for (const l of lines) {
      await repo.insertGoodsReceiptLine(client, {
        receipt_id: receipt.receipt_id,
        po_line_id: l.po_line_id,
        quantity_received: l.quantity_received,
        quantity_accepted: l.quantity_accepted,
        quantity_rejected: l.quantity_rejected,
        rejection_reason: l.rejection_reason,
      });
      await repo.updatePOLineReceived(client, {
        po_line_id: l.po_line_id,
        quantity_accepted: l.quantity_accepted,
      });
      if (l.quantity_accepted > 0) {
        const poLine = await repo.getPOLineProduct(client, l.po_line_id);
        if (poLine) {
          // Accumulate inventory value for the GRN journal using the
          // PO line's agreed unit price.
          grnTotalCost +=
            Number(l.quantity_accepted) * Number(poLine.unit_price || 0);
          await stockService.recordMovement(client, {
            business,
            productId: poLine.product_id,
            // "received" is NOT a valid movement type — the correct
            // enum value is "received_from_supplier". The old value
            // failed validateMovementInput, so every goods receipt
            // threw and stock never increased.
            movementType: "received_from_supplier",
            quantity: l.quantity_accepted,
            direction: 1,
            toLocationId: receivingLocationId,
            referenceType: "purchase_order",
            referenceId: poId,
            performedBy: user.user_id,
          });
        }
      }
    }

    // GRN journal: DR Inventory (1410) / CR Goods Received Not Invoiced (2150).
    if (grnTotalCost > 0) {
      const [invAcc, grniAcc] = await Promise.all([
        journalService.getAccountId(client, "1410"),
        journalService.getAccountId(client, "2150"),
      ]);
      if (invAcc && grniAcc) {
        await journalService.postEntry(client, {
          entryDate: new Date().toISOString().slice(0, 10),
          description: `Goods received — receipt ${receipt.receipt_id}`,
          referenceType: "goods_received",
          referenceId: receipt.receipt_id,
          postedBy: user.user_id,
          lines: [
            { account_id: invAcc, debit: grnTotalCost, credit: 0 },
            { account_id: grniAcc, debit: 0, credit: grnTotalCost },
          ],
        });
      }
    }

    await repo.updatePOStatus(client, poId);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "purchasing",
      action: "receive",
      table: "goods_received",
      recordId: receipt.receipt_id,
      after: { po_id: poId, lines_count: lines.length },
    });
    return receipt;
  });
}

// ── GENERATE PO FROM QUOTE ───────────────────────────────────

async function generatePOFromQuote(business, quoteId, user) {
  return withBusinessContext(business, async (client) => {
    const quote = await repo.findSupplierQuoteById(client, quoteId);
    if (!quote)
      throw Object.assign(new Error("Quote not found"), { status: 404 });
    if (quote.status !== "received") {
      throw Object.assign(new Error("Quote is already used or rejected"), {
        status: 400,
      });
    }

    // Fetch all lines from this supplier on the same RFQ
    const quoteLines = await repo.listQuoteLinesByRFQAndSupplier(client, {
      rfqId: quote.rfq_id,
      supplierId: quote.supplier_id,
    });

    const poLines = quoteLines.map((l) => ({
      product_id: l.product_id,
      quantity_ordered: l.quantity_needed,
      unit_price: l.unit_price,
    }));

    const po = await createPO(
      business,
      {
        supplier_id: quote.supplier_id,
        lines: poLines,
        currency: quote.currency,
        notes: `Generated from RFQ quote ${quoteId}`,
      },
      user,
    );

    // Mark the winning quote as accepted
    await repo.updateSupplierQuoteStatus(client, quoteId, "accepted");

    return po;
  });
}

// ── BILLS (supplier_invoices) ────────────────────────────────

async function listBills(
  business,
  { page = 1, limit = 20, status, supplierId } = {},
) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    return {
      data: await repo.listBills(client, {
        status,
        supplierId,
        limit: parseInt(limit),
        offset,
      }),
    };
  });
}

async function getBill(business, billId) {
  return withBusinessContext(business, async (client) => {
    const bill = await repo.findBillById(client, billId);
    if (!bill)
      throw Object.assign(new Error("Bill not found"), { status: 404 });
    return bill;
  });
}

async function createBill(business, data, user) {
  return withBusinessContext(business, async (client) => {
    // 3-way match — if a PO is linked, validate quantity and price tolerance
    if (data.po_id && data.lines?.length) {
      const po = await repo.findPOById(client, data.po_id);
      if (!po) throw Object.assign(new Error("PO not found"), { status: 404 });

      const poLineMap = {};
      for (const pl of po.lines || []) {
        poLineMap[pl.product_id] = pl;
      }

      for (const bl of data.lines) {
        const pl = poLineMap[bl.product_id];
        if (!pl) continue; // tolerate extra lines on the bill
        // Quantity: billed must not exceed received
        if (bl.quantity > pl.quantity_received) {
          throw Object.assign(
            new Error(
              `3-way match failed: billed qty (${bl.quantity}) exceeds received qty (${pl.quantity_received}) for product ${bl.product_id}`,
            ),
            { status: 400 },
          );
        }
        // Price: within ±5% of PO unit price
        const priceDiff =
          Math.abs(bl.unit_price - pl.unit_price) / pl.unit_price;
        if (priceDiff > 0.05) {
          throw Object.assign(
            new Error(
              `3-way match failed: billed price (${bl.unit_price}) differs >5% from PO price (${pl.unit_price}) for product ${bl.product_id}`,
            ),
            { status: 400 },
          );
        }
      }
    }

    const bill = await repo.insertBill(client, {
      supplier_id: data.supplier_id,
      po_id: data.po_id || null,
      supplier_invoice_number: data.supplier_invoice_number,
      invoice_date: data.invoice_date,
      due_date: data.due_date,
      amount: data.amount,
      currency: data.currency,
      amount_ngn: data.amount_ngn || null,
      notes: data.notes || null,
      document_id: data.document_id || null,
      status: data.po_id ? "matched" : "pending",
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "purchasing",
      action: "create",
      table: "supplier_invoices",
      recordId: bill.sup_invoice_id,
      after: bill,
    });
    return bill;
  });
}

async function approveBill(business, billId, user) {
  return withBusinessContext(business, async (client) => {
    const bill = await repo.findBillById(client, billId);
    if (!bill)
      throw Object.assign(new Error("Bill not found"), { status: 404 });
    if (!["pending", "matched"].includes(bill.status)) {
      throw Object.assign(
        new Error(`Cannot approve bill in status '${bill.status}'`),
        { status: 400 },
      );
    }
    const updated = await repo.updateBillStatus(client, billId, "approved");

    // Recognise the payable on approval (accrual basis).
    //   PO-linked bill: DR GRNI (2150) / CR AP (2100)  — clears the GRNI accrual
    //   Non-PO bill:    DR Purchases-Non-stock (6700) / CR AP (2100)
    {
      const debitCode = bill.po_id ? "2150" : "6700";
      const [debitAcc, apAcc] = await Promise.all([
        journalService.getAccountId(client, debitCode),
        journalService.getAccountId(client, "2100"),
      ]);
      if (debitAcc && apAcc) {
        const amount = parseFloat(bill.amount);
        await journalService.postEntry(client, {
          entryDate:
            (bill.invoice_date &&
              new Date(bill.invoice_date).toISOString().slice(0, 10)) ||
            new Date().toISOString().slice(0, 10),
          description: `Supplier invoice — ${bill.supplier_invoice_number}`,
          referenceType: "supplier_invoice",
          referenceId: billId,
          postedBy: user.user_id,
          lines: [
            { account_id: debitAcc, debit: amount, credit: 0 },
            { account_id: apAcc, debit: 0, credit: amount },
          ],
        });
      }
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "purchasing",
      action: "approve",
      table: "supplier_invoices",
      recordId: billId,
      before: { status: bill.status },
      after: { status: "approved" },
    });
    return updated;
  });
}

async function disputeBill(business, billId, reason, user) {
  return withBusinessContext(business, async (client) => {
    const bill = await repo.findBillById(client, billId);
    if (!bill)
      throw Object.assign(new Error("Bill not found"), { status: 404 });
    if (bill.status === "paid") {
      throw Object.assign(new Error("Cannot dispute a paid bill"), {
        status: 400,
      });
    }
    const updated = await repo.updateBillStatus(client, billId, "disputed", {
      notes: reason,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "purchasing",
      action: "dispute",
      table: "supplier_invoices",
      recordId: billId,
      before: { status: bill.status },
      after: { status: "disputed", reason },
    });
    return updated;
  });
}

async function payBill(business, billId, data, user) {
  return withBusinessContext(business, async (client) => {
    const bill = await repo.findBillById(client, billId);
    if (!bill)
      throw Object.assign(new Error("Bill not found"), { status: 404 });
    if (bill.status !== "approved") {
      throw Object.assign(new Error("Bill must be approved before payment"), {
        status: 400,
      });
    }
    const newAmountPaid =
      parseFloat(bill.amount_paid) + parseFloat(data.amount);
    const fullyPaid = newAmountPaid >= parseFloat(bill.amount);
    const updated = await repo.recordBillPayment(client, billId, {
      amount: data.amount,
      newAmountPaid,
      fullyPaid,
    });

    // Settlement journal: DR Accounts Payable (2100) / CR Bank (1210).
    {
      const [apAcc, bankAcc] = await Promise.all([
        journalService.getAccountId(client, "2100"),
        journalService.getAccountId(client, data.bank_account_code || "1210"),
      ]);
      if (apAcc && bankAcc) {
        const amount = parseFloat(data.amount);
        await journalService.postEntry(client, {
          entryDate: new Date().toISOString().slice(0, 10),
          description: `Supplier payment — ${bill.supplier_invoice_number}`,
          referenceType: "supplier_payment",
          referenceId: billId,
          postedBy: user.user_id,
          lines: [
            { account_id: apAcc, debit: amount, credit: 0 },
            { account_id: bankAcc, debit: 0, credit: amount },
          ],
        });
      }
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "purchasing",
      action: "pay",
      table: "supplier_invoices",
      recordId: billId,
      after: { amount_paid: newAmountPaid, fully_paid: fullyPaid },
    });
    return updated;
  });
}

module.exports = {
  // suppliers
  listSuppliers,
  createSupplier,
  getSupplier,
  generateSupplierInvite,
  // rfqs
  listRFQs,
  getRFQ,
  createRFQ,
  sendRFQ,
  closeRFQ,
  cancelRFQ,
  getRFQByToken,
  submitSupplierQuote,
  // purchase orders
  listPOs,
  createPO,
  getPO,
  updatePO,
  sendPO,
  approvePO,
  cancelPO,
  listReceiptsForPO,
  receiveGoods,
  generatePOFromQuote,
  // bills
  listBills,
  getBill,
  createBill,
  approveBill,
  disputeBill,
  payBill,
};
