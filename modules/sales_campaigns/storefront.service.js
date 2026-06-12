"use strict";
// ── storefront.service.js — PUBLIC, no auth ───────────────────────────────────

const {
  withBusinessContext,
  withSharedContext,
  nextDocumentNumber,
} = require("../../config/db");
const notifService = require("../../shared/notifications/notifications.service");
const loyaltyService = require("../loyalty/loyalty.service");
const repo = require("./campaigns.repository");
const logger = require("../../config/logger");
const crypto = require("crypto");
const config = require("../../config/config");
const axios = require("axios");
const optimusService = require("../../integrations/optimus/optimus.service");
const businesses = require("../../config/businesses");
const { sendEmail } = require("../../lib/email/sender");
const { renderEmail } = require("../../lib/email/render");

// ── LANDING PAGE DATA ─────────────────────────────────────────────────────────

async function getPage(business, slug) {
  return withBusinessContext(business, async (client) => {
    const campaign = await repo.getStorefrontCampaign(client, slug);
    if (!campaign)
      throw Object.assign(new Error("Page not found"), { status: 404 });

    // Auto-expire if past end_date
    if (
      !campaign.is_evergreen &&
      campaign.end_date &&
      new Date(campaign.end_date) < new Date()
    ) {
      if (campaign.status === "live") {
        await repo.updateCampaign(client, campaign.campaign_id, {
          status: "expired",
        });
        campaign.status = "expired";
      }
    }

    // Auto-activate if past start_date
    if (
      campaign.status === "scheduled" &&
      campaign.start_date &&
      new Date(campaign.start_date) <= new Date()
    ) {
      await repo.updateCampaign(client, campaign.campaign_id, {
        status: "live",
      });
      campaign.status = "live";
    }

    if (!["live", "expired"].includes(campaign.status)) {
      throw Object.assign(
        new Error("This campaign is not currently available"),
        { status: 404 },
      );
    }

    return campaign;
  });
}

// ── ANALYTICS TRACKING ────────────────────────────────────────────────────────

async function trackEvent(
  business,
  slug,
  { event_type, product_id, source, session_id },
  req,
) {
  // `business` is interpolated into the schema-qualified table name below,
  // so it MUST be an allow-listed tenant key — never raw user input. This
  // both blocks SQL injection via the schema name and silently ignores
  // analytics pings for unknown tenants.
  if (!businesses.isValidBusiness(business)) return;

  // Hash the IP for privacy (no raw IPs stored)
  const ipHash = crypto
    .createHash("sha256")
    .update(req.ip || "")
    .digest("hex")
    .slice(0, 16);

  return withSharedContext(async (client) => {
    // Find campaign_id from slug — business is validated above
    const {
      rows: [camp],
    } = await client.query(
      `SELECT campaign_id FROM ${business}.sales_campaigns WHERE slug = $1`,
      [slug],
    );
    if (!camp) return;

    await repo.insertAnalyticsEvent(client, {
      campaign_id: camp.campaign_id,
      business,
      slug,
      event_type,
      source: source || null,
      ip_hash: ipHash,
      session_id: session_id || null,
      product_id: product_id || null,
    });
  });
}

// ── INQUIRY / QR LEAD ────────────────────────────────────────────────────────
//
// Handles both the existing inquiry form (lead_type = 'form') and the new
// QR scan capture at physical / popup events (lead_type = 'qr_scan').
// QR leads collect first_name, last_name, phone, email, optional city/state,
// and an opt-in birthday field. Both paths auto-create a CRM contact and
// send a welcome email + in-app staff notification.

