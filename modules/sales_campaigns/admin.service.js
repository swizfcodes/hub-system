"use strict";
// ── admin.service.js ──────────────────────────────────────────────────────────

const { withBusinessContext, nextDocumentNumber } = require("../../config/db");
const auditService = require("../../shared/audit/audit.service");
const notifService = require("../../shared/notifications/notifications.service");
const loyaltyService = require("../loyalty/loyalty.service");
const documentsService = require("../../shared/documents/documents.service");
const stockService = require("../stock/stock.service");
const journalService = require("../accounting/journal.service");
const { getVatRate } = require("../../config/businesses");
const repo = require("./campaigns.repository");
const logger = require("../../config/logger");

// ── CAMPAIGNS ─────────────────────────────────────────────────────────────────

async function listCampaigns(business, query) {
  return withBusinessContext(business, async (client) => {
    const rows = await repo.listCampaigns(client, {
      status: query.status || null,
      limit: parseInt(query.limit || 20),
      offset:
        parseInt(query.page || 1) > 1 ? (parseInt(query.page) - 1) * 20 : 0,
    });
    return { data: rows };
  });
}

async function getCampaign(business, campaignId) {
  return withBusinessContext(business, async (client) => {
    const campaign = await repo.findCampaignById(client, campaignId);
    if (!campaign)
      throw Object.assign(new Error("Campaign not found"), { status: 404 });
    return campaign;
  });
}

async function createCampaign(business, data, user) {
  // Validate slug uniqueness and format
  if (!data.slug || !/^[a-z0-9-]+$/.test(data.slug)) {
    throw Object.assign(
      new Error(
        "slug must contain only lowercase letters, numbers, and hyphens",
      ),
      { status: 400 },
    );
  }

  return withBusinessContext(business, async (client) => {
    const existing = await repo.findCampaignBySlug(client, data.slug);
    if (existing)
      throw Object.assign(new Error(`Slug "${data.slug}" is already in use`), {
        status: 409,
      });

    const campaign = await repo.insertCampaign(client, {
      ...data,
      created_by: user.user_id,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "sales_campaigns",
      action: "create",
      table: "sales_campaigns",
      recordId: campaign.campaign_id,
      after: campaign,
    });

    logger.info(
      `[sales_campaigns] created "${campaign.campaign_name}" slug=${campaign.slug}`,
    );
    return campaign;
  });
}

async function updateCampaign(business, campaignId, data, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findCampaignById(client, campaignId);
    if (!before)
      throw Object.assign(new Error("Campaign not found"), { status: 404 });

    // Prevent editing live campaigns' slug
    if (before.status === "live" && data.slug && data.slug !== before.slug) {
      throw Object.assign(new Error("Cannot change slug of a live campaign"), {
        status: 400,
      });
    }

    const campaign = await repo.updateCampaign(client, campaignId, data);

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "sales_campaigns",
      action: "edit",
      table: "sales_campaigns",
      recordId: campaignId,
      before,
      after: campaign,
    });

    return campaign;
  });
}

async function publishCampaign(business, campaignId, user) {
  return withBusinessContext(business, async (client) => {
    const campaign = await repo.findCampaignById(client, campaignId);
    if (!campaign)
      throw Object.assign(new Error("Campaign not found"), { status: 404 });
    if (!["draft", "scheduled", "expired"].includes(campaign.status)) {
      throw Object.assign(
        new Error(`Cannot publish a campaign in status '${campaign.status}'`),
        { status: 400 },
      );
    }
    if (!campaign.products?.length) {
      throw Object.assign(
        new Error("Add at least one product before publishing"),
        { status: 400 },
      );
    }

    const now = new Date();
    const status =
      campaign.start_date && new Date(campaign.start_date) > now
        ? "scheduled"
        : "live";
    const updated = await repo.updateCampaign(client, campaignId, { status });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "sales_campaigns",
      action: "approve",
      table: "sales_campaigns",
      recordId: campaignId,
      after: { status },
    });

    logger.info(
      `[sales_campaigns] published "${campaign.campaign_name}" → status=${status}`,
    );
    return updated;
  });
}

