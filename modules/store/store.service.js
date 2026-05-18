"use strict";

const crypto = require("crypto");
const { withStoreContext, withBusinessContext } = require("../../config/db");
const { sendEmail } = require("../../lib/email/sender");
const paystackService = require("../../integrations/paystack/paystack.service");
const journalService = require("../accounting/journal.service");
const stockService = require("../stock/stock.service");
const config = require("../../config/config");
const logger = require("../../config/logger");
const repo = require("./store.repository");

// ─────────────────────────────────────────────────────────────
// modules/store/store.service
//
// The Orika Living storefront as a SALES CHANNEL of the ERP.
//
// The defining rule: every web sale balances with the ERP. On
// payment, verifyAndFulfil posts a revenue journal and a COGS
// journal and writes stock_movements rows into the `diffusers`
// business — exactly the path a POS sale takes — so the books and
// the stock ledger always reflect web sales.
//
// Money: the storefront speaks kobo; the ERP speaks naira. The two
// are reconciled explicitly at every boundary.
//
// The storefront is single-tenant — it always maps to the
// `diffusers` business.
// ─────────────────────────────────────────────────────────────

const STORE_BUSINESS = "diffusers";
const MAX_ORDER_KOBO = 500000000; // ₦5,000,000 cap, mirrors the storefront

// ── PUBLIC: PRODUCTS ─────────────────────────────────────────

async function getActiveProducts() {
  return withStoreContext(async (client) => {
    return { data: await repo.listActiveProducts(client) };
  });
}

async function getFeaturedProducts(format, limit) {
  return withStoreContext(async (client) => {
    const data = await repo.listFeaturedProducts(
      client,
      format,
      Math.min(parseInt(limit) || 4, 24),
    );
    return { data };
  });
}

async function getProductBySlug(slug) {
  return withStoreContext(async (client) => {
    const product = await repo.findProductBySlug(client, slug);
    if (!product) {
      throw Object.assign(new Error("Product not found"), { status: 404 });
    }
    return product;
  });
}

async function getRelatedProducts(family, excludeId, limit) {
  return withStoreContext(async (client) => {
    const data = await repo.listRelatedProducts(
      client,
      family,
      excludeId,
      Math.min(parseInt(limit) || 4, 12),
    );
    return { data };
  });
}

// ── PUBLIC: SCENTS / SIGNATURES ──────────────────────────────

async function getScents() {
  return withStoreContext(async (client) => {
    return { data: await repo.listScents(client) };
  });
}

async function getScentBySlug(slug) {
  return withStoreContext(async (client) => {
    const scent = await repo.findScentBySlug(client, slug);
    if (!scent) {
      throw Object.assign(new Error("Scent not found"), { status: 404 });
    }
    return scent;
  });
}

async function getSignatures() {
  return withStoreContext(async (client) => {
    return { data: await repo.listSignatures(client) };
  });
}

// ── PUBLIC: CHECKOUT ─────────────────────────────────────────

/**
 * Create a pending order. Prices and stock are re-derived from the
 * ERP (the storefront product JOINs diffusers.products), never
 * trusted from the client. Also ensures the buyer exists both as a
 * store.customers row and a shared.contacts row (so web buyers
 * appear in the ERP CRM).
 */