async function submitLead(business, slug, data, req) {
  return withBusinessContext(business, async (client) => {
    const campaign = await repo.findCampaignBySlug(client, slug);
    if (!campaign || campaign.status !== "live") {
      throw Object.assign(new Error("Campaign not available"), { status: 400 });
    }

    const firstName  = (data.first_name || "").trim();
    const lastName   = (data.last_name  || "").trim();
    const fullName   = [firstName, lastName].filter(Boolean).join(" ") || data.name || data.phone;
    const leadType   = data.lead_type || "form";

    // ── Auto-create or find CRM contact ──────────────────────
    // Every lead — regardless of whether phone or email was provided —
    // must produce a contact. We match by phone first, then email.
    // This guarantees no lead is ever orphaned from the CRM.
    let contactId = null;
    if (data.phone || data.email) {
      // 1. Try to find an existing contact by phone
      let existing = null;
      if (data.phone) {
        const { rows } = await client.query(
          `SELECT contact_id FROM shared.contacts
           WHERE primary_phone = $1 AND is_deleted = false LIMIT 1`,
          [data.phone],
        );
        existing = rows[0] || null;
      }
      // 2. Fall back to email match if no phone match
      if (!existing && data.email) {
        const { rows } = await client.query(
          `SELECT contact_id FROM shared.contacts
           WHERE email = $1 AND is_deleted = false LIMIT 1`,
          [data.email],
        );
        existing = rows[0] || null;
      }

      if (existing) {
        contactId = existing.contact_id;
        // Enrich the existing contact with any new data we just learned
        await client.query(
          `UPDATE shared.contacts
           SET email         = COALESCE(email, $2),
               primary_phone = COALESCE(primary_phone, $3),
               first_name    = COALESCE(first_name, $4),
               last_name     = COALESCE(last_name, $5),
               birthday_month = CASE WHEN $6::smallint IS NOT NULL AND birthday_month IS NULL
                                     THEN $6::smallint ELSE birthday_month END,
               birthday_day   = CASE WHEN $7::smallint IS NOT NULL AND birthday_day IS NULL
                                     THEN $7::smallint ELSE birthday_day END
           WHERE contact_id = $1`,
          [
            contactId,
            data.email    || null,
            data.phone    || null,
            firstName     || null,
            lastName      || null,
            (data.wants_birthday && data.birthday_month) ? data.birthday_month : null,
            (data.wants_birthday && data.birthday_day)   ? data.birthday_day   : null,
          ],
        );
      } else {
        // Create a new contact — even email-only leads get a record
        const { rows: [newContact] } = await client.query(
          `INSERT INTO shared.contacts
             (display_name, first_name, last_name, primary_phone, email,
              contact_type, source, visible_to,
              birthday_month, birthday_day)
           VALUES ($1,$2,$3,$4,$5,
                   ARRAY['customer']::text[],
                   'campaign_lead',
                   ARRAY[$6],
                   $7, $8)
           RETURNING contact_id`,
          [
            fullName,
            firstName || null,
            lastName  || null,
            data.phone || null,
            data.email || null,
            business,
            (data.wants_birthday && data.birthday_month) ? data.birthday_month : null,
            (data.wants_birthday && data.birthday_day)   ? data.birthday_day   : null,
          ],
        );
        contactId = newContact.contact_id;
      }
    }

    // ── Persist lead ─────────────────────────────────────────
    const lead = await repo.insertLead(client, {
      campaign_id:     campaign.campaign_id,
      business,
      slug,
      first_name:      firstName  || null,
      last_name:       lastName   || null,
      name:            fullName,
      phone:           data.phone   || null,
      email:           data.email   || null,
      message:         data.message || null,
      address_city:    data.address_city  || null,
      address_state:   data.address_state || null,
      wants_birthday:  !!data.wants_birthday,
      birthday_month:  data.wants_birthday ? (data.birthday_month || null) : null,
      birthday_day:    data.wants_birthday ? (data.birthday_day   || null) : null,
      lead_type:       leadType,
      source:          data.source || null,
    });

    if (contactId) await repo.updateLeadContact(client, lead.lead_id, contactId);

    // ── Welcome email (QR scan leads only — and only if email provided) ───
    if (leadType === "qr_scan" && data.email) {
      const shopUrl =
        campaign.redirect_url || config.app.hubBaseUrl;
      try {
        const { subject, html } = renderEmail("walkin_welcome", business, {
          first_name:     firstName || fullName,
          shop_url:       shopUrl,
          wants_birthday: !!(data.wants_birthday && data.birthday_month && data.birthday_day),
          birthday_month: data.birthday_month || null,
          birthday_day:   data.birthday_day   || null,
        });
        await sendEmail({ to: data.email, subject, html, business });
      } catch (emailErr) {
        // Non-fatal — log and continue so the lead is never lost over an email failure
        logger.warn(`[campaign_lead] welcome email failed for ${data.email}: ${emailErr.message}`);
      }
    }

    // ── In-app staff notification ─────────────────────────────
    await notifyStaffOfLead(client, business, campaign, lead, contactId);

    return { submitted: true, lead_id: lead.lead_id };
  });
}

