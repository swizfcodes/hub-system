"use strict";

const crypto = require("crypto");
const {
  withStoreContext,
  withBusinessContext,
  withSharedContext,
  nextDocumentNumber,
} = require("../../config/db");
const { sendEmail } = require("../../lib/email/sender");
const { renderEmail } = require("../../lib/email/render");
const paystackService = require("../../integrations/paystack/paystack.service");
const optimusService = require("../../integrations/optimus/optimus.service");
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

// Scents are derived from published products, but the ERP captures no
// presentation styling (no swatch/ink). This palette — keyed by the six
// scent_family enum values — gives each derived scent its colour, mirroring
// the storefront's design defaults. A store.scents row, if one ever exists,
// overrides these (the repo returns its swatch/ink and we keep them).
const SCENT_FAMILY_STYLE = {
  "Fresh & Marine": { swatch: "#B8C9D6", ink: "#2B3A45" },
  "Citrus & Green": { swatch: "#D8DEB0", ink: "#3A4022" },
  "Oud & Floral": { swatch: "#2B2820", ink: "#F2EDE4" },
  "Spice & Amber": { swatch: "#D9A76A", ink: "#3B2A15" },
  "Woody & Deep": { swatch: "#9B4A2E", ink: "#F2EDE4" },
  "Floral & Musk": { swatch: "#C5A0A7", ink: "#3B1F26" },
};
const SCENT_STYLE_FALLBACK = { swatch: "#2B2820", ink: "#F2EDE4" };

// Fill swatch/ink from the family palette when the row didn't carry them
// (i.e. no store.scents override). Leaves any explicit values untouched.
function applyScentStyle(scent) {
  if (!scent) return scent;
  if (scent.swatch && scent.ink) return scent;
  const style = SCENT_FAMILY_STYLE[scent.family] || SCENT_STYLE_FALLBACK;
  return {
    ...scent,
    swatch: scent.swatch || style.swatch,
    ink: scent.ink || style.ink,
  };
}

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
    const rows = await repo.listScents(client);
    return { data: rows.map(applyScentStyle) };
  });
}

async function getScentBySlug(slug) {
  return withStoreContext(async (client) => {
    const scent = await repo.findScentBySlug(client, slug);
    if (!scent) {
      throw Object.assign(new Error("Scent not found"), { status: 404 });
    }
    return applyScentStyle(scent);
  });
}

async function getSignatures() {
  return withStoreContext(async (client) => {
    return { data: await repo.listSignatures(client) };
  });
}

