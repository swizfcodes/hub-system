"use strict";

const axios = require("axios");
const config = require("../../../config/config");
const logger = require("../../../config/logger");

const BASE = config.chowdeck.baseUrl;
const HEADERS = {
  Authorization: `Bearer ${config.chowdeck.apiKey}`,
  "Content-Type": "application/json",
};

// Get a live delivery fee quote
async function getDeliveryQuote({ pickupAddress, deliveryAddress }) {
  const { data } = await axios.post(
    `${BASE}/v1/delivery/quote`,
    {
      pickup: pickupAddress,
      delivery: deliveryAddress,
    },
    { headers: HEADERS },
  );
  return {
    fee: data.amount,
    currency: "NGN",
    estimatedMinutes: data.eta_minutes,
  };
}

// Book a rider
async function createDelivery({
  pickup,
  delivery,
  contactName,
  contactPhone,
  items,
  reference,
}) {
  const { data } = await axios.post(
    `${BASE}/v1/delivery/create`,
    {
      pickup_address: pickup,
      delivery_address: delivery,
      recipient_name: contactName,
      recipient_phone: contactPhone,
      order_id: reference,
      items,
    },
    { headers: HEADERS },
  );

  logger.info(`Chowdeck delivery created: ${data.tracking_id}`);
  return { courierId: data.tracking_id, trackingUrl: data.tracking_url };
}

// Get current delivery status
async function getStatus(courierId) {
  const { data } = await axios.get(`${BASE}/v1/delivery/${courierId}`, {
    headers: HEADERS,
  });
  return { status: data.status, location: data.rider_location };
}

module.exports = { getDeliveryQuote, createDelivery, getStatus };