async function expireCampaign(business, campaignId, user) {
  return withBusinessContext(business, async (client) => {
    const updated = await repo.updateCampaign(client, campaignId, {
      status: "expired",
    });
    if (!updated)
      throw Object.assign(new Error("Campaign not found"), { status: 404 });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "sales_campaigns",
      action: "edit",
      table: "sales_campaigns",
      recordId: campaignId,
      after: { status: "expired" },
    });
    return updated;
  });
}

// ── PRODUCTS ──────────────────────────────────────────────────────────────────

async function upsertProduct(business, campaignId, data, user) {
  return withBusinessContext(business, async (client) => {
    const row = await repo.upsertCampaignProduct(client, campaignId, data);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "sales_campaigns",
      action: "edit",
      table: "campaign_products",
      recordId: campaignId,
      after: row,
    });
    return row;
  });
}

async function removeProduct(business, campaignId, productId, user) {
  return withBusinessContext(business, async (client) => {
    const removed = await repo.removeCampaignProduct(
      client,
      campaignId,
      productId,
    );
    if (!removed)
      throw Object.assign(new Error("Product not in campaign"), {
        status: 404,
      });
    return { removed: true };
  });
}

// ── BANK ACCOUNTS ─────────────────────────────────────────────────────────────

async function addBankAccount(business, campaignId, data, user) {
  return withBusinessContext(business, async (client) => {
    return repo.insertBankAccount(client, campaignId, data);
  });
}

async function removeBankAccount(business, campaignId, accountId, user) {
  return withBusinessContext(business, async (client) => {
    const removed = await repo.deleteBankAccount(client, accountId, campaignId);
    if (!removed)
      throw Object.assign(new Error("Bank account not found"), { status: 404 });
    return { removed: true };
  });
}

// ── ORDERS (admin) ────────────────────────────────────────────────────────────

async function listOrders(business, campaignId, query) {
  return withBusinessContext(business, async (client) => {
    const rows = await repo.listOrders(client, {
      campaignId: campaignId || null,
      status: query.status || null,
      limit: parseInt(query.limit || 50),
      offset: (parseInt(query.page || 1) - 1) * parseInt(query.limit || 50),
    });
    return { data: rows };
  });
}

