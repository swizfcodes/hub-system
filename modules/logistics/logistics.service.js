"use strict";

const { withBusinessContext, nextDocumentNumber } = require("../../config/db");
const courierService = require("../../integrations/logistics/logistics.service");
const stockService = require("../stock/stock.service");
const notifService = require("../../shared/notifications/notifications.service");
const auditService = require("../../shared/audit/audit.service");
// EXTERNAL-COMMS-DISABLED: WhatsApp adapter needs Meta API access.
// const whatsapp = require("../../integrations/messaging/adapters/whatsapp");
const { emitToBusiness } = require("../../config/sockets");
const { renderToPDF } = require("../../lib/pdf/generator");
const logger = require("../../config/logger");
const repo = require("./logistics.repository");
const { v4: uuidv4 } = require("uuid");
const { computeDeliveryFee } = require("../../config/deliveryFee");

async function listDeliveries(
  business,
  { page = 1, limit = 50, status, courier, search } = {},
) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    return {
      data: await repo.listDeliveries(client, {
        status,
        courier,
        search,
        limit: parseInt(limit),
        offset,
      }),
    };
  });
}

async function getDelivery(business, deliveryId) {
  return withBusinessContext(business, async (client) => {
    const delivery = await repo.findDeliveryById(client, deliveryId);
    if (!delivery)
      throw Object.assign(new Error("Delivery not found"), { status: 404 });
    return delivery;
  });
}

// PATCH — update editable delivery fields (waybill, fee, courier ID)
async function updateDeliveryDetails(business, deliveryId, data, user) {
  return withBusinessContext(business, async (client) => {
    const existing = await repo.findDeliveryById(client, deliveryId);
    if (!existing)
      throw Object.assign(new Error("Delivery not found"), { status: 404 });

    // Only allow certain fields to be updated manually
    const allowed = [
      "waybill_number",
      "courier_order_id",
      "delivery_fee",
      "courier_company",
      "driver_name",
      "driver_phone",
    ];
    const fields = {};
    for (const key of allowed) {
      if (data[key] !== undefined) fields[key] = data[key];
    }

    const updated = await repo.updateDelivery(client, deliveryId, fields);

    // Add a tracking entry for the manual update
    if (data.waybill_number) {
      await repo.insertTrackingEntry(client, {
        delivery_id: deliveryId,
        status: existing.status,
        source: "manual",
        message: `Waybill updated: ${data.waybill_number}`,
      });
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: "staff",
      business,
      module: "logistics",
      action: "update",
      table: "deliveries",
      recordId: deliveryId,
      before: existing,
      after: updated,
    });

    return updated;
  });
}

