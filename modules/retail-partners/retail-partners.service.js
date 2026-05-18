"use strict";

const { withBusinessContext, nextDocumentNumber } = require("../../config/db");
const movements = require("../stock/movements.service");
const valuation = require("../stock/valuation.service");
const auditService = require("../../shared/audit/audit.service");
const notifService = require("../../shared/notifications/notifications.service");
const { emitToBusiness } = require("../../config/sockets");
const repo = require("./retail-partners.repository");

// ─────────────────────────────────────────────────────────────
// PARTNER CRUD
// ─────────────────────────────────────────────────────────────

async function listPartners(business, query) {
  return withBusinessContext(business, async (client) => {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 50;
    const offset = (page - 1) * limit;
    const filters = {
      search: query.search,
      arrangementType: query.arrangement_type,
      isActive:
        query.is_active === "true"
          ? true
          : query.is_active === "false"
            ? false
            : null,
    };
    const [data, total] = await Promise.all([
      repo.listPartners(client, { ...filters, limit, offset }),
      repo.countPartners(client, filters),
    ]);
    return { data, pagination: { page, limit, total } };
  });
}

async function getPartner(business, partnerId) {
  return withBusinessContext(business, async (client) => {
    const partner = await repo.findPartnerById(client, partnerId);
    if (!partner)
      throw Object.assign(new Error("Partner not found"), { status: 404 });
    const dashboard = await repo.getPartnerDashboard(client, partnerId);
    const balance = await repo.calculatePartnerBalance(client, partnerId);
    return { ...partner, dashboard, balance };
  });
}

async function createPartner(business, data, user) {
  return withBusinessContext(business, async (client) => {
    if (!["consignment", "wholesale", "both"].includes(data.arrangement_type)) {
      throw Object.assign(
        new Error("arrangement_type must be consignment, wholesale, or both"),
        { status: 400 },
      );
    }
    const existing = await repo.findPartnerByCode(client, data.partner_code);
    if (existing) {
      throw Object.assign(new Error("partner_code already in use"), {
        status: 409,
      });
    }
    const partner = await repo.insertPartner(client, data);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "retail_partners",
      action: "create",
      table: "retail_partners",
      recordId: partner.partner_id,
      after: partner,
    });
    return partner;
  });
}

async function updatePartner(business, partnerId, fields, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findPartnerById(client, partnerId);
    if (!before)
      throw Object.assign(new Error("Partner not found"), { status: 404 });
    if (
      fields.arrangement_type &&
      !["consignment", "wholesale", "both"].includes(fields.arrangement_type)
    ) {
      throw Object.assign(new Error("Invalid arrangement_type"), {
        status: 400,
      });
    }
    const after = await repo.updatePartner(client, partnerId, fields);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "retail_partners",
      action: "update",
      table: "retail_partners",
      recordId: partnerId,
      before,
      after,
    });
    return after;
  });
}

async function deactivatePartner(business, partnerId, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findPartnerById(client, partnerId);
    if (!before)
      throw Object.assign(new Error("Partner not found"), { status: 404 });
    // Refuse if the partner still holds consignment stock.
    const dash = await repo.getPartnerDashboard(client, partnerId);
    if (dash.units_held > 0) {
      throw Object.assign(
        new Error(
          `Cannot deactivate partner — they still hold ${dash.units_held} unit(s) on consignment. Recall the stock first.`,
        ),
        { status: 409 },
      );
    }
    const after = await repo.deactivatePartner(client, partnerId);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "retail_partners",
      action: "deactivate",
      table: "retail_partners",
      recordId: partnerId,
      before: { is_active: before.is_active },
      after,
    });
    return after;
  });
}

// ─────────────────────────────────────────────────────────────
// CONSIGNMENT — send stock TO a partner
// Creates: consignment_stock row + stock_movements row (sent_to_consignment).
// Lazily creates the partner's stock_location on first dispatch.
// ─────────────────────────────────────────────────────────────