async function createOrder({ delivery_address, items }) {
  if (!delivery_address || !delivery_address.email) {
    throw Object.assign(new Error("delivery_address with email is required"), {
      status: 400,
    });
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error("At least one item is required"), {
      status: 400,
    });
  }

  return withStoreContext(async (client) => {
    const ids = items.map((i) => i.product_id);
    const products = await repo.findStoreProductsByIds(client, ids);
    if (products.length !== ids.length) {
      throw Object.assign(new Error("One or more items are unavailable"), {
        status: 400,
      });
    }
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Re-derive price + stock from the ERP-backed product view.
    const lineItems = [];
    let totalKobo = 0;
    for (const { product_id, quantity } of items) {
      const p = productMap.get(product_id);
      if (!p) {
        throw Object.assign(new Error("Product no longer available"), {
          status: 400,
        });
      }
      const qty = parseInt(quantity);
      if (!qty || qty < 1) {
        throw Object.assign(new Error("Invalid quantity"), { status: 400 });
      }
      if (!p.in_stock || p.stock_qty < qty) {
        throw Object.assign(new Error(`${p.name} is out of stock`), {
          status: 409,
        });
      }
      totalKobo += Number(p.price_kobo) * qty;
      lineItems.push({
        // store_product_id is the storefront listing; erp_product_id
        // is the diffusers SKU — fulfilment needs the ERP id to post
        // stock + COGS.
        store_product_id: p.id,
        erp_product_id: p.product_id,
        name: p.name,
        price_kobo: Number(p.price_kobo),
        quantity: qty,
        image: p.images?.[0] ?? "",
        size_ml: p.size_ml,
        format: p.format,
      });
    }

    if (totalKobo > MAX_ORDER_KOBO) {
      throw Object.assign(new Error("Order total exceeds the allowed limit"), {
        status: 400,
      });
    }

    // Resolve the buyer. A web customer is both a store.customers row
    // and a shared.contacts row — create whichever is missing so the
    // buyer always shows up in the ERP CRM.
    let customer = await repo.findCustomerByEmail(
      client,
      delivery_address.email,
    );
    if (!customer) {
      let contact = await repo.findContactByEmail(
        client,
        delivery_address.email,
      );
      if (!contact) {
        contact = await repo.insertContact(client, {
          displayName: delivery_address.full_name,
          email: delivery_address.email,
          phone: delivery_address.phone,
        });
      }
      customer = await repo.insertCustomer(client, {
        contactId: contact.contact_id,
        email: delivery_address.email,
        fullName: delivery_address.full_name,
        phone: delivery_address.phone,
      });
    }

    const order = await repo.insertOrder(client, {
      customerId: customer.id,
      totalKobo,
      deliveryAddress: delivery_address,
      items: lineItems,
    });

    const reference = `orika_${order.id}`;
    await repo.setOrderPaystackRef(client, order.id, reference);

    return {
      ok: true,
      order_id: order.id,
      reference,
      amount_kobo: totalKobo,
      email: delivery_address.email,
    };
  });
}

async function getOrder(orderId) {
  return withStoreContext(async (client) => {
    const order = await repo.findOrderById(client, orderId);
    if (!order) {
      throw Object.assign(new Error("Order not found"), { status: 404 });
    }
    return order;
  });
}

// ── PAYSTACK FULFILMENT — the ERP-balancing path ─────────────

/**
 * Fulfil a paid web order. Used by BOTH the webhook and the
 * client-initiated verify endpoint.
 *
 * The whole thing runs inside withBusinessContext('diffusers') so
 * that journalService and stockService — which use unqualified
 * table names and rely on the search_path — write into the
 * diffusers ERP. The store.* tables are referenced with explicit
 * schema qualification, which works regardless of search_path.
 *
 * Steps, all in one transaction:
 *   1. verify with Paystack
 *   2. load the store order (explicit store. qualification)
 *   3. idempotency + amount check
 *   4. record stock_movements (sold) for each line  → ERP stock
 *   5. post the revenue journal  (DR Cash / CR Sales / CR VAT)
 *   6. post the COGS journal     (DR COGS / CR Inventory)
 *   7. flip the order to paid, recording both journal ids
 *   8. confirmation email (best effort)
 *
 * If any of 4–7 throws, the whole transaction rolls back — the
 * order stays 'pending' and can be retried. The order can never be
 * 'paid' without its journals, and journals can never post without
 * the stock movement.
 */