async function createDelivery(business, data, user) {
  return withBusinessContext(business, async (client) => {
    // Standalone (manual) deliveries have no order behind them — they
    // must carry their own item list so the packing slip and delivery
    // note have content.
    if (
      data.reference_type === "manual" &&
      (!data.items || !data.items.length)
    ) {
      throw Object.assign(
        new Error("Add at least one item to a standalone delivery"),
        { status: 400 },
      );
    }
    // Idempotency guard — a single sale must never spawn two deliveries.
    // Both the sales auto-push (on order creation) and a manual "hand to
    // logistics" call this with the same order reference; if a delivery
    // already exists for that order (and hasn't failed/returned), reuse it
    // instead of creating a duplicate.
    if (data.reference_type !== "manual" && data.reference_id) {
      const existing = await repo.findActiveDeliveryByReference(
        client,
        data.reference_type,
        data.reference_id,
      );
      if (existing) {
        logger.info(
          `[logistics] delivery ${existing.delivery_number} already exists for ` +
            `${data.reference_type} ${data.reference_id} — reusing instead of creating a duplicate`,
        );
        return existing;
      }
    }

    // Carry the address (and contact) through from the source order so
    // staff never re-key what the customer already gave at checkout. The
    // sales order / POS transaction already holds delivery_address; only
    // fall back to a body-supplied address (manual deliveries, or an
    // explicit override) when the source has none.
    let resolvedAddress = data.delivery_address || null;
    let resolvedContactId = data.contact_id || null;
    if (data.reference_type === "sales_order" && data.reference_id) {
      const order = await repo.getOrderForDelivery(client, data.reference_id);
      if (order) {
        if (!resolvedAddress) resolvedAddress = order.delivery_address || null;
        if (!resolvedContactId) resolvedContactId = order.contact_id || null;
      }
    } else if (data.reference_type === "pos_transaction" && data.reference_id) {
      const tx = await repo.getPosTransactionForDelivery(
        client,
        data.reference_id,
      );
      if (tx && !resolvedContactId) resolvedContactId = tx.contact_id || null;
    }

    const addressEmpty =
      !resolvedAddress ||
      (typeof resolvedAddress === "object" &&
        Object.keys(resolvedAddress).length === 0);
    if (data.reference_type !== "manual" && addressEmpty) {
      throw Object.assign(
        new Error(
          "This order has no delivery address on file. Add one to the " +
            "order first, or supply it with the delivery.",
        ),
        { status: 400 },
      );
    }

    const deliveryNumber = await nextDocumentNumber(
      client,
      business,
      "delivery",
    );
    const delivery = await repo.insertDelivery(client, {
      deliveryNumber,
      reference_type: data.reference_type,
      reference_id: data.reference_id || null,
      contact_id: resolvedContactId,
      delivery_address: resolvedAddress,
      courier: data.courier,
      deliveryFee: data.delivery_fee || 0,
      fee_borne_by: data.fee_borne_by,
      userId: user.user_id,
    });

    if (data.items && data.items.length) {
      for (const item of data.items) {
        await repo.insertDeliveryItem(client, {
          delivery_id: delivery.delivery_id,
          product_id: item.product_id,
          description: item.description,
          quantity: item.quantity,
        });
      }
    } else {
      const lines =
        data.reference_type === "sales_order"
          ? await repo.getOrderLines(client, data.reference_id)
          : data.reference_type === "pos_transaction"
            ? await repo.getPOSLines(client, data.reference_id)
            : [];
      for (const l of lines) {
        await repo.insertDeliveryItem(client, {
          delivery_id: delivery.delivery_id,
          product_id: l.product_id,
          description: l.description,
          quantity: l.quantity,
        });
      }
    }

    await repo.insertTrackingEntry(client, {
      delivery_id: delivery.delivery_id,
      status: "pending_dispatch",
      source: "system",
      message: "Delivery created and awaiting dispatch",
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: "staff",
      business,
      module: "logistics",
      action: "create",
      table: "deliveries",
      recordId: delivery.delivery_id,
      after: delivery,
    });
    return delivery;
  });
}

/**
 * Dispatch a delivery — MANUAL-FIRST.
 *
 * Courier APIs (GIGL / Chowdeck) are not connected yet, so staff book
 * the ride themselves (Uber / Bolt / inDrive / any courier) and enter
 * the details here: courier company, driver name + phone, optional
 * booking/waybill reference. We:
 *   1. record the driver details + waybill,
 *   2. flip the delivery to 'dispatched',
 *   3. mint a 48 h proof-of-delivery signing token, and
 *   4. EMAIL the customer the dispatch notice + signing link
 *      (WhatsApp returns when the Meta API is available).
 *
 * If a real courier API is ever connected, the adapter path still runs
 * for gigl/chowdeck/relay — and degrades gracefully to manual when the
 * call fails.
 *
 * Stock note: deliveries that reference a POS sale or sales order do
 * NOT move stock here — the sale already did. Only standalone
 * ('manual' reference) deliveries deduct stock at dispatch.
 */