async function sendConsignment(business, data, user) {
  return withBusinessContext(business, async (client) => {
    const partner = await repo.findPartnerById(client, data.partner_id);
    if (!partner)
      throw Object.assign(new Error("Partner not found"), { status: 404 });
    if (!partner.is_active)
      throw Object.assign(new Error("Partner is not active"), { status: 400 });
    if (partner.arrangement_type === "wholesale") {
      throw Object.assign(
        new Error(
          "This partner is wholesale-only — use the wholesale-sale endpoint",
        ),
        { status: 400 },
      );
    }
    if (!Array.isArray(data.items) || !data.items.length) {
      throw Object.assign(new Error("At least one item is required"), {
        status: 400,
      });
    }

    // Get or create the partner's stock location.
    let partnerLocation = await repo.findPartnerLocation(
      client,
      data.partner_id,
    );
    if (!partnerLocation) {
      partnerLocation = await repo.insertPartnerLocation(client, {
        partnerId: data.partner_id,
        name: `Partner: ${partner.display_name || partner.partner_code}`,
      });
    }

    const consignments = [];
    for (const item of data.items) {
      // Make sure we have stock available to send.
      const { available_qty } = await movements.getAvailableQty(
        client,
        item.product_id,
        data.from_location_id,
      );
      if (available_qty < item.quantity) {
        throw Object.assign(
          new Error(
            `Insufficient stock to consign product ${item.product_id} — only ${available_qty} available`,
          ),
          { status: 409 },
        );
      }

      const consignment = await repo.insertConsignment(client, {
        partner_id: data.partner_id,
        product_id: item.product_id,
        quantity_sent: item.quantity,
        agreed_price: item.agreed_price,
        sent_date: data.sent_date,
      });

      // Move physical stock from our location to the partner location.
      // We record both legs so the audit trail mirrors a transfer.
      await movements.recordMovement(client, {
        business,
        productId: item.product_id,
        movementType: "sent_to_consignment",
        quantity: item.quantity,
        direction: -1,
        fromLocationId: data.from_location_id,
        referenceType: "consignment",
        referenceId: consignment.consignment_id,
        performedBy: user.user_id,
      });
      await movements.recordMovement(client, {
        business,
        productId: item.product_id,
        movementType: "transferred_in",
        quantity: item.quantity,
        direction: 1,
        toLocationId: partnerLocation.location_id,
        referenceType: "consignment",
        referenceId: consignment.consignment_id,
        performedBy: user.user_id,
      });

      consignments.push(consignment);
    }

    emitToBusiness(business, "partner:consignment_sent", {
      partnerId: data.partner_id,
      partnerName: partner.display_name,
      itemCount: consignments.length,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "retail_partners",
      action: "send_consignment",
      table: "consignment_stock",
      recordId: data.partner_id,
      after: { consignments: consignments.map((c) => c.consignment_id) },
    });

    return { partner_id: data.partner_id, consignments };
  });
}

async function listConsignmentStock(business, query) {
  return withBusinessContext(business, async (client) => {
    const rows = await repo.listConsignmentStock(client, {
      partnerId: query.partner_id,
      status: query.status,
      productId: query.product_id,
    });
    return { data: rows };
  });
}

// ─────────────────────────────────────────────────────────────
// PARTNER REPORTS A SALE
// Recorded as a consignment_sale row + stock_movement (consignment_sale)
// from the partner's location. Partner balance is recalculated and cached.
// ─────────────────────────────────────────────────────────────