// ── PLACE ORDER ───────────────────────────────────────────────────────────────

async function placeOrder(business, slug, data, req) {
  return withBusinessContext(business, async (client) => {
    const campaign = await repo.findCampaignBySlug(client, slug);
    if (!campaign || campaign.status !== "live") {
      throw Object.assign(new Error("Campaign is no longer active"), {
        status: 400,
      });
    }

    if (!data.items?.length)
      throw Object.assign(new Error("Cart is empty"), { status: 400 });
    if (!data.customer_name || !data.customer_phone) {
      throw Object.assign(new Error("Name and phone are required"), {
        status: 400,
      });
    }

    // ── Validate and reserve stock ────────────────────────────────────────────
    const resolvedItems = [];
    let subtotal = 0,
      discountAmount = 0;

    for (const item of data.items) {
      const {
        rows: [cp],
      } = await client.query(
        `SELECT cp.*, p.name AS product_name, p.selling_price,
                COALESCE(cp.campaign_price, p.selling_price) AS effective_price
         FROM campaign_products cp
         JOIN products p ON p.product_id = cp.product_id
         WHERE cp.id = $1 AND cp.campaign_id = $2`,
        [item.campaign_product_id, campaign.campaign_id],
      );
      if (!cp)
        throw Object.assign(new Error(`Product not found in campaign`), {
          status: 400,
        });

      // Reserve stock
      const reserved = await repo.deductCampaignStock(
        client,
        item.campaign_product_id,
        item.quantity,
      );
      if (!reserved) {
        throw Object.assign(
          new Error(
            `Insufficient stock for "${cp.product_name}" — only ${cp.quantity_available} remaining`,
          ),
          { status: 409 },
        );
      }

      const unitPrice = parseFloat(cp.effective_price);
      const lineDiscount =
        campaign.discount_type === "percentage"
          ? (unitPrice *
              item.quantity *
              parseFloat(campaign.discount_value || 0)) /
            100
          : campaign.discount_type === "fixed_amount"
            ? parseFloat(campaign.discount_value || 0)
            : 0;
      const lineTotal = unitPrice * item.quantity - lineDiscount;

      subtotal += unitPrice * item.quantity;
      discountAmount += lineDiscount;

      resolvedItems.push({
        campaign_product_id: item.campaign_product_id,
        product_id: cp.product_id,
        product_name: cp.product_name,
        quantity: item.quantity,
        unit_price: unitPrice,
        discount_amount: lineDiscount,
        line_total: lineTotal,
      });
    }

    const totalAmount = subtotal - discountAmount;
    const orderNumber = await nextDocumentNumber(
      client,
      business,
      "campaign_order",
    );

    const order = await repo.insertOrder(client, {
      campaign_id: campaign.campaign_id,
      order_number: orderNumber,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      customer_email: data.customer_email || null,
      fulfilment_type: data.fulfilment_type || "delivery",
      delivery_address: data.delivery_address || null,
      pickup_location: campaign.store_location || null,
      payment_method: data.payment_method,
      subtotal,
      discount_amount: discountAmount,
      total_amount: totalAmount,
      source: data.source || null,
      bank_account_id: data.bank_account_id || null,
    });

    for (const item of resolvedItems) {
      await repo.insertOrderItem(client, { order_id: order.order_id, ...item });
    }

    // ── Handle Paystack payment initialisation ────────────────────────────────
    let paystackUrl = null;
    if (data.payment_method === "paystack") {
      paystackUrl = await initializePaystackPayment({
        email: data.customer_email || `${data.customer_phone}@orikahub.com`,
        amount: Math.round(totalAmount * 100), // kobo
        reference: order.order_id,
        metadata: { order_number: orderNumber, campaign_slug: slug, business },
        callback_url: `${config.app.hubBaseUrl}/orders/${order.tracking_token}`,
      });
    }

    // ── Handle Optimus Pay virtual account provisioning ───────────────────────
    let optimusVirtualAccount = null;
    let optimusBankName = null;
    let optimusTransactionRef = null;
    if (data.payment_method === "optimus_pay") {
      try {
        const vaResult = await optimusService.openVirtualAccount({
          amountKobo: Math.round(totalAmount * 100),
          transactionRef: order.order_id,
          description: `Payment for Order ${orderNumber} — ${campaign.campaign_name}`,
          customerRef: order.order_id,
          firstname: (data.customer_name || "Customer").split(" ")[0],
          surname: (data.customer_name || "Customer").split(" ").slice(1).join(" ") || "N/A",
          email: data.customer_email || `${data.customer_phone}@orikahub.com`,
          mobileNo: (data.customer_phone || "").replace(/[^0-9]/g, "") || "2340000000000",
        });
        optimusVirtualAccount = vaResult.accountNumber;
        optimusBankName = vaResult.bankName;
        optimusTransactionRef = vaResult.transactionRef;

        // Persist virtual account details on the order row
        await client.query(
          `UPDATE campaign_orders
           SET optimus_transaction_ref = $1,
               optimus_virtual_account = $2,
               optimus_bank_name       = $3
           WHERE order_id = $4`,
          [optimusTransactionRef, optimusVirtualAccount, optimusBankName, order.order_id],
        );
      } catch (err) {
        logger.error(
          `[storefront] Optimus Pay provisioning failed for order ${orderNumber}: ${err.message}`,
        );
        // Surface error to caller so checkout can fall back gracefully
        throw Object.assign(
          new Error("Could not provision payment account. Please try again or choose another method."),
          { status: 502 },
        );
      }
    }

    // ── Auto-create or find CRM contact for order customer ───────────────────────
    // Every order must have a contact record — match by phone first, then email.
    const orderPhone = data.customer_phone || null;
    const orderEmail = data.customer_email || null;
    if (orderPhone || orderEmail) {
      try {
        const nameParts = (data.customer_name || "").trim().split(/\s+/);
        const orderFirstName = nameParts[0] || null;
        const orderLastName  = nameParts.slice(1).join(" ") || null;

        let orderContact = null;
        if (orderPhone) {
          const { rows } = await client.query(
            `SELECT contact_id FROM shared.contacts
             WHERE primary_phone = $1 AND is_deleted = false LIMIT 1`,
            [orderPhone],
          );
          orderContact = rows[0] || null;
        }
        if (!orderContact && orderEmail) {
          const { rows } = await client.query(
            `SELECT contact_id FROM shared.contacts
             WHERE email = $1 AND is_deleted = false LIMIT 1`,
            [orderEmail],
          );
          orderContact = rows[0] || null;
        }

        if (orderContact) {
          // Enrich with any new information from this order
          await client.query(
            `UPDATE shared.contacts
             SET email         = COALESCE(email, $2),
                 primary_phone = COALESCE(primary_phone, $3),
                 first_name    = COALESCE(first_name, $4),
                 last_name     = COALESCE(last_name, $5)
             WHERE contact_id = $1`,
            [orderContact.contact_id, orderEmail, orderPhone, orderFirstName, orderLastName],
          );
          await client.query(
            `UPDATE campaign_orders SET hub_contact_id = $2 WHERE order_id = $1`,
            [order.order_id, orderContact.contact_id],
          );
        } else {
          const { rows: [newOrderContact] } = await client.query(
            `INSERT INTO shared.contacts
               (display_name, first_name, last_name, primary_phone, email,
                contact_type, source, visible_to)
             VALUES ($1,$2,$3,$4,$5,
                     ARRAY['customer']::text[],
                     'campaign_order',
                     ARRAY[$6])
             RETURNING contact_id`,
            [
              data.customer_name || orderPhone || orderEmail,
              orderFirstName,
              orderLastName,
              orderPhone,
              orderEmail,
              business,
            ],
          );
          await client.query(
            `UPDATE campaign_orders SET hub_contact_id = $2 WHERE order_id = $1`,
            [order.order_id, newOrderContact.contact_id],
          );
        }
      } catch (contactErr) {
        // Non-fatal — never fail an order over a CRM write
        logger.warn(`[placeOrder] contact upsert failed for order ${order.order_id}: ${contactErr.message}`);
      }
    }

    // Notify staff of new order (bank transfer pending proof)
    if (data.payment_method === "bank_transfer") {
      await notifyStaffOfPendingOrder(
        client,
        business,
        campaign,
        order,
        resolvedItems,
      );
    }

    logger.info(
      `[storefront] order ${orderNumber} placed for campaign ${slug}`,
    );

    return {
      order_id: order.order_id,
      order_number: orderNumber,
      tracking_token: order.tracking_token,
      total_amount: totalAmount,
      payment_method: data.payment_method,
      paystack_url: paystackUrl,
      // Optimus Pay: show these to the customer so they know where to transfer
      optimus_virtual_account: optimusVirtualAccount,
      optimus_bank_name: optimusBankName,
      optimus_transaction_ref: optimusTransactionRef,
      status: order.status,
    };
  });
}