async function dispatchDelivery(business, deliveryId, data = {}, user) {
  const result = await withBusinessContext(business, async (client) => {
    const delivery = await repo.findDispatchable(client, deliveryId);
    if (!delivery)
      throw Object.assign(
        new Error("Delivery not found or not ready to dispatch"),
        { status: 400 },
      );

    const items = await repo.getDeliveryItems(client, deliveryId);

    // Try the courier API only for integrated couriers; never let an
    // unavailable API block a dispatch.
    let booking = { courierId: null, waybill: null, trackingUrl: null };
    if (["gigl", "chowdeck", "relay"].includes(delivery.courier)) {
      try {
        booking = await courierService.bookCourier({
          courier: delivery.courier,
          delivery: { ...delivery, pickup_address: "Hub Warehouse, Lagos" },
          contact: {
            display_name: delivery.display_name,
            primary_phone: delivery.primary_phone,
          },
          items: items.map((i) => ({
            description: i.description,
            quantity: i.quantity,
            weight_grams: i.weight_grams,
          })),
        });
      } catch (err) {
        logger.warn(
          `[logistics] ${delivery.courier} API unavailable — dispatching manually: ${err.message}`,
        );
        await repo.insertTrackingEntry(client, {
          delivery_id: deliveryId,
          status: "pending_dispatch",
          source: "system",
          message: `${delivery.courier} API unavailable — dispatched with manually entered details`,
        });
      }
    }

    const updated = await repo.setDispatched(client, {
      deliveryId,
      courierId: booking.courierId,
      waybill: data.waybill_number || booking.waybill,
      courierCompany: data.courier_company,
      driverName: data.driver_name,
      driverPhone: data.driver_phone,
      deliveryFee: data.delivery_fee,
    });

    // Stock: only standalone deliveries move inventory here. Sales/POS
    // references were already deducted when the sale was recorded —
    // deducting again was a double-count bug.
    if (delivery.reference_type === "manual") {
      for (const item of items) {
        if (item.product_id) {
          await stockService
            .recordMovement(client, {
              business,
              productId: item.product_id,
              movementType: "sold",
              quantity: item.quantity,
              direction: -1,
              referenceType: "delivery",
              referenceId: deliveryId,
              performedBy: user.user_id,
            })
            .catch((err) =>
              logger.warn(
                `[logistics] stock movement failed for ${item.product_id}: ${err.message}`,
              ),
            );
        }
      }
    }

    const driverBits = [data.driver_name, data.driver_phone]
      .filter(Boolean)
      .join(" · ");
    await repo.insertTrackingEntry(client, {
      delivery_id: deliveryId,
      status: "dispatched",
      source: "manual",
      message:
        `Dispatched${data.courier_company ? ` via ${data.courier_company}` : ""}` +
        (driverBits ? ` — driver: ${driverBits}` : ""),
    });

    // Proof-of-delivery signing token (48 h).
    const signatureToken = uuidv4();
    const tokenExpiresAt = new Date(
      Date.now() + 48 * 60 * 60 * 1000,
    ).toISOString();
    await client.query(
      `UPDATE deliveries
       SET signature_token = $1, token_expires_at = $2
       WHERE delivery_id = $3`,
      [signatureToken, tokenExpiresAt, deliveryId],
    );

    emitToBusiness(business, "delivery:dispatched", {
      deliveryId,
      status: "dispatched",
    });
    return { updated, delivery, items, signatureToken };
  });

  // Email the customer outside the transaction — a slow SMTP server
  // must never roll back or delay the dispatch itself.
  const emailed = await sendDispatchEmail(business, deliveryId, result).catch(
    (err) => {
      logger.warn(`[logistics] dispatch email failed: ${err.message}`);
      return false;
    },
  );

  return { ...result.updated, customer_emailed: emailed };
}

/** Email the dispatch notice + signing link to the delivery's contact. */
async function sendDispatchEmail(business, deliveryId, { delivery, items, signatureToken }) {
  const { sendEmail } = require("../../lib/email/sender");
  const { renderEmail } = require("../../lib/email/render");
  const { pool } = require("../../config/db");

  const {
    rows: [contact],
  } = await pool.query(
    `SELECT c.email, c.display_name
     FROM shared.contacts c
     JOIN ${business}.deliveries d ON d.contact_id = c.contact_id
     WHERE d.delivery_id = $1`,
    [deliveryId],
  );
  if (!contact?.email) return false;

  const {
    rows: [fresh],
  } = await pool.query(
    `SELECT delivery_number, delivery_address, courier, courier_company,
            driver_name, driver_phone
     FROM ${business}.deliveries WHERE delivery_id = $1`,
    [deliveryId],
  );

  const addr = fresh.delivery_address || {};
  const addressStr = [addr.line1, addr.area, addr.city, addr.state]
    .filter(Boolean)
    .join(", ");

  const baseUrl = process.env.HUB_BASE_URL || "";
  const { subject, html } = renderEmail("delivery_dispatched", business, {
    delivery_number: fresh.delivery_number,
    contact_name: contact.display_name,
    delivery_address: addressStr || "your address",
    courier_label:
      fresh.courier_company ||
      (fresh.courier !== "manual" ? fresh.courier.toUpperCase() : ""),
    driver_name: fresh.driver_name,
    driver_phone: fresh.driver_phone,
    items: (items || []).map((i) => ({
      description: i.description,
      quantity: i.quantity,
    })),
    signing_url: baseUrl ? `${baseUrl}/sign/${signatureToken}` : null,
  });

  await sendEmail({ to: contact.email, subject, html, business });
  return true;
}