async function confirmOrder(business, orderId, user) {
  return withBusinessContext(business, async (client) => {
    const {
      rows: [order],
    } = await client.query(
      `SELECT co.*, json_agg(coi.*) AS items
       FROM campaign_orders co
       LEFT JOIN campaign_order_items coi ON coi.order_id = co.order_id
       WHERE co.order_id = $1 GROUP BY co.order_id`,
      [orderId],
    );
    if (!order)
      throw Object.assign(new Error("Order not found"), { status: 404 });
    if (order.status !== "proof_submitted") {
      throw Object.assign(
        new Error(
          `Order must be in proof_submitted status, got: ${order.status}`,
        ),
        { status: 400 },
      );
    }

    const items = order.items || [];

    // Look up the default stock location (needed for stock movements)
    const { rows: [defaultLoc] } = await client.query(
      `SELECT location_id FROM stock_locations WHERE is_active = true ORDER BY created_at LIMIT 1`,
    );
    const defaultLocationId = defaultLoc?.location_id || null;

    // Confirm campaign stock counters: move from reserved → sold
    for (const item of items) {
      await repo.confirmCampaignStock(
        client,
        item.campaign_product_id,
        item.quantity,
      );
    }

    // ── 1. ERP Stock: deduct from main stock_movements ──────────────────
    for (const item of items) {
      if (!item.product_id) continue;
      try {
        await stockService.recordMovement(client, {
          business,
          productId: item.product_id,
          movementType: "sold",
          quantity: item.quantity,
          direction: -1,
          fromLocationId: defaultLocationId,
          referenceType: "campaign_order",
          referenceId: orderId,
          performedBy: user.user_id,
        });
      } catch (err) {
        logger.error(
          `[sales_campaigns] stock movement failed for order ${orderId}, ` +
            `product ${item.product_id}: ${err.message}`,
        );
        throw err;
      }
    }

    // ── 2. Auto-create contact in CRM if needed ─────────────────────────
    let contactId = order.hub_contact_id;
    if (!contactId) {
      const {
        rows: [existing],
      } = await client.query(
        `SELECT contact_id FROM shared.contacts WHERE primary_phone = $1 AND is_deleted = false LIMIT 1`,
        [order.customer_phone],
      );
      if (existing) {
        contactId = existing.contact_id;
      } else {
        const {
          rows: [newContact],
        } = await client.query(
          `INSERT INTO shared.contacts (display_name, primary_phone, email, contact_type, visible_to)
           VALUES ($1, $2, $3, ARRAY['customer']::text[], ARRAY[$4])
           RETURNING contact_id`,
          [
            order.customer_name,
            order.customer_phone,
            order.customer_email || null,
            business,
          ],
        );
        contactId = newContact.contact_id;
      }
    }

    // ── 3. Revenue journal (DR Bank / CR Sales / CR VAT) ────────────────
    const grossNaira = parseFloat(order.total_amount);
    const vatRate = getVatRate(business);
    const netNaira = parseFloat((grossNaira / (1 + vatRate)).toFixed(2));
    const vatNaira = parseFloat((grossNaira - netNaira).toFixed(2));

    const bankAcc = await journalService.getAccountId(client, "1210");
    const salesAcc = await journalService.getAccountId(client, "4100");
    const vatAcc = await journalService.getAccountId(client, "2210");

    let revenueEntry = null;
    if (bankAcc && salesAcc) {
      const revLines = [
        { account_id: bankAcc, debit: grossNaira, credit: 0 },
        { account_id: salesAcc, debit: 0, credit: netNaira },
      ];
      if (vatAcc && vatNaira > 0) {
        revLines.push({ account_id: vatAcc, debit: 0, credit: vatNaira });
      } else {
        revLines[1].credit = grossNaira;
      }
      revenueEntry = await journalService.postEntry(client, {
        description: `Campaign Sale ${order.order_number}`,
        referenceType: "campaign_order",
        referenceId: orderId,
        postedBy: user.user_id,
        lines: revLines,
      });
    } else {
      logger.error(
        `[sales_campaigns] revenue journal skipped for order ${orderId}: ` +
          `missing COA bank=${bankAcc ? "ok" : "1210"} sales=${salesAcc ? "ok" : "4100"}`,
      );
    }

    // ── 4. COGS journal (DR COGS / CR Inventory) ────────────────────────
    const costable = items
      .filter((l) => l.product_id)
      .map((l) => ({ product_id: l.product_id, quantity: l.quantity }));
    let cogsEntry = null;
    if (costable.length > 0) {
      try {
        const { total_cost } = await stockService.calculateSaleCOGS(
          client,
          costable,
        );
        if (total_cost && total_cost > 0) {
          const cogsAcc = await journalService.getAccountId(client, "5000");
          const invAcc = await journalService.getAccountId(client, "1410");
          if (cogsAcc && invAcc) {
            cogsEntry = await journalService.postEntry(client, {
              description: `COGS for Campaign Sale ${order.order_number}`,
              referenceType: "campaign_order_cogs",
              referenceId: orderId,
              postedBy: user.user_id,
              lines: [
                { account_id: cogsAcc, debit: total_cost, credit: 0 },
                { account_id: invAcc, debit: 0, credit: total_cost },
              ],
            });
          }
        }
      } catch (err) {
        logger.warn(
          `[sales_campaigns] COGS journal skipped for order ${orderId}: ${err.message}`,
        );
      }
    }

    // ── 5. Create or update ERP sales_order + order_lines ─────────────
    // The bridge row may already exist (created at proof submission with
    // status='pending_proof'). If so, UPDATE it. Otherwise INSERT new.
    let salesOrderId = order.hub_order_id || null;
    try {
      if (salesOrderId) {
        // Bridge row exists — update to confirmed
        await client.query(
          `UPDATE sales_orders
           SET status = 'confirmed', contact_id = $2,
               total_amount = $3, amount_paid = $4,
               fulfilment_type = $5, created_by = $6, updated_at = now()
           WHERE order_id = $1`,
          [
            salesOrderId,
            contactId,
            grossNaira,
            grossNaira,
            order.fulfilment_type || "delivery",
            user.user_id,
          ],
        );
        // Clean existing lines (if any from a previous partial attempt)
        await client.query(
          `DELETE FROM order_lines WHERE order_id = $1`,
          [salesOrderId],
        );
      } else {
        // No bridge row — create fresh (backward compatible)
        const orderNumber = await nextDocumentNumber(
          client,
          business,
          "sales_order",
        );

        const {
          rows: [salesOrder],
        } = await client.query(
          `INSERT INTO sales_orders
             (order_number, contact_id, status, fulfilment_type,
              total_amount, amount_paid, source, created_by)
           VALUES ($1, $2, 'confirmed', $3, $4, $4, 'campaign', $5)
           RETURNING order_id, order_number`,
          [
            orderNumber,
            contactId,
            order.fulfilment_type || "delivery",
            grossNaira,
            user.user_id,
          ],
        );
        salesOrderId = salesOrder.order_id;

        // Link campaign order → ERP sales order
        await client.query(
          `UPDATE campaign_orders SET hub_order_id = $2 WHERE order_id = $1`,
          [orderId, salesOrderId],
        );
      }

      // Insert order lines for the confirmed order
      for (const item of items) {
        if (!item.product_id) continue;
        const lineTotal = parseFloat(item.unit_price) * item.quantity;
        await client.query(
          `INSERT INTO order_lines
             (order_id, product_id, description, quantity, unit_price,
              line_total, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'fulfilled')`,
          [
            salesOrderId,
            item.product_id,
            item.product_name,
            item.quantity,
            parseFloat(item.unit_price),
            lineTotal,
          ],
        );
      }
    } catch (err) {
      logger.error(
        `[sales_campaigns] ERP sales order failed for ${orderId}: ${err.message}`,
      );
      throw err;
    }

    // ── 6. Award loyalty points ─────────────────────────────────────────
    const pointsResult = await loyaltyService
      .awardPoints(
        business,
        contactId,
        order.total_amount,
        "campaign_order",
        orderId,
        user,
      )
      .catch(() => null);

    // ── 7. Mark confirmed ───────────────────────────────────────────────
    const updated = await repo.updateOrderStatus(client, orderId, {
      status: "confirmed",
      hubContactId: contactId,
      loyaltyPointsAwarded: pointsResult?.balance_after ? null : undefined,
    });

    // Audit trail
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "sales_campaigns",
      action: "approve",
      table: "campaign_orders",
      recordId: orderId,
      after: {
        ...updated,
        hub_order_id: salesOrderId,
        journal_entry_id:
          revenueEntry?.entry_id || revenueEntry?.entryId || null,
        cogs_entry_id: cogsEntry?.entry_id || cogsEntry?.entryId || null,
      },
    });

    logger.info(
      `[sales_campaigns] order ${order.order_number} confirmed by ${user.email} → ` +
        `ERP sales_order ${salesOrderId}, stock deducted, journals posted`,
    );
    return updated;
  });
}