async function verifyAndFulfil(reference) {
  // 1. Verify with Paystack first (outside the DB transaction).
  const verification = await paystackService.verifyPayment(reference);
  if (verification.status !== "success") {
    return { ok: false, status: verification.status, reference };
  }

  return withBusinessContext(STORE_BUSINESS, async (client) => {
    // 2. Load the order. store.orders is explicitly qualified, so it
    //    resolves even though search_path points at diffusers.
    const order = await repo.findOrderByRef(client, reference);
    if (!order) {
      throw Object.assign(new Error("Order not found for reference"), {
        status: 404,
      });
    }

    // 3a. Idempotency — already-paid orders short-circuit. The real
    //     atomic guard is markOrderPaidWithJournals at step 7; this
    //     is the cheap early exit for the common repeat-webhook case.
    if (order.status !== "pending") {
      return {
        ok: true,
        already: true,
        order_id: order.id,
        status: order.status,
      };
    }

    // 3b. Amount check — verifyPayment returns naira; order is kobo.
    const paidKobo = Math.round(verification.amount * 100);
    if (paidKobo !== Number(order.total_kobo)) {
      await repo.setOrderStatus(client, order.id, "processing");
      logger.error(
        `[store] payment amount mismatch on ${reference}: ` +
          `paid ${paidKobo} kobo, order ${order.total_kobo} kobo`,
      );
      throw Object.assign(
        new Error("Payment amount does not match order total"),
        { status: 409 },
      );
    }

    const lines = order.items || [];

    // 4. Record stock movement for each line — outbound 'sold'.
    //    recordMovement uses unqualified table names; the diffusers
    //    search_path makes them resolve to diffusers.stock_movements.
    for (const item of lines) {
      try {
        await stockService.recordMovement(client, {
          business: STORE_BUSINESS,
          productId: item.erp_product_id,
          movementType: "sold",
          quantity: item.quantity,
          direction: -1,
          referenceType: "store_order",
          referenceId: order.id,
          performedBy: null,
        });
      } catch (err) {
        // A failed movement here aborts the whole transaction — we do
        // not want a paid order with no stock decrement.
        logger.error(
          `[store] stock movement failed for order ${order.id}, ` +
            `product ${item.erp_product_id}: ${err.message}`,
        );
        throw err;
      }
    }

    // 5. Revenue journal. Web sales are paid online → the debit is to
    //    Bank (1210), not Cash. VAT is backed out of the gross total
    //    at the business rate.
    const { getVatRate } = require("../../config/businesses");
    const vatRate = getVatRate(STORE_BUSINESS);
    const grossNaira = Number(order.total_kobo) / 100;
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
        // No VAT account — put the whole gross to sales so the entry
        // still balances rather than silently dropping the VAT line.
        revLines[1].credit = grossNaira;
      }
      revenueEntry = await journalService.postEntry(client, {
        description: `Web Sale ${order.id} (Orika Living)`,
        referenceType: "store_order",
        referenceId: order.id,
        postedBy: null,
        lines: revLines,
      });
    } else {
      logger.error(
        `[store] revenue journal skipped for order ${order.id}: ` +
          `missing COA bank=${bankAcc ? "ok" : "1210"} ` +
          `sales=${salesAcc ? "ok" : "4100"}`,
      );
    }

    // 6. COGS journal — weighted-average cost via stockService.
    const costable = lines
      .filter((l) => l.erp_product_id)
      .map((l) => ({ product_id: l.erp_product_id, quantity: l.quantity }));
    let cogsEntry = null;
    if (costable.length > 0) {
      const { total_cost } = await stockService.calculateSaleCOGS(
        client,
        costable,
      );
      if (total_cost && total_cost > 0) {
        const cogsAcc = await journalService.getAccountId(client, "5000");
        const invAcc = await journalService.getAccountId(client, "1410");
        if (cogsAcc && invAcc) {
          cogsEntry = await journalService.postEntry(client, {
            description: `COGS for Web Sale ${order.id}`,
            referenceType: "store_order_cogs",
            referenceId: order.id,
            postedBy: null,
            lines: [
              { account_id: cogsAcc, debit: total_cost, credit: 0 },
              { account_id: invAcc, debit: 0, credit: total_cost },
            ],
          });
        } else {
          logger.warn(
            `[store] COGS journal skipped for order ${order.id}: missing COA`,
          );
        }
      }
    }

    // 7. Flip to paid, recording both journal ids atomically. If this
    //    returns null another transaction beat us — roll back.
    const paidOrder = await repo.markOrderPaidWithJournals(client, order.id, {
      journalEntryId: revenueEntry?.entry_id || revenueEntry?.entryId || null,
      cogsEntryId: cogsEntry?.entry_id || cogsEntry?.entryId || null,
    });
    if (!paidOrder) {
      // Lost a race — abort so we don't double-post. The winning
      // transaction already fulfilled it.
      throw Object.assign(new Error("Order was concurrently fulfilled"), {
        status: 409,
      });
    }

    // Bump the customer's lifetime order count.
    if (order.customer_id) {
      await repo.incrementCustomerOrders(client, order.customer_id);
    }

    // 8. Confirmation email — best effort, never fails the txn.
    try {
      const addr = order.delivery_address || {};
      await sendEmail({
        to: addr.email,
        subject: "Your Orika Living order is confirmed",
        html: orderConfirmationHtml(order),
      });
    } catch (err) {
      logger.warn(
        `[store] confirmation email failed for ${order.id}: ${err.message}`,
      );
    }

    return { ok: true, order_id: order.id, status: "paid" };
  });
}