/**
 * Re-issue the signing link (fresh 48 h token) and email it again —
 * for expired links or "customer didn't get the email".
 */
async function resendSigningLink(business, deliveryId, user) {
  const result = await withBusinessContext(business, async (client) => {
    const delivery = await repo.findDeliveryById(client, deliveryId);
    if (!delivery)
      throw Object.assign(new Error("Delivery not found"), { status: 404 });
    if (!["dispatched", "picked_up", "in_transit"].includes(delivery.status))
      throw Object.assign(
        new Error("Signing links only apply to in-transit deliveries"),
        { status: 400 },
      );
    if (delivery.signed_at)
      throw Object.assign(new Error("This delivery is already signed"), {
        status: 400,
      });

    const signatureToken = uuidv4();
    const tokenExpiresAt = new Date(
      Date.now() + 48 * 60 * 60 * 1000,
    ).toISOString();
    await client.query(
      `UPDATE deliveries
       SET signature_token = $1, token_expires_at = $2, updated_at = now()
       WHERE delivery_id = $3`,
      [signatureToken, tokenExpiresAt, deliveryId],
    );
    await repo.insertTrackingEntry(client, {
      delivery_id: deliveryId,
      status: delivery.status,
      source: "manual",
      message: "Signing link re-sent to customer",
    });
    const items = await repo.getDeliveryItems(client, deliveryId);
    return { delivery, items, signatureToken };
  });

  const emailed = await sendDispatchEmail(business, deliveryId, result).catch(
    (err) => {
      logger.warn(`[logistics] resend email failed: ${err.message}`);
      return false;
    },
  );
  if (!emailed) {
    throw Object.assign(
      new Error(
        "Could not email the customer — check that the contact has an email address.",
      ),
      { status: 400 },
    );
  }
  return { sent: true };
}

async function markDelivered(business, deliveryId, user) {
  const delivery = await withBusinessContext(business, async (client) => {
    const updated = await repo.setDelivered(client, deliveryId);
    if (!updated)
      throw Object.assign(
        new Error("Delivery not found or cannot be marked delivered"),
        { status: 400 },
      );

    await repo.insertTrackingEntry(client, {
      delivery_id: deliveryId,
      status: "delivered",
      source: "manual",
      message: "Marked as delivered by staff",
    });

    // Close the loop on the order: a delivered sales order is fulfilled.
    // This is what advances paid orders (web, B2B, POS-delivery) out of
    // "confirmed" once the goods actually reach the customer, instead of
    // them sitting confirmed forever.
    if (updated.reference_type === "sales_order" && updated.reference_id) {
      await client.query(
        `UPDATE sales_orders
         SET status = 'fulfilled', updated_at = now()
         WHERE order_id = $1
           AND status IN ('confirmed', 'partially_fulfilled')`,
        [updated.reference_id],
      );
    }

    emitToBusiness(business, "delivery:delivered", { deliveryId });
    return updated;
  });

  // Courtesy email — best-effort, never blocks the status change.
  // (WhatsApp notification returns when the Meta API is available.)
  try {
    const { sendEmail } = require("../../lib/email/sender");
    const { renderEmail } = require("../../lib/email/render");
    const { pool } = require("../../config/db");
    const {
      rows: [contact],
    } = await pool.query(
      `SELECT c.email, c.display_name
       FROM shared.contacts c
       JOIN ${business}.deliveries d ON d.contact_id = c.contact_id
       WHERE d.delivery_id = $1`,
      [deliveryId],
    );
    if (contact?.email) {
      const { subject, html } = renderEmail("delivery_completed", business, {
        delivery_number: delivery.delivery_number,
        contact_name: contact.display_name,
        has_note: false,
      });
      await sendEmail({ to: contact.email, subject, html, business });
    }
  } catch (err) {
    logger.warn(`[logistics] delivered email failed: ${err.message}`);
  }

  return delivery;
}