// ── PROOF OF PAYMENT UPLOAD ───────────────────────────────────────────────────

async function submitProof(business, orderId, { proof_image_url, source }) {
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
    if (order.status !== "pending") {
      throw Object.assign(
        new Error("Proof already submitted or order is closed"),
        { status: 409 },
      );
    }
    if (!proof_image_url)
      throw Object.assign(new Error("proof_image_url is required"), {
        status: 400,
      });

    const updated = await repo.updateOrderStatus(client, orderId, {
      status: "proof_submitted",
      proofImageUrl: proof_image_url,
    });

    // Stock was reserved at order placement, now stays reserved until staff confirm/cancel.

    // ── Create bridge sales_order with pending_proof status ──────────
    // This makes the order visible in the unified Sales → Orders view
    // so staff can approve from either the Campaigns UI or the Orders list.
    let bridgeOrderId = null;
    try {
      // Find or create a contact for this customer
      let contactId = order.hub_contact_id;
      if (!contactId) {
        const { rows: [existing] } = await client.query(
          `SELECT contact_id FROM shared.contacts
           WHERE primary_phone = $1 AND is_deleted = false LIMIT 1`,
          [order.customer_phone],
        );
        if (existing) {
          contactId = existing.contact_id;
        } else if (order.customer_email) {
          const { rows: [byEmail] } = await client.query(
            `SELECT contact_id FROM shared.contacts
             WHERE email = $1 AND is_deleted = false LIMIT 1`,
            [order.customer_email],
          );
          contactId = byEmail?.contact_id || null;
        }
      }

      if (contactId) {
        const soNumber = await nextDocumentNumber(client, business, "sales_order");
        const { rows: [bridgeOrder] } = await client.query(
          `INSERT INTO sales_orders
             (order_number, contact_id, status, fulfilment_type,
              source, total_amount, amount_paid, created_by)
           VALUES ($1, $2, 'pending_proof', $3,
                   'campaign', $4, 0, NULL)
           RETURNING order_id`,
          [
            soNumber,
            contactId,
            order.fulfilment_type || "delivery",
            parseFloat(order.total_amount),
          ],
        );
        bridgeOrderId = bridgeOrder.order_id;

        // Link campaign_order → bridge sales_order
        await client.query(
          `UPDATE campaign_orders SET hub_order_id = $2 WHERE order_id = $1`,
          [orderId, bridgeOrderId],
        );
      }
    } catch (err) {
      // Non-fatal — the campaign flow still works without the bridge row.
      logger.warn(
        `[storefront] bridge sales_order failed for campaign order ${orderId}: ${err.message}`,
      );
    }

    // Notify staff to verify the payment.
    const {
      rows: [campaign],
    } = await client.query(
      `SELECT campaign_name, slug FROM sales_campaigns WHERE campaign_id = $1`,
      [order.campaign_id],
    );
    await notifyStaffProofSubmitted(
      client,
      business,
      campaign,
      order,
      proof_image_url,
    );

    logger.info(`[storefront] proof submitted for order ${order.order_number}`);
    return {
      submitted: true,
      status: "proof_submitted",
      tracking_token: order.tracking_token,
      bridge_order_id: bridgeOrderId,
    };
  });
}