async function cancelOrder(business, orderId, { reason }, user) {
  return withBusinessContext(business, async (client) => {
    const {
      rows: [order],
    } = await client.query(
      `SELECT co.*, json_agg(coi.*) AS items
       FROM campaign_orders co
       LEFT JOIN campaign_order_items coi ON coi.order_id = co.order_id
       WHERE co.order_id = $1 GROUP BY co.order_id`,
      [orderId],
    );
    if (!order)
      throw Object.assign(new Error("Order not found"), { status: 404 });
    if (["completed", "cancelled"].includes(order.status)) {
      throw Object.assign(
        new Error("Cannot cancel a completed or already-cancelled order"),
        { status: 400 },
      );
    }

    const items = order.items || [];

    // Restore campaign stock counters (reserved → available)
    if (order.status === "proof_submitted") {
      for (const item of items) {
        await repo.restoreCampaignStock(
          client,
          item.campaign_product_id,
          item.quantity,
        );
      }
    }

    // If confirmed, reverse ERP stock + cancel ERP sales order
    if (order.status === "confirmed") {
      // Restore campaign sold counters
      for (const item of items) {
        await client.query(
          `UPDATE campaign_products
           SET quantity_sold = GREATEST(0, quantity_sold - $2)
           WHERE id = $1`,
          [item.campaign_product_id, item.quantity],
        );
      }

      // Look up default location for stock reversal
      const { rows: [cancelLoc] } = await client.query(
        `SELECT location_id FROM stock_locations WHERE is_active = true ORDER BY created_at LIMIT 1`,
      );

      // Reverse stock movements — add stock back
      for (const item of items) {
        if (!item.product_id) continue;
        try {
          await stockService.recordMovement(client, {
            business,
            productId: item.product_id,
            movementType: "return_from_customer",
            quantity: item.quantity,
            direction: 1,
            toLocationId: cancelLoc?.location_id || null,
            referenceType: "campaign_order_cancel",
            referenceId: orderId,
            performedBy: user.user_id,
            notes: `Cancelled: ${reason}`,
          });
        } catch (err) {
          logger.warn(
            `[sales_campaigns] stock reversal failed for cancel ${orderId}: ${err.message}`,
          );
        }
      }

      // Cancel the linked ERP sales order
      if (order.hub_order_id) {
        await client.query(
          `UPDATE sales_orders SET status = 'cancelled', updated_at = now()
           WHERE order_id = $1`,
          [order.hub_order_id],
        );
        await client.query(
          `UPDATE order_lines SET status = 'cancelled'
           WHERE order_id = $1`,
          [order.hub_order_id],
        );
      }
    }

    const updated = await repo.updateOrderStatus(client, orderId, {
      status: "cancelled",
      cancellationReason: reason,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "sales_campaigns",
      action: "delete",
      table: "campaign_orders",
      recordId: orderId,
      after: updated,
    });

    logger.info(
      `[sales_campaigns] order ${order.order_number} cancelled: ${reason}`,
    );
    return updated;
  });
}

