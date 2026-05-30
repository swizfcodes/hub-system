'use strict';
// ── admin.service.js ──────────────────────────────────────────────────────────

const { withBusinessContext, nextDocumentNumber } = require('../../config/db');
const auditService    = require('../../shared/audit/audit.service');
const notifService    = require('../../shared/notifications/notifications.service');
const loyaltyService  = require('../loyalty/loyalty.service');
const repo            = require('./campaigns.repository');
const logger          = require('../../config/logger');

// ── CAMPAIGNS ─────────────────────────────────────────────────────────────────

async function listCampaigns(business, query) {
  return withBusinessContext(business, async (client) => {
    const rows = await repo.listCampaigns(client, {
      status: query.status || null,
      limit:  parseInt(query.limit  || 20),
      offset: parseInt(query.page   || 1) > 1 ? (parseInt(query.page) - 1) * 20 : 0,
    });
    return { data: rows };
  });
}

async function getCampaign(business, campaignId) {
  return withBusinessContext(business, async (client) => {
    const campaign = await repo.findCampaignById(client, campaignId);
    if (!campaign) throw Object.assign(new Error('Campaign not found'), { status: 404 });
    return campaign;
  });
}

async function createCampaign(business, data, user) {
  // Validate slug uniqueness and format
  if (!data.slug || !/^[a-z0-9-]+$/.test(data.slug)) {
    throw Object.assign(
      new Error('slug must contain only lowercase letters, numbers, and hyphens'), { status: 400 }
    );
  }

  return withBusinessContext(business, async (client) => {
    const existing = await repo.findCampaignBySlug(client, data.slug);
    if (existing) throw Object.assign(new Error(`Slug "${data.slug}" is already in use`), { status: 409 });

    const campaign = await repo.insertCampaign(client, { ...data, created_by: user.user_id });

    await auditService.log(client, {
      userId: user.user_id, userName: user.display_name,
      business, module: 'sales_campaigns', action: 'create',
      table: 'sales_campaigns', recordId: campaign.campaign_id, after: campaign,
    });

    logger.info(`[sales_campaigns] created "${campaign.campaign_name}" slug=${campaign.slug}`);
    return campaign;
  });
}

async function updateCampaign(business, campaignId, data, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findCampaignById(client, campaignId);
    if (!before) throw Object.assign(new Error('Campaign not found'), { status: 404 });

    // Prevent editing live campaigns' slug
    if (before.status === 'live' && data.slug && data.slug !== before.slug) {
      throw Object.assign(new Error('Cannot change slug of a live campaign'), { status: 400 });
    }

    const campaign = await repo.updateCampaign(client, campaignId, data);

    await auditService.log(client, {
      userId: user.user_id, userName: user.display_name,
      business, module: 'sales_campaigns', action: 'edit',
      table: 'sales_campaigns', recordId: campaignId, before, after: campaign,
    });

    return campaign;
  });
}

async function publishCampaign(business, campaignId, user) {
  return withBusinessContext(business, async (client) => {
    const campaign = await repo.findCampaignById(client, campaignId);
    if (!campaign) throw Object.assign(new Error('Campaign not found'), { status: 404 });
    if (!['draft', 'scheduled'].includes(campaign.status)) {
      throw Object.assign(new Error(`Cannot publish a campaign in status '${campaign.status}'`), { status: 400 });
    }
    if (!campaign.products?.length) {
      throw Object.assign(new Error('Add at least one product before publishing'), { status: 400 });
    }

    const now = new Date();
    const status = campaign.start_date && new Date(campaign.start_date) > now ? 'scheduled' : 'live';
    const updated = await repo.updateCampaign(client, campaignId, { status });

    await auditService.log(client, {
      userId: user.user_id, userName: user.display_name,
      business, module: 'sales_campaigns', action: 'approve',
      table: 'sales_campaigns', recordId: campaignId, after: { status },
    });

    logger.info(`[sales_campaigns] published "${campaign.campaign_name}" → status=${status}`);
    return updated;
  });
}

async function expireCampaign(business, campaignId, user) {
  return withBusinessContext(business, async (client) => {
    const updated = await repo.updateCampaign(client, campaignId, { status: 'expired' });
    if (!updated) throw Object.assign(new Error('Campaign not found'), { status: 404 });
    await auditService.log(client, {
      userId: user.user_id, userName: user.display_name,
      business, module: 'sales_campaigns', action: 'edit',
      table: 'sales_campaigns', recordId: campaignId, after: { status: 'expired' },
    });
    return updated;
  });
}

// ── PRODUCTS ──────────────────────────────────────────────────────────────────

async function upsertProduct(business, campaignId, data, user) {
  return withBusinessContext(business, async (client) => {
    const row = await repo.upsertCampaignProduct(client, campaignId, data);
    await auditService.log(client, {
      userId: user.user_id, userName: user.display_name,
      business, module: 'sales_campaigns', action: 'edit',
      table: 'campaign_products', recordId: campaignId, after: row,
    });
    return row;
  });
}