// ── ORDER TRACKING (public) ───────────────────────────────────────────────────

async function getOrderByToken(business, trackingToken) {
  return withBusinessContext(business, async (client) => {
    const order = await repo.findOrderByToken(client, trackingToken);
    if (!order)
      throw Object.assign(new Error("Order not found"), { status: 404 });

    // Build customer-friendly status message
    const messages = {
      pending: "Waiting for your payment proof.",
      proof_submitted:
        "Payment proof received. Our team is verifying your transfer.",
      confirmed:
        order.fulfilment_type === "pickup"
          ? `Your order is ready. Please visit ${order.pickup_location || "our store"} to collect.`
          : "Order confirmed! We're preparing your items for delivery.",
      dispatched: "Your order is on its way!",
      ready_for_pickup: `Your order is ready for collection at ${order.pickup_location || "our store"}.`,
      completed: "Order completed. Thank you!",
      cancelled: `Order cancelled${order.cancellation_reason ? ": " + order.cancellation_reason : ""}.`,
    };

    return {
      order_number: order.order_number,
      status: order.status,
      status_message: messages[order.status] || order.status,
      fulfilment_type: order.fulfilment_type,
      pickup_location: order.pickup_location,
      total_amount: order.total_amount,
      items: order.items,
      created_at: order.created_at,
    };
  });
}