async function getAnalytics(business, campaignId) {
  return withBusinessContext(business, async (client) => {
    const rows = await repo.getAnalytics(client, campaignId);
    // Reshape into a summary object
    const summary = {
      page_views: 0,
      unique_visitors: 0,
      whatsapp_taps: 0,
      form_submits: 0,
      orders_placed: 0,
      by_source: {},
    };
    for (const row of rows) {
      if (row.event_type === "page_view") {
        summary.page_views += parseInt(row.total_events);
        summary.unique_visitors = Math.max(
          summary.unique_visitors,
          parseInt(row.unique_ips),
        );
      }
      if (row.event_type === "whatsapp_tap")
        summary.whatsapp_taps += parseInt(row.total_events);
      if (row.event_type === "form_submit")
        summary.form_submits += parseInt(row.total_events);
      if (row.event_type === "order_placed")
        summary.orders_placed += parseInt(row.total_events);
      if (row.source) {
        summary.by_source[row.source] =
          (summary.by_source[row.source] || 0) + parseInt(row.total_events);
      }
    }
    return summary;
  });
}

async function uploadHeroImage(
  business,
  campaignId,
  { buffer, mimeType, originalFilename },
  user,
) {
  return withBusinessContext(business, async (client) => {
    const campaign = await repo.findCampaignById(client, campaignId);
    if (!campaign)
      throw Object.assign(new Error("Campaign not found"), { status: 404 });

    const doc = await documentsService.uploadDocument(
      {
        business,
        buffer,
        mimeType,
        documentType: "product_image", // closest allowed type; campaign images are product-specific
        referenceType: "sales_campaign",
        referenceId: campaignId,
        originalFilename: originalFilename || "hero.jpg",
        title: "Campaign hero image",
      },
      user,
    );

    const imageUrl = `/api/documents/${doc.document_id}/image`;
    const updated = await repo.updateCampaign(client, campaignId, {
      hero_image_url: imageUrl,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "sales_campaigns",
      action: "edit",
      table: "sales_campaigns",
      recordId: campaignId,
      after: { hero_image_url: imageUrl },
    });

    return { url: imageUrl, document_id: doc.document_id };
  });
}