async function reportPartnerSale(business, data, user) {
  return withBusinessContext(business, async (client) => {
    const consignment = await repo.findConsignmentById(
      client,
      data.consignment_id,
    );
    if (!consignment)
      throw Object.assign(new Error("Consignment record not found"), {
        status: 404,
      });
    if (consignment.partner_id !== data.partner_id) {
      throw Object.assign(
        new Error("partner_id does not match the consignment"),
        { status: 400 },
      );
    }
    if (data.quantity_sold > consignment.quantity_outstanding) {
      throw Object.assign(
        new Error(
          `Reported sale of ${data.quantity_sold} exceeds outstanding ${consignment.quantity_outstanding}`,
        ),
        { status: 409 },
      );
    }

    const sale = await repo.insertConsignmentSale(client, {
      consignment_id: data.consignment_id,
      partner_id: data.partner_id,
      quantity_sold: data.quantity_sold,
      sale_price: data.sale_price,
      sale_date: data.sale_date,
      notes: data.notes,
    });

    await repo.incrementConsignmentSold(
      client,
      data.consignment_id,
      data.quantity_sold,
    );

    // Deduct from the partner's location — stock has left the building.
    const partnerLocation = await repo.findPartnerLocation(
      client,
      data.partner_id,
    );
    // A partner only gets a stock_location lazily, on their first
    // dispatch. If we're recording a SALE there must already have
    // been a dispatch, so a null location here means inconsistent
    // data. Fail with a clear message rather than letting
    // recordMovement throw the generic "Outbound movements require a
    // fromLocationId".
    if (!partnerLocation) {
      throw Object.assign(
        new Error(
          "This partner has no stock location — no goods were ever " +
            "dispatched to them, so a sale cannot be reported. Check " +
            "the consignment record.",
        ),
        { status: 409 },
      );
    }
    await movements.recordMovement(client, {
      business,
      productId: consignment.product_id,
      movementType: "consignment_sale",
      quantity: data.quantity_sold,
      direction: -1,
      fromLocationId: partnerLocation.location_id,
      referenceType: "consignment_sale",
      referenceId: sale.sale_id,
      performedBy: user.user_id,
    });

    // Refresh the cached balance.
    const balance = await repo.calculatePartnerBalance(client, data.partner_id);
    await repo.updatePartnerCachedBalance(
      client,
      data.partner_id,
      balance.outstanding_balance,
    );

    return { sale, partner_balance: balance };
  });
}

async function listPartnerSales(business, query) {
  return withBusinessContext(business, (client) =>
    repo.listConsignmentSales(client, {
      partnerId: query.partner_id,
      periodStart: query.period_start,
      periodEnd: query.period_end,
    }),
  );
}

// ─────────────────────────────────────────────────────────────
// CONSIGNMENT RECALL — bring stock back from the partner.
// ─────────────────────────────────────────────────────────────

async function recallConsignment(business, consignmentId, data, user) {
  return withBusinessContext(business, async (client) => {
    const consignment = await repo.findConsignmentById(client, consignmentId);
    if (!consignment)
      throw Object.assign(new Error("Consignment record not found"), {
        status: 404,
      });
    const recallQty = data.quantity || consignment.quantity_outstanding;
    if (recallQty > consignment.quantity_outstanding) {
      throw Object.assign(
        new Error(
          `Cannot recall ${recallQty} — only ${consignment.quantity_outstanding} outstanding`,
        ),
        { status: 409 },
      );
    }

    const partnerLocation = await repo.findPartnerLocation(
      client,
      consignment.partner_id,
    );

    // Out of the partner location, back into ours.
    await movements.recordMovement(client, {
      business,
      productId: consignment.product_id,
      movementType: "returned_from_consignment",
      quantity: recallQty,
      direction: -1,
      fromLocationId: partnerLocation?.location_id,
      referenceType: "consignment_recall",
      referenceId: consignmentId,
      performedBy: user.user_id,
    });
    await movements.recordMovement(client, {
      business,
      productId: consignment.product_id,
      movementType: "transferred_in",
      quantity: recallQty,
      direction: 1,
      toLocationId: data.return_to_location_id,
      referenceType: "consignment_recall",
      referenceId: consignmentId,
      performedBy: user.user_id,
    });

    await repo.incrementConsignmentReturned(client, consignmentId, recallQty);
    if (recallQty === consignment.quantity_outstanding) {
      await repo.recallConsignment(client, consignmentId);
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "retail_partners",
      action: "recall_consignment",
      table: "consignment_stock",
      recordId: consignmentId,
      metadata: { quantity_recalled: recallQty },
    });

    return { consignment_id: consignmentId, quantity_recalled: recallQty };
  });
}