async function markFailed(business, deliveryId, { failure_reason }, user) {
  return withBusinessContext(business, async (client) => {
    const delivery = await repo.setFailed(client, {
      deliveryId,
      failure_reason,
    });
    if (!delivery)
      throw Object.assign(new Error("Cannot update this delivery"), {
        status: 400,
      });

    await repo.insertTrackingEntry(client, {
      delivery_id: deliveryId,
      status: "failed",
      source: "manual",
      message: `Delivery failed: ${failure_reason}`,
    });

    const managers = await repo.getLogisticsManagers(client, business);
    for (const m of managers) {
      await notifService.create(client, {
        userId: m.user_id,
        business,
        type: "delivery_update",
        title: `Delivery failed: ${delivery.delivery_number}`,
        body: failure_reason,
        referenceType: "delivery",
        referenceId: deliveryId,
        actionUrl: `/logistics/${deliveryId}`,
      });
    }

    return delivery;
  });
}

async function getTracking(business, deliveryId) {
  return withBusinessContext(business, async (client) => {
    return { data: await repo.getTracking(client, deliveryId) };
  });
}

async function getQuote({ courier, pickup_address, delivery_address }) {
  return courierService.getQuote({
    courier,
    pickupAddress: pickup_address,
    deliveryAddress: delivery_address,
  });
}

async function suggestCouriers({ delivery_address }) {
  const address =
    typeof delivery_address === "string"
      ? JSON.parse(delivery_address)
      : delivery_address;

  const state = (address.state || "").toLowerCase();
  const country = (address.country || "Nigeria").toLowerCase();

  let zone;
  if (state.includes("lagos")) zone = "lagos";
  else if (country === "nigeria") zone = "interstate";
  else zone = "international";

  // MANUAL-FIRST: courier APIs (GIGL / Chowdeck) are not connected yet,
  // so the recommended option everywhere is booking a ride yourself
  // (Uber / Bolt / inDrive / a dispatch rider) and entering the driver's
  // details at dispatch. API-integrated options return when keys exist.
  const suggestions = {
    lagos: [
      {
        courier: "manual",
        label: "Book a ride (Uber / Bolt / inDrive)",
        estimated_hours: "1–4",
        recommended: true,
        note: "Book the ride yourself, then enter the driver's details when dispatching.",
      },
      {
        courier: "chowdeck",
        label: "Chowdeck",
        estimated_hours: "1–3",
        recommended: false,
        note: "API not connected yet — details entered manually.",
      },
    ],
    interstate: [
      {
        courier: "manual",
        label: "GIG / ABC / God is Good (book at park)",
        estimated_hours: "24–72",
        recommended: true,
        note: "Book with the carrier, then enter the waybill when dispatching.",
      },
      {
        courier: "gigl",
        label: "GIG Logistics",
        estimated_hours: "24–72",
        recommended: false,
        note: "API not connected yet — details entered manually.",
      },
    ],
    international: [
      {
        courier: "manual",
        label: "DHL / FedEx (book directly)",
        estimated_hours: "Varies",
        recommended: true,
        note: "Book with the carrier, then enter the tracking number when dispatching.",
      },
    ],
  };

  const options = (suggestions[zone] || suggestions.international).map(
    (opt) => ({ ...opt, fee: null }),
  );

  return { zone, options };
}

async function markReturned(business, deliveryId, { notes }, user) {
  return withBusinessContext(business, async (client) => {
    const {
      rows: [delivery],
    } = await client.query(
      `UPDATE deliveries SET status='returned', updated_at=now()
       WHERE delivery_id=$1 AND status='failed' RETURNING *`,
      [deliveryId],
    );
    if (!delivery)
      throw Object.assign(new Error("Only failed deliveries can be returned"), {
        status: 400,
      });

    // Auto-restock — reverse the dispatch stock movement
    const items = await repo.getDeliveryItems(client, deliveryId);
    for (const item of items) {
      if (item.product_id) {
        await stockService
          .recordMovement(client, {
            business,
            productId: item.product_id,
            movementType: "return_from_customer",
            quantity: item.quantity,
            direction: 1,
            referenceType: "delivery_return",
            referenceId: deliveryId,
            notes: notes || "Return to sender",
            performedBy: user.user_id,
          })
          .catch((err) =>
            logger.warn(
              `[logistics] restock failed for item ${item.product_id}`,
              err,
            ),
          );
      }
    }

    await repo.insertTrackingEntry(client, {
      delivery_id: deliveryId,
      status: "returned",
      source: "manual",
      message: `Returned to sender${notes ? ": " + notes : ""}`,
    });

    const managers = await repo.getLogisticsManagers(client, business);
    for (const m of managers) {
      await notifService.create(client, {
        userId: m.user_id,
        business,
        type: "delivery_update",
        title: `Delivery returned: ${delivery.delivery_number}`,
        body: "Package returned to sender. Stock has been restocked.",
        referenceType: "delivery",
        referenceId: deliveryId,
        actionUrl: `/logistics/${deliveryId}`,
      });
    }

    return delivery;
  });
}