// ── LEADS ─────────────────────────────────────────────────────────────────────

async function listLeads(business, campaignId, { page = 1, limit = 50 } = {}) {
  return withBusinessContext(business, async (client) => {
    const campaign = await repo.findCampaignById(client, campaignId);
    if (!campaign)
      throw Object.assign(new Error("Campaign not found"), { status: 404 });

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const [rows, total] = await Promise.all([
      repo.listLeads(client, { campaignId, business, limit: parseInt(limit), offset }),
      repo.countLeads(client, { campaignId, business }),
    ]);
    return { data: rows, total, page: parseInt(page), limit: parseInt(limit) };
  });
}

// ── QR CODE ───────────────────────────────────────────────────────────────────

async function generateQrCode(business, campaignId, user) {
  const QRCode = require("qrcode");
  const config  = require("../../config/config");

  return withBusinessContext(business, async (client) => {
    const campaign = await repo.findCampaignById(client, campaignId);
    if (!campaign)
      throw Object.assign(new Error("Campaign not found"), { status: 404 });

    // The QR code points to the public join page (frontend SPA route)
    const baseUrl  = config.appBaseUrl || "https://app.orikaliving.com";
    const joinUrl  = `${baseUrl}/join/${business}/${campaign.slug}`;

    // Render as a data URL (PNG) — store the SVG string for download later
    const svgString = await QRCode.toString(joinUrl, {
      type:        "svg",
      margin:      2,
      color:       { dark: "#1a1a1a", light: "#ffffff" },
      errorCorrectionLevel: "H",
    });

    // Store the SVG inline as a data-URI so it can be served without a separate file
    const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svgString).toString("base64")}`;

    const updated = await repo.updateCampaign(client, campaignId, {
      qr_code_url: svgDataUri,
    });

    await auditService.log(client, {
      userId:   user.user_id,
      userName: user.display_name,
      business,
      module:   "sales_campaigns",
      action:   "edit",
      table:    "sales_campaigns",
      recordId: campaignId,
      after:    { qr_code_url: joinUrl },
    });

    logger.info(`[sales_campaigns] QR generated for "${campaign.campaign_name}" → ${joinUrl}`);
    return { qr_code_url: svgDataUri, join_url: joinUrl };
  });
}

module.exports = {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  publishCampaign,
  expireCampaign,
  uploadHeroImage,
  upsertProduct,
  removeProduct,
  addBankAccount,
  removeBankAccount,
  listOrders,
  confirmOrder,
  cancelOrder,
  getAnalytics,
  listLeads,
  generateQrCode,
};

// ── admin.routes.js ───────────────────────────────────────────────────────────
// (appended below for single-file delivery; split in production)

const express = require("express");
const multer = require("multer");
const router = express.Router();
const { body, param, query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const svc = module.exports; // self-reference

// 20 MB inbound cap — large originals are accepted then compressed to WebP
// server-side (see documentsService.uploadDocument → lib/images/optimizeImage),
// so the stored/served hero ends up a fraction of the upload size.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Campaigns CRUD
router.get("/", can("sales_campaigns", "view"), async (req, res, next) => {
  try {
    res.json(await svc.listCampaigns(req.business, req.query));
  } catch (e) {
    next(e);
  }
});
router.post(
  "/",
  can("sales_campaigns", "create"),
  body("campaign_name").isString().notEmpty(),
  body("slug").isString().notEmpty(),
  body("campaign_type").optional().isIn(["online", "popup_event"]),
  body("template").optional().isIn(["minimal", "editorial", "bold"]),
  body("start_date").optional({ checkFalsy: true }).isISO8601(),
  body("end_date").optional({ checkFalsy: true }).isISO8601(),
  validate,
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await svc.createCampaign(req.business, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);
router.get(
  "/:id",
  param("id").isUUID(),
  validate,
  can("sales_campaigns", "view"),
  async (req, res, next) => {
    try {
      res.json(await svc.getCampaign(req.business, req.params.id));
    } catch (e) {
      next(e);
    }
  },
);
router.patch(
  "/:id",
  param("id").isUUID(),
  validate,
  can("sales_campaigns", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await svc.updateCampaign(
          req.business,
          req.params.id,
          req.body,
          req.user,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);
router.post(
  "/:id/publish",
  param("id").isUUID(),
  validate,
  can("sales_campaigns", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await svc.publishCampaign(req.business, req.params.id, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);
router.post(
  "/:id/expire",
  param("id").isUUID(),
  validate,
  can("sales_campaigns", "approve"),
  async (req, res, next) => {
    try {
      res.json(await svc.expireCampaign(req.business, req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);
router.get(
  "/:id/analytics",
  param("id").isUUID(),
  validate,
  can("sales_campaigns", "view"),
  async (req, res, next) => {
    try {
      res.json(await svc.getAnalytics(req.business, req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

// Hero image upload
router.post(
  "/:id/hero-image",
  param("id").isUUID(),
  validate,
  can("sales_campaigns", "edit"),
  upload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file)
        return res.status(400).json({ message: "file is required" });
      const result = await svc.uploadHeroImage(
        req.business,
        req.params.id,
        {
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          originalFilename: req.file.originalname,
        },
        req.user,
      );
      res.json(result);
    } catch (e) {
      next(e);
    }
  },
);
router.put(
  "/:id/products",
  param("id").isUUID(),
  body("product_id").isUUID(),
  validate,
  can("sales_campaigns", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await svc.upsertProduct(
          req.business,
          req.params.id,
          req.body,
          req.user,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);
router.delete(
  "/:id/products/:productId",
  can("sales_campaigns", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await svc.removeProduct(
          req.business,
          req.params.id,
          req.params.productId,
          req.user,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

// Bank accounts
router.post(
  "/:id/bank-accounts",
  param("id").isUUID(),
  body("bank_name").notEmpty(),
  body("account_number").notEmpty(),
  body("account_name").notEmpty(),
  validate,
  can("sales_campaigns", "edit"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await svc.addBankAccount(
            req.business,
            req.params.id,
            req.body,
            req.user,
          ),
        );
    } catch (e) {
      next(e);
    }
  },
);
router.delete(
  "/:id/bank-accounts/:accountId",
  can("sales_campaigns", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await svc.removeBankAccount(
          req.business,
          req.params.id,
          req.params.accountId,
          req.user,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

// Orders
router.get(
  "/:id/orders",
  param("id").isUUID(),
  validate,
  can("sales_campaigns", "view"),
  async (req, res, next) => {
    try {
      res.json(await svc.listOrders(req.business, req.params.id, req.query));
    } catch (e) {
      next(e);
    }
  },
);
router.post(
  "/orders/:orderId/confirm",
  can("sales_campaigns", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await svc.confirmOrder(req.business, req.params.orderId, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);
router.post(
  "/orders/:orderId/cancel",
  can("sales_campaigns", "approve"),
  body("reason").notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      res.json(
        await svc.cancelOrder(
          req.business,
          req.params.orderId,
          req.body,
          req.user,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

// GET /sales-campaigns/:id/leads
router.get(
  "/:id/leads",
  param("id").isUUID(),
  validate,
  can("sales_campaigns", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await svc.listLeads(req.business, req.params.id, {
          page:  req.query.page  || 1,
          limit: req.query.limit || 50,
        }),
      );
    } catch (e) {
      next(e);
    }
  },
);

// POST /sales-campaigns/:id/qr-code
router.post(
  "/:id/qr-code",
  param("id").isUUID(),
  validate,
  can("sales_campaigns", "edit"),
  async (req, res, next) => {
    try {
      res.json(await svc.generateQrCode(req.business, req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

module.exports.adminRouter = router;