// ─────────────────────────────────────────────────────────────
// SETTLEMENT — periodic reconciliation
// Aggregates consignment_sales in the period, calculates partner
// commission, generates a settlement statement.
// ─────────────────────────────────────────────────────────────

async function generateSettlement(business, data, user) {
  return withBusinessContext(business, async (client) => {
    const partner = await repo.findPartnerById(client, data.partner_id);
    if (!partner)
      throw Object.assign(new Error("Partner not found"), { status: 404 });

    const sales = await repo.listConsignmentSales(client, {
      partnerId: data.partner_id,
      periodStart: data.period_start,
      periodEnd: data.period_end,
    });

    if (!sales.length) {
      throw Object.assign(
        new Error("No consignment sales found in the specified period"),
        { status: 400 },
      );
    }

    const totalSalesValue = sales.reduce(
      (sum, s) => sum + parseFloat(s.quantity_sold) * parseFloat(s.sale_price),
      0,
    );
    const marginPct = parseFloat(partner.consignment_margin_pct) || 0;
    const partnerCommission = parseFloat(
      ((totalSalesValue * marginPct) / 100).toFixed(2),
    );
    const amountDue = parseFloat(
      (totalSalesValue - partnerCommission).toFixed(2),
    );

    const settlementNumber = await nextDocumentNumber(
      client,
      business,
      "settlement",
    );

    const settlement = await repo.insertSettlement(client, {
      settlement_number: settlementNumber,
      partner_id: data.partner_id,
      period_start: data.period_start,
      period_end: data.period_end,
      total_sales_value: totalSalesValue.toFixed(2),
      partner_commission: partnerCommission,
      amount_due_to_us: amountDue,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "retail_partners",
      action: "generate_settlement",
      table: "partner_settlements",
      recordId: settlement.settlement_id,
      after: settlement,
    });

    emitToBusiness(business, "partner:settlement_generated", {
      partnerId: data.partner_id,
      settlementId: settlement.settlement_id,
      amountDue,
    });

    return settlement;
  });
}

async function listSettlements(business, query) {
  return withBusinessContext(business, (client) =>
    repo.listSettlements(client, {
      partnerId: query.partner_id,
      status: query.status,
    }),
  );
}

async function getSettlement(business, settlementId) {
  return withBusinessContext(business, async (client) => {
    const settlement = await repo.findSettlementById(client, settlementId);
    if (!settlement)
      throw Object.assign(new Error("Settlement not found"), { status: 404 });
    return settlement;
  });
}

async function markSettlementSent(business, settlementId, user) {
  return withBusinessContext(business, async (client) => {
    const after = await repo.updateSettlementStatus(client, settlementId, {
      status: "sent",
    });
    if (!after)
      throw Object.assign(new Error("Settlement not found"), { status: 404 });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "retail_partners",
      action: "send_settlement",
      table: "partner_settlements",
      recordId: settlementId,
      after,
    });
    return after;
  });
}

async function markSettlementPaid(business, settlementId, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findSettlementById(client, settlementId);
    if (!before)
      throw Object.assign(new Error("Settlement not found"), { status: 404 });
    const after = await repo.updateSettlementStatus(client, settlementId, {
      status: "paid",
    });

    // Refresh cached balance — paid settlements no longer count as outstanding.
    const balance = await repo.calculatePartnerBalance(
      client,
      before.partner_id,
    );
    await repo.updatePartnerCachedBalance(
      client,
      before.partner_id,
      balance.outstanding_balance,
    );

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "retail_partners",
      action: "mark_settlement_paid",
      table: "partner_settlements",
      recordId: settlementId,
      before,
      after,
    });

    return { ...after, balance };
  });
}