async function removeProduct(business, campaignId, productId, user) {
  return withBusinessContext(business, async (client) => {
    const removed = await repo.removeCampaignProduct(client, campaignId, productId);
    if (!removed) throw Object.assign(new Error('Product not in campaign'), { status: 404 });
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
    if (!removed) throw Object.assign(new Error('Bank account not found'), { status: 404 });
    return { removed: true };
  });
}

// ── ORDERS (admin) ────────────────────────────────────────────────────────────

async function listOrders(business, campaignId, query) {
  return withBusinessContext(business, async (client) => {
    const rows = await repo.listOrders(client, {
      campaignId: campaignId || null,
      status: query.status || null,
      limit:  parseInt(query.limit || 50),
      offset: (parseInt(query.page || 1) - 1) * parseInt(query.limit || 50),
    });
    return { data: rows };
  });
}

async function confirmOrder(business, orderId, user) {
  return withBusinessContext(business, async (client) => {
    const { rows: [order] } = await client.query(
      `SELECT co.*, json_agg(coi.*) AS items
       FROM campaign_orders co
       LEFT JOIN campaign_order_items coi ON coi.order_id = co.order_id
       WHERE co.order_id = $1 GROUP BY co.order_id`, [orderId]
    );
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
    if (order.status !== 'proof_submitted') {
      throw Object.assign(new Error(`Order must be in proof_submitted status, got: ${order.status}`), { status: 400 });
    }

    // Confirm stock: move from reserved → sold
    for (const item of (order.items || [])) {
      await repo.confirmCampaignStock(client, item.campaign_product_id, item.quantity);
    }

    // Auto-create contact in CRM if needed
    let contactId = order.hub_contact_id;
    if (!contactId) {
      const { rows: [existing] } = await client.query(
        `SELECT contact_id FROM shared.contacts WHERE primary_phone = $1 AND is_deleted = false LIMIT 1`,
        [order.customer_phone]
      );
      if (existing) {
        contactId = existing.contact_id;
      } else {
        const { rows: [newContact] } = await client.query(
          `INSERT INTO shared.contacts (display_name, primary_phone, primary_email, contact_type, visible_to)
           VALUES ($1, $2, $3, ARRAY['customer']::text[], ARRAY[$4])
           RETURNING contact_id`,
          [order.customer_name, order.customer_phone, order.customer_email || null, business]
        );
        contactId = newContact.contact_id;
      }
    }

    // Award loyalty points
    const pointsResult = await loyaltyService.awardPoints(
      business, contactId, order.total_amount,
      'campaign_order', orderId, user
    ).catch(() => null);

    const updated = await repo.updateOrderStatus(client, orderId, {
      status: 'confirmed',
      hubContactId: contactId,
      loyaltyPointsAwarded: pointsResult?.balance_after ? null : undefined,
    });

    // Notify staff
    await auditService.log(client, {
      userId: user.user_id, userName: user.display_name,
      business, module: 'sales_campaigns', action: 'approve',
      table: 'campaign_orders', recordId: orderId, after: updated,
    });

    logger.info(`[sales_campaigns] order ${order.order_number} confirmed by ${user.email}`);
    return updated;
  });
}

async function cancelOrder(business, orderId, { reason }, user) {
  return withBusinessContext(business, async (client) => {
    const { rows: [order] } = await client.query(
      `SELECT co.*, json_agg(coi.*) AS items
       FROM campaign_orders co
       LEFT JOIN campaign_order_items coi ON coi.order_id = co.order_id
       WHERE co.order_id = $1 GROUP BY co.order_id`, [orderId]
    );
    if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
    if (['completed', 'cancelled'].includes(order.status)) {
      throw Object.assign(new Error('Cannot cancel a completed or already-cancelled order'), { status: 400 });
    }

    // Restore reserved stock
    for (const item of (order.items || [])) {
      if (order.status === 'proof_submitted') {
        await repo.restoreCampaignStock(client, item.campaign_product_id, item.quantity);
      }
    }

    const updated = await repo.updateOrderStatus(client, orderId, {
      status: 'cancelled',
      cancellationReason: reason,
    });

    await auditService.log(client, {
      userId: user.user_id, userName: user.display_name,
      business, module: 'sales_campaigns', action: 'delete',
      table: 'campaign_orders', recordId: orderId, after: updated,
    });

    logger.info(`[sales_campaigns] order ${order.order_number} cancelled: ${reason}`);
    return updated;
  });
}