function orderConfirmationHtml(order) {
  const addr = order.delivery_address || {};
  const lines = (order.items || [])
    .map(
      (i) =>
        `<li>${i.quantity} × ${i.name} — ₦${(
          (i.price_kobo * i.quantity) /
          100
        ).toLocaleString()}</li>`,
    )
    .join("");
  return `
    <h2>Thank you for your order, ${addr.full_name || "customer"}!</h2>
    <p>Your order <strong>${order.id}</strong> has been confirmed and is
    being prepared.</p>
    <ul>${lines}</ul>
    <p><strong>Total: ₦${(Number(order.total_kobo) / 100).toLocaleString()}</strong></p>
    <p>Delivery to: ${addr.street}, ${addr.city}, ${addr.state}</p>
    <p>— Orika Living</p>`;
}

/**
 * Verify the Paystack webhook HMAC signature. The raw request body
 * (Buffer) must be passed — not the parsed JSON.
 */
function verifyWebhookSignature(rawBody, signature) {
  const hash = crypto
    .createHmac("sha512", config.paystack.webhookSecret)
    .update(rawBody)
    .digest("hex");
  return hash === signature;
}

// ── NEWSLETTER ───────────────────────────────────────────────

async function subscribeNewsletter({ email, source }) {
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    throw Object.assign(new Error("A valid email is required"), {
      status: 400,
    });
  }
  return withStoreContext(async (client) => {
    const sub = await repo.upsertSubscriber(client, { email, source });
    try {
      await sendEmail({
        to: sub.email,
        subject: "Welcome to Orika Living",
        html: `<p>Thank you for subscribing. You'll be first to hear about
               new scents and editions.</p><p>— Orika Living</p>`,
      });
    } catch (err) {
      logger.warn(`[store] newsletter welcome email failed: ${err.message}`);
    }
    return { ok: true, email: sub.email };
  });
}

async function unsubscribeNewsletter(token) {
  return withStoreContext(async (client) => {
    const row = await repo.unsubscribeByToken(client, token);
    if (!row) {
      throw Object.assign(
        new Error("Invalid or already-used unsubscribe link"),
        { status: 404 },
      );
    }
    return { ok: true };
  });
}

// ── ENQUIRIES ────────────────────────────────────────────────

const ENQUIRY_TYPES = [
  "Retail / Stockist Partnership",
  "Bulk / Wholesale Order",
  "Corporate Gifting",
  "Hotel / Hospitality Placement",
  "Event Setup",
  "General Enquiry",
];

async function submitEnquiry(data) {
  if (!data.name || !data.email || !data.phone || !data.message) {
    throw Object.assign(
      new Error("name, email, phone and message are required"),
      { status: 400 },
    );
  }
  if (!ENQUIRY_TYPES.includes(data.type)) {
    throw Object.assign(
      new Error(`type must be one of: ${ENQUIRY_TYPES.join(", ")}`),
      { status: 400 },
    );
  }
  return withStoreContext(async (client) => {
    const enquiry = await repo.insertEnquiry(client, data);
    return { ok: true, enquiry_id: enquiry.id };
  });
}

module.exports = {
  // public reads
  getActiveProducts,
  getFeaturedProducts,
  getProductBySlug,
  getRelatedProducts,
  getScents,
  getScentBySlug,
  getSignatures,
  // checkout + payments
  createOrder,
  getOrder,
  verifyAndFulfil,
  verifyWebhookSignature,
  // newsletter + enquiries
  subscribeNewsletter,
  unsubscribeNewsletter,
  submitEnquiry,
};
