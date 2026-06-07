"use strict";

const chowdeck = require("./adapters/chowdeck");
const gigl = require("./adapters/gigl");
const manual = require("./adapters/manual");
const logger = require("../../config/logger");

// Get a delivery fee quote before booking
async function getQuote({ courier, pickupAddress, deliveryAddress }) {
  if (courier === "chowdeck") {
    return chowdeck.getDeliveryQuote({ pickupAddress, deliveryAddress });
  }
  // GIGL doesn't provide real-time quotes via API — return estimate
  return {
    fee: 0,
    currency: "NGN",
    estimatedMinutes: null,
    note: "Fee calculated at booking",
  };
}

// Book a courier for a delivery record
async function bookCourier({ courier, delivery, contact, items }) {
  switch (courier) {
    case "chowdeck":
      return chowdeck.createDelivery({
        pickup: delivery.pickup_address,
        delivery: delivery.delivery_address,
        contactName: contact.display_name,
        contactPhone: contact.primary_phone,
        items,
        reference: delivery.delivery_number,
      });

    case "gigl":
      return gigl.createShipment({
        senderAddress: delivery.pickup_address,
        receiverAddress: delivery.delivery_address,
        items,
        reference: delivery.delivery_number,
        weight: items.reduce((s, i) => s + (i.weight_grams || 0), 0) / 1000,
      });

    case "manual":
    default:
      return manual.createDelivery({
        contactName: contact.display_name,
        reference: delivery.delivery_number,
      });
  }
}

// Track a delivery
async function trackDelivery({ courier, courierId, waybill }) {
  if (courier === "chowdeck" && courierId) {
    return chowdeck.getStatus(courierId);
  }
  if (courier === "gigl" && waybill) {
    return gigl.trackShipment(waybill);
  }
  return {
    status: "unknown",
    note: "Manual tracking — check courier directly",
  };
}

module.exports = { getQuote, bookCourier, trackDelivery };