async function getAnalytics(business, campaignId) {
  return withBusinessContext(business, async (client) => {
    const rows = await repo.getAnalytics(client, campaignId);
    // Reshape into a summary object
    const summary = { page_views: 0, unique_visitors: 0, whatsapp_taps: 0, form_submits: 0, orders_placed: 0, by_source: {} };
    for (const row of rows) {
      if (row.event_type === 'page_view') {
        summary.page_views += parseInt(row.total_events);
        summary.unique_visitors = Math.max(summary.unique_visitors, parseInt(row.unique_ips));
      }
      if (row.event_type === 'whatsapp_tap') summary.whatsapp_taps += parseInt(row.total_events);
      if (row.event_type === 'form_submit')  summary.form_submits  += parseInt(row.total_events);
      if (row.event_type === 'order_placed') summary.orders_placed += parseInt(row.total_events);
      if (row.source) {
        summary.by_source[row.source] = (summary.by_source[row.source] || 0) + parseInt(row.total_events);
      }
    }
    return summary;
  });
}

module.exports = {
  listCampaigns, getCampaign, createCampaign, updateCampaign,
  publishCampaign, expireCampaign,
  upsertProduct, removeProduct,
  addBankAccount, removeBankAccount,
  listOrders, confirmOrder, cancelOrder,
  getAnalytics,
};

// ── admin.routes.js ───────────────────────────────────────────────────────────
// (appended below for single-file delivery; split in production)

const express = require('express');
const router  = express.Router();
const { body, param, query } = require('express-validator');
const validate = require('../../middleware/validateBody');
const { can }  = require('../../middleware/permissions');
const svc      = module.exports; // self-reference (works because exports is set above)

// Campaigns CRUD
router.get('/',       can('sales_campaigns','view'),   async (req,res,next) => { try { res.json(await svc.listCampaigns(req.business, req.query)); } catch(e) { next(e); }});
router.post('/',      can('sales_campaigns','create'),
  body('campaign_name').isString().notEmpty(),
  body('slug').isString().notEmpty(),
  body('template').optional().isIn(['minimal','editorial','bold']),
  body('start_date').optional().isISO8601(),
  body('end_date').optional().isISO8601(),
  validate,
  async (req,res,next) => { try { res.status(201).json(await svc.createCampaign(req.business, req.body, req.user)); } catch(e) { next(e); }});
router.get('/:id',    param('id').isUUID(), validate, can('sales_campaigns','view'),   async (req,res,next) => { try { res.json(await svc.getCampaign(req.business, req.params.id)); } catch(e) { next(e); }});
router.patch('/:id',  param('id').isUUID(), validate, can('sales_campaigns','edit'),   async (req,res,next) => { try { res.json(await svc.updateCampaign(req.business, req.params.id, req.body, req.user)); } catch(e) { next(e); }});
router.post('/:id/publish', param('id').isUUID(), validate, can('sales_campaigns','approve'), async (req,res,next) => { try { res.json(await svc.publishCampaign(req.business, req.params.id, req.user)); } catch(e) { next(e); }});
router.post('/:id/expire',  param('id').isUUID(), validate, can('sales_campaigns','approve'), async (req,res,next) => { try { res.json(await svc.expireCampaign(req.business, req.params.id, req.user)); } catch(e) { next(e); }});
router.get('/:id/analytics', param('id').isUUID(), validate, can('sales_campaigns','view'), async (req,res,next) => { try { res.json(await svc.getAnalytics(req.business, req.params.id)); } catch(e) { next(e); }});

// Products
router.put('/:id/products', param('id').isUUID(), body('product_id').isUUID(), validate, can('sales_campaigns','edit'), async (req,res,next) => { try { res.json(await svc.upsertProduct(req.business, req.params.id, req.body, req.user)); } catch(e) { next(e); }});
router.delete('/:id/products/:productId', can('sales_campaigns','edit'), async (req,res,next) => { try { res.json(await svc.removeProduct(req.business, req.params.id, req.params.productId, req.user)); } catch(e) { next(e); }});

// Bank accounts
router.post('/:id/bank-accounts', param('id').isUUID(), body('bank_name').notEmpty(), body('account_number').notEmpty(), body('account_name').notEmpty(), validate, can('sales_campaigns','edit'), async (req,res,next) => { try { res.status(201).json(await svc.addBankAccount(req.business, req.params.id, req.body, req.user)); } catch(e) { next(e); }});
router.delete('/:id/bank-accounts/:accountId', can('sales_campaigns','edit'), async (req,res,next) => { try { res.json(await svc.removeBankAccount(req.business, req.params.id, req.params.accountId, req.user)); } catch(e) { next(e); }});

// Orders
router.get('/:id/orders', param('id').isUUID(), validate, can('sales_campaigns','view'), async (req,res,next) => { try { res.json(await svc.listOrders(req.business, req.params.id, req.query)); } catch(e) { next(e); }});
router.post('/orders/:orderId/confirm', can('sales_campaigns','approve'), async (req,res,next) => { try { res.json(await svc.confirmOrder(req.business, req.params.orderId, req.user)); } catch(e) { next(e); }});
router.post('/orders/:orderId/cancel',  can('sales_campaigns','approve'), body('reason').notEmpty(), validate, async (req,res,next) => { try { res.json(await svc.cancelOrder(req.business, req.params.orderId, req.body, req.user)); } catch(e) { next(e); }});

module.exports.adminRouter = router;