// ── PAYSTACK INTEGRATION ──────────────────────────────────────────────────────

async function initializePaystackPayment({
  email,
  amount,
  reference,
  metadata,
  callback_url,
}) {
  const response = await axios.post(
    "https://api.paystack.co/transaction/initialize",
    { email, amount, reference, metadata, callback_url },
    { headers: { Authorization: `Bearer ${config.paystack.secretKey}` } },
  );
  return response.data?.data?.authorization_url || null;
}

// Called from the existing paystack webhook when charge.success fires
// (webhook must detect campaign_order references and call this)
async function handlePaystackConfirmation(business, orderId) {
  const adminSvc = require("./admin.service");
  // Use a system user context for webhook-triggered confirmations
  const systemUser = {
    user_id: null,
    display_name: "Paystack Webhook",
    email: "system",
  };
  try {
    await adminSvc.confirmOrder(business, orderId, systemUser);
    logger.info(`[storefront] Paystack auto-confirmed order ${orderId}`);
  } catch (err) {
    logger.error(
      `[storefront] Paystack confirmation failed for order ${orderId}:`,
      err.message,
    );
  }
}

// Called from the Optimus Pay webhook when a virtual account receives payment.
async function handleOptimusConfirmation(business, orderId) {
  const adminSvc = require("./admin.service");
  const systemUser = {
    user_id: null,
    display_name: "Optimus Pay Webhook",
    email: "system",
  };
  try {
    await adminSvc.confirmOrder(business, orderId, systemUser);
    logger.info(`[storefront] Optimus Pay auto-confirmed order ${orderId}`);
  } catch (err) {
    logger.error(
      `[storefront] Optimus Pay confirmation failed for order ${orderId}:`,
      err.message,
    );
  }
}

