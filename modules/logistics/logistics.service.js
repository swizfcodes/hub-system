"use strict";

const { withBusinessContext, nextDocumentNumber } = require("../../config/db");
const courierService = require("../../integrations/logistics/logistics.service");
const stockService = require("../stock/stock.service");
const notifService = require("../../shared/notifications/notifications.service");
const auditService = require("../../shared/audit/audit.service");
const whatsapp = require("../../integrations/messaging/adapters/whatsapp");
const { emitToBusiness } = require("../../config/sockets");
const { renderToPDF } = require("../../lib/pdf/generator");
const logger = require("../../config/logger");
const repo = require("./logistics.repository");
const { v4: uuidv4 } = require("uuid");

async function listDeliveries(
  business,
  { page = 1, limit = 50, status, courier } = {},
) {
  return withBusinessContext(business, async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    return {
      data: await repo.listDeliveries(client, {
        status,
        courier,
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

async function createDelivery(business, data, user) {
  return withBusinessContext(business, async (client) => {
    const deliveryNumber = await nextDocumentNumber(
      client,
      business,
      "delivery",
    );
    const delivery = await repo.insertDelivery(client, {
      deliveryNumber,
      reference_type: data.reference_type,
      reference_id: data.reference_id,
      contact_id: data.contact_id,
      delivery_address: data.delivery_address,
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

async function dispatchDelivery(business, deliveryId, user) {
  return withBusinessContext(business, async (client) => {
    const delivery = await repo.findDispatchable(client, deliveryId);
    if (!delivery)
      throw Object.assign(
        new Error("Delivery not found or not ready to dispatch"),
        { status: 400 },
      );

    const items = await repo.getDeliveryItems(client, deliveryId);
    const booking = await courierService.bookCourier({
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

    const updated = await repo.setDispatched(client, {
      deliveryId,
      courierId: booking.courierId,
      waybill: booking.waybill,
    });

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
          .catch(() => {});
      }
    }

    if (delivery.whatsapp_number) {
      await whatsapp
        .sendMessage({
          to: delivery.whatsapp_number,
          text: `Your order ${delivery.delivery_number} has been dispatched via ${delivery.courier.toUpperCase()}. ${booking.trackingUrl ? `Track: ${booking.trackingUrl}` : "We will update you when it arrives."}`,
        })
        .catch((err) =>
          logger.warn("WhatsApp dispatch notification failed", err),
        );
    }

    // Generate signature token (48h expiry) for proof-of-delivery signing page
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

    const signingUrl = `${process.env.HUB_BASE_URL}/sign/${signatureToken}`;
    if (delivery.whatsapp_number) {
      await whatsapp
        .sendMessage({
          to: delivery.whatsapp_number,
          text:
            `Your Orika order ${delivery.delivery_number} is here — please confirm receipt:\n` +
            `${signingUrl}\n\n` +
            `${booking.trackingUrl ? `Track your order: ${booking.trackingUrl}` : ""}`,
        })
        .catch((err) =>
          logger.warn("WhatsApp signing URL notification failed", err),
        );
    }

    emitToBusiness(business, "delivery:dispatched", {
      deliveryId,
      courierId: booking.courierId,
      status: "dispatched",
    });
    return updated;
  });
}

async function markDelivered(business, deliveryId, user) {
  return withBusinessContext(business, async (client) => {
    const delivery = await repo.setDelivered(client, deliveryId);
    if (!delivery)
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

    const contact = await repo.getDeliveryContact(client, deliveryId);
    if (contact?.whatsapp_number) {
      await whatsapp
        .sendMessage({
          to: contact.whatsapp_number,
          text: `Your order ${delivery.delivery_number} has been delivered successfully. Thank you for shopping with us!`,
        })
        .catch(() => {});
    }

    emitToBusiness(business, "delivery:delivered", { deliveryId });
    return delivery;
  });
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

  const suggestions = {
    lagos: [
      {
        courier: "relay",
        label: "Relay (Same-day)",
        estimated_hours: "2–4",
        recommended: true,
      },
      {
        courier: "chowdeck",
        label: "Chowdeck",
        estimated_hours: "1–3",
        recommended: false,
      },
      {
        courier: "manual",
        label: "Manual / In-house",
        estimated_hours: "Varies",
        recommended: false,
      },
    ],
    interstate: [
      {
        courier: "gigl",
        label: "GIG Logistics",
        estimated_hours: "24–72",
        recommended: true,
      },
      {
        courier: "manual",
        label: "Manual / DHL",
        estimated_hours: "Varies",
        recommended: false,
      },
    ],
    international: [
      {
        courier: "manual",
        label: "Manual / DHL",
        estimated_hours: "Varies",
        recommended: true,
      },
    ],
  };

  const options = suggestions[zone] || suggestions.international;
  const quotedOptions = await Promise.all(
    options.map(async (opt) => {
      if (opt.courier === "manual") return { ...opt, fee: null };
      try {
        const quote = await courierService.getQuote({
          courier: opt.courier,
          pickupAddress:
            process.env.HUB_WAREHOUSE_ADDRESS || "Lekki TownSquare Mall, Lagos",
          deliveryAddress: address,
        });
        return { ...opt, fee: quote.fee, currency: "NGN" };
      } catch {
        return { ...opt, fee: null, fee_error: "Quote unavailable" };
      }
    }),
  );

  return { zone, options: quotedOptions };
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
      throw Object.assign(
        new Error("Only failed deliveries can be returned"),
        { status: 400 },
      );

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

  const items = Array.isArray(delivery.items) ? delivery.items.filter(Boolean) : [];
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
      const addrObj = typeof addrRaw === "string" ? JSON.parse(addrRaw) : addrRaw;
      addressStr = [addrObj.line1, addrObj.line2, addrObj.city, addrObj.state]
        .filter(Boolean)
        .join(", ");
    } catch {
      addressStr = String(addrRaw);
    }
  }

  const templateData = {
    delivery_number:  esc(delivery.delivery_number || "—"),
    contact_name:     esc(delivery.contact_name || "—"),
    primary_phone:    esc(delivery.primary_phone || "—"),
    delivery_address: esc(addressStr),
    courier:          esc(delivery.courier || "—"),
    waybill_number:   esc(delivery.waybill_number || "—"),
    created_at:       fmtDate(delivery.created_at),
    dispatched_at:    fmtDate(delivery.dispatched_at),
    items_html:       itemsHtml,
    waybill_style:    delivery.waybill_number ? "" : "display:none",
  };

  return renderToPDF("packing-slip", templateData);
}

module.exports = {
  listDeliveries,
  getDelivery,
  createDelivery,
  dispatchDelivery,
  markDelivered,
  markFailed,
  getTracking,
  getQuote,
  suggestCouriers,
  markReturned,
  generatePackingSlip,
};