// ─────────────────────────────────────────────────────────────
// WHOLESALE — outright sale to a partner (no consignment tracking).
// Stock is permanently deducted; an invoice is generated separately
// by the invoicing module. This endpoint records the stock side.
// ─────────────────────────────────────────────────────────────

async function recordWholesaleDispatch(business, data, user) {
  return withBusinessContext(business, async (client) => {
    const partner = await repo.findPartnerById(client, data.partner_id);
    if (!partner)
      throw Object.assign(new Error("Partner not found"), { status: 404 });
    if (partner.arrangement_type === "consignment") {
      throw Object.assign(
        new Error(
          "This partner is consignment-only — use the consignment endpoint",
        ),
        { status: 400 },
      );
    }

    const dispatched = [];
    let totalValue = 0;
    let totalCost = 0;

    for (const item of data.items) {
      const { available_qty } = await movements.getAvailableQty(
        client,
        item.product_id,
        data.from_location_id,
      );
      if (available_qty < item.quantity) {
        throw Object.assign(
          new Error(
            `Insufficient stock for product ${item.product_id} — only ${available_qty} available`,
          ),
          { status: 409 },
        );
      }
      const cogs = await valuation.calculateLineCOGS(client, {
        productId: item.product_id,
        quantity: item.quantity,
      });
      const lineValue = parseFloat(item.unit_price) * item.quantity;

      await movements.recordMovement(client, {
        business,
        productId: item.product_id,
        movementType: "wholesale_out",
        quantity: item.quantity,
        direction: -1,
        fromLocationId: data.from_location_id,
        referenceType: "wholesale",
        referenceId: data.partner_id,
        unitCost: cogs.unit_cost,
        performedBy: user.user_id,
      });

      dispatched.push({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_value: lineValue,
        line_cost: cogs.line_cost,
      });
      totalValue += lineValue;
      totalCost += cogs.line_cost;
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "retail_partners",
      action: "wholesale_dispatch",
      table: "stock_movements",
      recordId: data.partner_id,
      after: { items: dispatched.length, total_value: totalValue },
    });

    return {
      partner_id: data.partner_id,
      items: dispatched,
      total_value: parseFloat(totalValue.toFixed(2)),
      total_cost: parseFloat(totalCost.toFixed(2)),
    };
  });
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────

async function getPartnerDashboard(business, partnerId) {
  return withBusinessContext(business, (client) =>
    repo.getPartnerDashboard(client, partnerId),
  );
}

async function getAllPartnersOverview(business) {
  return withBusinessContext(business, async (client) => {
    const { data: partners } = {
      data: await repo.listPartners(client, {
        search: null,
        arrangementType: null,
        isActive: true,
        limit: 1000,
        offset: 0,
      }),
    };
    const enriched = [];
    for (const p of partners) {
      const dash = await repo.getPartnerDashboard(client, p.partner_id);
      const balance = await repo.calculatePartnerBalance(client, p.partner_id);
      enriched.push({
        ...p,
        ...dash,
        outstanding_balance: balance.outstanding_balance,
      });
    }
    return { data: enriched };
  });
}

module.exports = {
  // partners
  listPartners,
  getPartner,
  createPartner,
  updatePartner,
  deactivatePartner,
  // consignment
  sendConsignment,
  listConsignmentStock,
  recallConsignment,
  // partner sales
  reportPartnerSale,
  listPartnerSales,
  // settlements
  generateSettlement,
  listSettlements,
  getSettlement,
  markSettlementSent,
  markSettlementPaid,
  // wholesale
  recordWholesaleDispatch,
  // dashboard
  getPartnerDashboard,
  getAllPartnersOverview,
};