// ── NOTIFICATION HELPERS ──────────────────────────────────────────────────────

async function notifyStaffOfLead(client, business, campaign, lead, contactId) {
  const { rows: managers } = await client.query(
    `SELECT u.user_id FROM shared.users u
     JOIN shared.user_roles ur ON ur.user_id = u.user_id
     JOIN shared.roles r ON r.role_id = ur.role_id
     WHERE r.role_name IN ('owner','manager') AND (ur.business = $1 OR ur.business = '*')`,
    [business],
  );
  const isQR       = lead.lead_type === "qr_scan";
  const displayName = lead.name || lead.phone || "Someone";
  const title = isQR
    ? `New visitor — ${campaign.campaign_name}`
    : `New inquiry — ${campaign.campaign_name}`;
  const body = isQR
    ? `${displayName} scanned the QR code and joined`
    : `${displayName} submitted an inquiry form`;

  for (const m of managers) {
    await notifService.create(client, {
      userId: m.user_id,
      business,
      type: "campaign_lead",
      title,
      body,
      referenceType: "campaign_lead",
      referenceId: lead.lead_id,
      actionUrl: `/sales-campaigns/${campaign.campaign_id}?tab=leads`,
    });
  }
}

async function notifyStaffOfPendingOrder(
  client,
  business,
  campaign,
  order,
  items,
) {
  const { rows: managers } = await client.query(
    `SELECT u.user_id FROM shared.users u
     JOIN shared.user_roles ur ON ur.user_id = u.user_id
     JOIN shared.roles r ON r.role_id = ur.role_id
     WHERE r.role_name IN ('owner','manager') AND (ur.business = $1 OR ur.business = '*')`,
    [business],
  );
  const summary = items
    .map((i) => `${i.product_name} ×${i.quantity}`)
    .join(", ");
  for (const m of managers) {
    await notifService.create(client, {
      userId: m.user_id,
      business,
      type: "campaign_order",
      title: `New order — ₦${parseFloat(order.total_amount).toLocaleString()}`,
      body: `${order.customer_name} ordered: ${summary}. Awaiting proof of payment.`,
      referenceType: "campaign_order",
      referenceId: order.order_id,
      actionUrl: `/sales-campaigns/${order.campaign_id}?tab=orders`,
    });
  }
}

async function notifyStaffProofSubmitted(
  client,
  business,
  campaign,
  order,
  proofUrl,
) {
  const { rows: managers } = await client.query(
    `SELECT u.user_id FROM shared.users u
     JOIN shared.user_roles ur ON ur.user_id = u.user_id
     JOIN shared.roles r ON r.role_id = ur.role_id
     WHERE r.role_name IN ('owner','manager') AND (ur.business = $1 OR ur.business = '*')`,
    [business],
  );
  for (const m of managers) {
    await notifService.create(client, {
      userId: m.user_id,
      business,
      type: "approval_required",
      title: `Payment proof received — ${order.order_number}`,
      body: `${order.customer_name} (${order.customer_phone}) uploaded payment proof. Verify and confirm.`,
      referenceType: "campaign_order",
      referenceId: order.order_id,
      actionUrl: `/sales-campaigns/${order.campaign_id}?tab=orders`,
    });
  }
}