async function generatePackingSlip(business, deliveryId) {
  const delivery = await getDelivery(business, deliveryId);

  const fmtDate = (d) =>
    d
      ? new Date(d).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "—";
  const esc = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const items = Array.isArray(delivery.items)
    ? delivery.items.filter(Boolean)
    : [];
  const itemsHtml = items
    .map(
      (item, i) => `
    <tr class="${i % 2 === 0 ? "row-even" : "row-odd"}">
      <td class="c-num">${i + 1}</td>
      <td class="c-desc">${esc(item.description)}</td>
      <td class="c-qty">${Number(item.quantity || 0)}</td>
    </tr>`,
    )
    .join("");

  const addrRaw = delivery.delivery_address;
  let addressStr = "—";
  if (addrRaw) {
    try {
      const addrObj =
        typeof addrRaw === "string" ? JSON.parse(addrRaw) : addrRaw;
      addressStr = [addrObj.line1, addrObj.line2, addrObj.city, addrObj.state]
        .filter(Boolean)
        .join(", ");
    } catch {
      addressStr = String(addrRaw);
    }
  }

  const templateData = {
    delivery_number: esc(delivery.delivery_number || "—"),
    contact_name: esc(delivery.contact_name || "—"),
    primary_phone: esc(delivery.primary_phone || "—"),
    delivery_address: esc(addressStr),
    courier: esc(delivery.courier || "—"),
    waybill_number: esc(delivery.waybill_number || "—"),
    created_at: fmtDate(delivery.created_at),
    dispatched_at: fmtDate(delivery.dispatched_at),
    items_html: itemsHtml,
    waybill_style: delivery.waybill_number ? "" : "display:none",
  };

  return renderToPDF("packing-slip", templateData, business);
}

// ── Delivery zones / rate card (storefront delivery pricing) ─────────────────

async function getRateCard(business) {
  return withBusinessContext(business, (client) => repo.getRateCard(client));
}

async function listZones(business) {
  return withBusinessContext(business, async (client) => ({
    data: await repo.listZones(client),
  }));
}

async function createZone(business, data) {
  return withBusinessContext(business, (client) => repo.insertZone(client, data));
}

async function updateZone(business, id, data) {
  return withBusinessContext(business, async (client) => {
    const z = await repo.updateZone(client, id, data);
    if (!z) throw Object.assign(new Error("Delivery zone not found"), { status: 404 });
    return z;
  });
}

async function deleteZone(business, id) {
  return withBusinessContext(business, async (client) => {
    const z = await repo.deleteZone(client, id);
    if (!z) throw Object.assign(new Error("Delivery zone not found"), { status: 404 });
    return { deleted: true };
  });
}

async function getDeliverySettings(business) {
  return withBusinessContext(business, (client) => repo.getDeliverySettings(client));
}

async function updateDeliverySettings(business, data) {
  return withBusinessContext(business, (client) =>
    repo.updateDeliverySettings(client, data),
  );
}

// Quote a delivery fee for a destination + cart size, from the DB rate card.
async function quoteDelivery(business, input) {
  return withBusinessContext(business, async (client) => {
    const rateCard = await repo.getRateCard(client);
    return computeDeliveryFee(rateCard, input);
  });
}

module.exports = {
  listDeliveries,
  getDelivery,
  updateDeliveryDetails,
  createDelivery,
  dispatchDelivery,
  resendSigningLink,
  markDelivered,
  markFailed,
  getTracking,
  getQuote,
  suggestCouriers,
  markReturned,
  generatePackingSlip,
  // delivery zones / rate card
  getRateCard,
  listZones,
  createZone,
  updateZone,
  deleteZone,
  getDeliverySettings,
  updateDeliverySettings,
  quoteDelivery,
};