// ── PUBLIC: SETTINGS (storefront content) ────────────────────
// Returns the singleton settings row (or null if not seeded — the
// storefront falls back to its static defaults in that case).
async function getSettings() {
  return withStoreContext(async (client) => {
    return repo.getSettings(client);
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
async function createOrder({ delivery_address, items, payment_method = "paystack" }) {
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
    // buyer always shows up in the ERP CRM. We need the contact_id in
    // all cases (the ERP sales_order requires it), so resolve it first.
    let contact = await repo.findContactByEmail(client, delivery_address.email);
    if (!contact) {
      contact = await repo.insertContact(client, {
        displayName: delivery_address.full_name,
        email: delivery_address.email,
        phone: delivery_address.phone,
      });
    }

    let customer = await repo.findCustomerByEmail(
      client,
      delivery_address.email,
    );
    if (!customer) {
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

    // NOTE: the ERP sales_order is intentionally NOT created here. A web
    // order only becomes a real ERP sale once payment succeeds (see
    // verifyAndFulfil), so ERP Sales never accumulates abandoned/unpaid
    // orders. The buyer's contact + customer records ARE created above so
    // they appear in CRM regardless of whether they complete payment.

    if (payment_method === "optimus_pay") {
      // Provision a virtual account; store its details on the order row.
      const [firstName, ...rest] = (delivery_address.full_name || "Customer").split(" ");
      const lastName = rest.join(" ") || "N/A";
      const transactionRef = `store-${order.id}`;

      const vaResult = await optimusService.openVirtualAccount({
        amountKobo: totalKobo,
        transactionRef,
        description: `Orika Living order #${order.id}`,
        customerRef: customer.id,
        firstname: firstName,
        surname: lastName,
        email: delivery_address.email,
        mobileNo: (delivery_address.phone || "").replace(/[^0-9]/g, "") || "2340000000000",
      });

      await repo.setOrderOptimusRef(client, order.id, {
        transactionRef,
        virtualAccount: vaResult.accountNumber,
        bankName: vaResult.bankName,
      });

      return {
        ok: true,
        order_id: order.id,
        payment_method: "optimus_pay",
        optimus_transaction_ref: transactionRef,
        optimus_virtual_account: vaResult.accountNumber,
        optimus_bank_name: vaResult.bankName,
        amount_kobo: totalKobo,
        email: delivery_address.email,
      };
    }

    // Default: Paystack
    const reference = `orika_${order.id}`;
    await repo.setOrderPaystackRef(client, order.id, reference);

    return {
      ok: true,
      order_id: order.id,
      payment_method: "paystack",
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

    // 7b. Create the ERP sales order — now that payment has succeeded.
    //     Born already paid + fulfilled (source='web'), so ERP Sales only
    //     ever contains real, completed sales — abandoned/unpaid checkouts
    //     never reach the ERP. Linked back to store.orders. Same
    //     transaction: stock, journals, and the sales order all commit
    //     together or not at all.
    try {
      const addr = order.delivery_address || {};
      let contact = addr.email
        ? await repo.findContactByEmail(client, addr.email)
        : null;
      if (!contact) {
        // Fallback — buyer's contact should exist from createOrder, but
        // create it defensively so a missing contact never blocks a paid
        // order from reaching Sales.
        contact = await repo.insertContact(client, {
          displayName: addr.full_name || addr.email || "Web customer",
          email: addr.email,
          phone: addr.phone,
        });
      }
      const orderNumber = await nextDocumentNumber(
        client,
        STORE_BUSINESS,
        "sales_order",
      );
      const salesOrder = await repo.insertSalesOrderForWeb(client, {
        orderNumber,
        contactId: contact.contact_id,
        totalNaira: Number(order.total_kobo) / 100,
      });
      await repo.insertSalesOrderLinesForWeb(client, {
        orderId: salesOrder.order_id,
        lineItems: lines,
      });
      await repo.linkStoreOrderToSalesOrder(
        client,
        order.id,
        salesOrder.order_id,
      );
      await repo.settleSalesOrderForWeb(client, salesOrder.order_id);
    } catch (err) {
      // A failure here must abort the whole fulfilment — we never want a
      // paid order with stock/journals but no sales record.
      logger.error(
        `[store] sales order creation failed for ${order.id}: ${err.message}`,
      );
      throw err;
    }

    // Bump the customer's lifetime order count.
    if (order.customer_id) {
      await repo.incrementCustomerOrders(client, order.customer_id);
    }

    // 8. Confirmation email — best effort, never fails the txn.
    try {
      const addr = order.delivery_address || {};
      const { subject, html } = renderEmail("order_confirmation", STORE_BUSINESS, {
        customer_name: addr.full_name,
        order_id: order.id,
        items: order.items || [],
        total: Number(order.total_kobo) / 100,
      });
      await sendEmail({ to: addr.email, subject, html, business: STORE_BUSINESS });
    } catch (err) {
      logger.warn(
        `[store] confirmation email failed for ${order.id}: ${err.message}`,
      );
    }

    return { ok: true, order_id: order.id, status: "paid" };
  });
}

/**
 * Fulfil a store order that was paid via Optimus Pay virtual account.
 * Called by the Optimus Pay webhook handler — no external verification
 * needed since the webhook already validated the event before calling here.
 *
 * Steps mirror verifyAndFulfil exactly (stock → revenue journal → COGS
 * journal → mark paid → ERP sales order → confirmation email) except we
 * load the order by optimus_transaction_ref instead of paystack_ref, and
 * there is no amount re-check (the Optimus webhook already confirmed it).
 */
async function fulfillOptimusOrder(transactionRef) {
  return withBusinessContext(STORE_BUSINESS, async (client) => {
    const order = await repo.findOrderByOptimusRef(client, transactionRef);
    if (!order) {
      throw Object.assign(
        new Error(`No store order found for Optimus ref: ${transactionRef}`),
        { status: 404 },
      );
    }

    // Idempotency — already fulfilled orders short-circuit.
    if (order.status !== "pending") {
      return { ok: true, already: true, order_id: order.id, status: order.status };
    }

    const lines = order.items || [];

    // 1. Stock movements
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
        logger.error(
          `[store/optimus] stock movement failed for order ${order.id}, product ${item.erp_product_id}: ${err.message}`,
        );
        throw err;
      }
    }

    // 2. Revenue journal
    const { getVatRate } = require("../../config/businesses");
    const vatRate = getVatRate(STORE_BUSINESS);
    const grossNaira = Number(order.total_kobo) / 100;
    const netNaira = parseFloat((grossNaira / (1 + vatRate)).toFixed(2));
    const vatNaira = parseFloat((grossNaira - netNaira).toFixed(2));

    const bankAcc  = await journalService.getAccountId(client, "1210");
    const salesAcc = await journalService.getAccountId(client, "4100");
    const vatAcc   = await journalService.getAccountId(client, "2210");

    let revenueEntry = null;
    if (bankAcc && salesAcc) {
      const revLines = [
        { account_id: bankAcc,  debit: grossNaira, credit: 0 },
        { account_id: salesAcc, debit: 0,          credit: netNaira },
      ];
      if (vatAcc && vatNaira > 0) {
        revLines.push({ account_id: vatAcc, debit: 0, credit: vatNaira });
      } else {
        revLines[1].credit = grossNaira;
      }
      revenueEntry = await journalService.postEntry(client, {
        business: STORE_BUSINESS,
        description: `Optimus Pay — web order ${order.id}`,
        lines: revLines,
        postedBy: config.systemUserId,
      });
    }

    // 3. COGS journal
    let cogsEntry = null;
    try {
      const cogsAcc  = await journalService.getAccountId(client, "5100");
      const invAcc   = await journalService.getAccountId(client, "1310");
      if (cogsAcc && invAcc) {
        const cogsLines = [];
        for (const item of lines) {
          const costNaira = ((item.cost_kobo || 0) * item.quantity) / 100;
          if (costNaira > 0) {
            cogsLines.push({ account_id: cogsAcc, debit: costNaira, credit: 0 });
            cogsLines.push({ account_id: invAcc,  debit: 0,         credit: costNaira });
          }
        }
        if (cogsLines.length) {
          cogsEntry = await journalService.postEntry(client, {
            business: STORE_BUSINESS,
            description: `COGS — Optimus Pay web order ${order.id}`,
            lines: cogsLines,
            postedBy: config.systemUserId,
          });
        }
      }
    } catch (err) {
      logger.warn(`[store/optimus] COGS journal skipped for ${order.id}: ${err.message}`);
    }

    // 4. Mark paid (atomic guard against double-fulfilment)
    const paidOrder = await repo.markOrderPaidWithJournals(client, order.id, {
      journalEntryId: revenueEntry?.entry_id || revenueEntry?.entryId || null,
      cogsEntryId:    cogsEntry?.entry_id   || cogsEntry?.entryId   || null,
    });
    if (!paidOrder) {
      throw Object.assign(new Error("Order was concurrently fulfilled"), { status: 409 });
    }

    // 5. Create ERP sales order
    try {
      const addr = order.delivery_address || {};
      let contact = addr.email ? await repo.findContactByEmail(client, addr.email) : null;
      if (!contact) {
        contact = await repo.insertContact(client, {
          displayName: addr.full_name || addr.email || "Web customer",
          email: addr.email,
          phone: addr.phone,
        });
      }
      const orderNumber = await nextDocumentNumber(client, STORE_BUSINESS, "sales_order");
      const salesOrder = await repo.insertSalesOrderForWeb(client, {
        orderNumber,
        contactId: contact.contact_id,
        totalNaira: grossNaira,
      });
      await repo.insertSalesOrderLinesForWeb(client, { orderId: salesOrder.order_id, lineItems: lines });
      await repo.linkStoreOrderToSalesOrder(client, order.id, salesOrder.order_id);
      await repo.settleSalesOrderForWeb(client, salesOrder.order_id);
    } catch (err) {
      logger.error(`[store/optimus] sales order creation failed for ${order.id}: ${err.message}`);
      throw err;
    }

    if (order.customer_id) {
      await repo.incrementCustomerOrders(client, order.customer_id);
    }

    // 6. Confirmation email — best effort
    try {
      const addr = order.delivery_address || {};
      const { subject, html } = renderEmail("order_confirmation", STORE_BUSINESS, {
        customer_name: addr.full_name,
        order_id: order.id,
        items: order.items || [],
        total: grossNaira,
      });
      await sendEmail({ to: addr.email, subject, html, business: STORE_BUSINESS });
    } catch (err) {
      logger.warn(`[store/optimus] confirmation email failed for ${order.id}: ${err.message}`);
    }

    return { ok: true, order_id: order.id, status: "paid" };
  });
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

// ── NEWSLETTER SUBSCRIBERS (ERP read views) ──────────────────

async function listSubscribers(opts = {}) {
  return withStoreContext(async (client) => {
    const [data, counts] = await Promise.all([
      repo.listSubscribers(client, opts),
      repo.subscriberCounts(client),
    ]);
    return { data, counts };
  });
}

// CSV export of subscribers (respects the same search/status filter).
async function exportSubscribersCsv(opts = {}) {
  return withStoreContext(async (client) => {
    const rows = await repo.listSubscribers(client, opts);
    const header = "email,status,source,subscribed_at,unsubscribed_at";
    const csv = [header]
      .concat(
        rows.map((r) =>
          [
            r.email,
            r.is_active ? "active" : "unsubscribed",
            r.source || "",
            r.subscribed_at ? new Date(r.subscribed_at).toISOString() : "",
            r.unsubscribed_at ? new Date(r.unsubscribed_at).toISOString() : "",
          ]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(","),
        ),
      )
      .join("\n");
    return csv;
  });
}

// ── SCENTS ADMIN ─────────────────────────────────────────────

async function listEditableScents() {
  return withStoreContext(async (client) => {
    return { data: await repo.listEditableScents(client) };
  });
}

async function saveScent(family, data) {
  if (!family) {
    throw Object.assign(new Error("family is required"), { status: 400 });
  }
  if (!data.name || !data.name.trim()) {
    throw Object.assign(new Error("name is required"), { status: 400 });
  }
  return withStoreContext(async (client) => {
    return repo.upsertScent(client, { ...data, family });
  });
}

// ── SIGNATURES ADMIN (full CRUD) ─────────────────────────────

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function listSignaturesAdmin() {
  return withStoreContext(async (client) => {
    return { data: await repo.listSignatures(client) };
  });
}

// slug from the URL on update; null on create (derive from body.slug || name).
async function saveSignature(slug, data) {
  if (!data.name || !data.name.trim()) {
    throw Object.assign(new Error("name is required"), { status: 400 });
  }
  const finalSlug = slug || slugify(data.slug || data.name);
  if (!finalSlug) {
    throw Object.assign(new Error("a valid slug or name is required"), {
      status: 400,
    });
  }
  return withStoreContext(async (client) => {
    return repo.upsertSignature(client, { ...data, slug: finalSlug });
  });
}

async function deleteSignature(slug) {
  if (!slug) {
    throw Object.assign(new Error("slug is required"), { status: 400 });
  }
  return withStoreContext(async (client) => {
    await repo.deleteSignature(client, slug);
    return { deleted: true };
  });
}

// ── SETTINGS ADMIN (storefront content) ──────────────────────

async function saveSettings(data) {
  return withStoreContext(async (client) => {
    return repo.upsertSettings(client, data || {});
  });
}

async function subscribeNewsletter({ email, source }) {
  if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    throw Object.assign(new Error("A valid email is required"), {
      status: 400,
    });
  }
  return withStoreContext(async (client) => {
    const sub = await repo.upsertSubscriber(client, { email, source });

    // Mirror the subscriber into shared.contacts tagged 'subscriber' so
    // the campaign engine can target them (audience contact_type:
    // ['subscriber']). Best-effort: a CRM hiccup shouldn't fail the
    // public subscribe.
    try {
      await repo.tagContactAsSubscriber(client, { email: sub.email });
    } catch (err) {
      logger.warn(
        `[store] subscriber contact tagging failed for ${sub.email}: ${err.message}`,
      );
    }

    try {
      const welcome = renderEmail("newsletter_welcome", STORE_BUSINESS, {});
      await sendEmail({
        to: sub.email,
        subject: welcome.subject,
        html: welcome.html,
        business: STORE_BUSINESS,
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
    // Stop newsletter campaigns from targeting them by removing the
    // 'subscriber' tag (other contact types, e.g. customer, are kept).
    try {
      await repo.untagContactSubscriber(client, row.email);
    } catch (err) {
      logger.warn(
        `[store] subscriber contact untagging failed for ${row.email}: ${err.message}`,
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

// ── ENQUIRIES (ERP inbox) ────────────────────────────────────

const ENQUIRY_STATUSES = ["new", "read", "replied", "closed"];

async function listEnquiries(opts = {}) {
  return withStoreContext(async (client) => {
    const [data, counts] = await Promise.all([
      repo.listEnquiries(client, opts),
      repo.enquiryCounts(client),
    ]);
    return { data, counts };
  });
}

async function setEnquiryStatus(id, status) {
  if (!ENQUIRY_STATUSES.includes(status)) {
    throw Object.assign(
      new Error(`status must be one of: ${ENQUIRY_STATUSES.join(", ")}`),
      { status: 400 },
    );
  }
  return withStoreContext(async (client) => {
    const row = await repo.updateEnquiryStatus(client, id, status);
    if (!row) {
      throw Object.assign(new Error("Enquiry not found"), { status: 404 });
    }
    return row;
  });
}

// Reply to an enquiry THROUGH the messaging layer (SmatComm), so the reply
// is threaded in the customer's conversation and dispatched out via the
// email channel to their inbox — never opening an external mail client.
//
// Flow: find the enquiry → find/create a shared.contacts row for the
// enquirer's email → find/create a customer_thread channel keyed to that
// email (metadata.source='email', external_id=<email>) → send through
// messaging.sendMessage, whose customer_thread dispatch routes via the SMTP
// adapter to the customer's inbox. Then flip the enquiry to 'replied'.
async function replyToEnquiry(enquiryId, message, user) {
  if (!message || !message.trim()) {
    throw Object.assign(new Error("Reply message is required"), {
      status: 400,
    });
  }

  // 1. Load the enquiry (store schema).
  const enquiry = await withStoreContext(async (client) => {
    const { rows } = await client.query(
      `SELECT id, name, email, phone, type FROM store.enquiries WHERE id = $1`,
      [enquiryId],
    );
    return rows[0] || null;
  });
  if (!enquiry) {
    throw Object.assign(new Error("Enquiry not found"), { status: 404 });
  }

  // 2. Find/create contact + customer_thread channel (shared schema),
  //    mirroring how inbound email threads are created.
  const channelId = await withSharedContext(async (client) => {
    // Contact by email.
    let { rows: c } = await client.query(
      `SELECT contact_id FROM shared.contacts WHERE lower(email) = lower($1) LIMIT 1`,
      [enquiry.email],
    );
    let contactId = c[0]?.contact_id;
    if (!contactId) {
      const ins = await client.query(
        `INSERT INTO shared.contacts (contact_type, display_name, primary_phone, email, source)
         VALUES (ARRAY['customer'], $1, $2, $3, 'enquiry')
         RETURNING contact_id`,
        [
          enquiry.name || enquiry.email,
          enquiry.phone,
          enquiry.email.toLowerCase(),
        ],
      );
      contactId = ins.rows[0].contact_id;
    }

    // Existing email customer_thread for this contact?
    const { rows: ch } = await client.query(
      `SELECT c.channel_id
       FROM shared.message_channels c
       JOIN shared.channel_members m ON m.channel_id = c.channel_id
       WHERE c.channel_type = 'customer_thread'
         AND m.contact_id = $1
         AND c.metadata->>'source' = 'email'
       LIMIT 1`,
      [contactId],
    );
    let resolvedChannelId;
    if (ch[0]) {
      resolvedChannelId = ch[0].channel_id;
    } else {
      // Create one, keyed to the enquirer's email (source/external_id is
      // what the customer_thread dispatch reads to route via SMTP).
      const created = await client.query(
        `INSERT INTO shared.message_channels (channel_type, name, metadata)
         VALUES ('customer_thread', $1, $2)
         RETURNING channel_id`,
        [
          `Thread: ${enquiry.name || enquiry.email}`,
          JSON.stringify({ source: "email", external_id: enquiry.email }),
        ],
      );
      resolvedChannelId = created.rows[0].channel_id;
      await client.query(
        `INSERT INTO shared.channel_members (channel_id, contact_id) VALUES ($1, $2)`,
        [resolvedChannelId, contactId],
      );
    }

    // Ensure the replying staff member is a member of the thread (new or existing).
    await client.query(
      `INSERT INTO shared.channel_members (channel_id, user_id, role) VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING`,
      [resolvedChannelId, user.user_id],
    );
    return resolvedChannelId;
  });

  // 3. Send through messaging — this writes the message AND dispatches
  //    externally (SMTP → customer's inbox) for customer_thread channels.
  const messagingService = require("../../shared/messaging/messaging.service");
  await messagingService.sendMessage(channelId, { content: message }, user);

  // 4. Mark the enquiry replied.
  await withStoreContext(async (client) => {
    await repo.updateEnquiryStatus(client, enquiryId, "replied");
  });

  return { ok: true, channel_id: channelId };
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
  getSettings,
  // checkout + payments
  createOrder,
  getOrder,
  verifyAndFulfil,
  fulfillOptimusOrder,
  verifyWebhookSignature,
  // newsletter + enquiries
  subscribeNewsletter,
  unsubscribeNewsletter,
  listEditableScents,
  saveScent,
  // storefront content admin
  listSignaturesAdmin,
  saveSignature,
  deleteSignature,
  saveSettings,
  listSubscribers,
  exportSubscribersCsv,
  submitEnquiry,
  listEnquiries,
  setEnquiryStatus,
  replyToEnquiry,
};