module.exports = {
  getPage,
  trackEvent,
  submitLead,
  placeOrder,
  submitProof,
  getOrderByToken,
  handlePaystackConfirmation,
  handleOptimusConfirmation,
};

// ── storefront.routes.js ──────────────────────────────────────────────────────
// PUBLIC routes — no verifyToken, no businessContext middleware.
// Business key comes from the URL: /c/:business/:slug

const express = require("express");
const pubRouter = express.Router({ mergeParams: true });
const { body, param } = require("express-validator");
const validate = require("../../middleware/validateBody");
const svc = module.exports;

// GET /api/c/:business/:slug — landing page data
pubRouter.get("/:business/:slug", async (req, res, next) => {
  try {
    const page = await svc.getPage(req.params.business, req.params.slug);
    res.json(page);
  } catch (e) {
    next(e);
  }
});

// POST /api/c/:business/:slug/events — analytics tracking (fire-and-forget)
pubRouter.post(
  "/:business/:slug/events",
  body("event_type").isString().notEmpty(),
  validate,
  async (req, res, next) => {
    svc
      .trackEvent(req.params.business, req.params.slug, req.body, req)
      .catch(() => {});
    res.json({ ok: true });
  },
);

// POST /api/c/:business/:slug/leads — inquiry form OR QR scan capture
// QR scan requires: first_name, last_name, phone, email (both)
// Inquiry form:     name, phone, email, message (original behaviour)
pubRouter.post(
  "/:business/:slug/leads",
  body("lead_type").optional().isIn(["form", "whatsapp_tap", "qr_scan"]),
  body("first_name").optional().isString().trim(),
  body("last_name").optional().isString().trim(),
  body("name").optional().isString().trim(),
  body("phone").optional().isString().trim(),
  body("email").optional().isEmail().normalizeEmail({ gmail_dots: false }),
  body("address_city").optional().isString().trim(),
  body("address_state").optional().isString().trim(),
  body("wants_birthday").optional().isBoolean(),
  body("birthday_month").optional().isInt({ min: 1, max: 12 }),
  body("birthday_day").optional().isInt({ min: 1, max: 31 }),
  validate,
  async (req, res, next) => {
    // QR scan: require at least phone + email
    if (req.body.lead_type === "qr_scan") {
      if (!req.body.phone || !req.body.email) {
        return res
          .status(400)
          .json({ error: "phone and email are required for QR scan registration" });
      }
    }
    try {
      res.status(201).json(
        await svc.submitLead(
          req.params.business,
          req.params.slug,
          req.body,
          req,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

// POST /api/c/:business/:slug/orders — place order
pubRouter.post(
  "/:business/:slug/orders",
  body("customer_name").isString().notEmpty(),
  body("customer_phone").isString().notEmpty(),
  body("items").isArray({ min: 1 }),
  body("payment_method").isIn(["paystack", "bank_transfer", "optimus_pay"]),
  body("fulfilment_type").isIn(["delivery", "pickup"]),
  validate,
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await svc.placeOrder(
            req.params.business,
            req.params.slug,
            req.body,
            req,
          ),
        );
    } catch (e) {
      next(e);
    }
  },
);

// POST /api/c/orders/:orderId/proof — upload proof of payment
pubRouter.post(
  "/orders/:orderId/proof",
  param("orderId").isUUID(),
  body("proof_image_url").isURL(),
  body("business").isString().notEmpty(), // must pass business in body for routing
  validate,
  async (req, res, next) => {
    try {
      res.json(
        await svc.submitProof(
          req.body.business,
          req.params.orderId,
          req.body,
          req,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

// GET /api/c/track/:business/:token — order tracking
pubRouter.get("/track/:business/:token", async (req, res, next) => {
  try {
    res.json(await svc.getOrderByToken(req.params.business, req.params.token));
  } catch (e) {
    next(e);
  }
});

module.exports.storefrontRouter = pubRouter;
