"use strict";

const axios = require("axios");
const config = require("../../../config/config");
const logger = require("../../../config/logger");

const BASE = config.gigl.baseUrl;
let accessToken;

async function authenticate() {
  const { data } = await axios.post(`${BASE}/auth/token`, {
    client_id: config.gigl.clientId,
    client_secret: config.gigl.clientSecret,
    grant_type: "client_credentials",
  });
  accessToken = data.access_token;
  return accessToken;
}

function headers() {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function createShipment({
  senderAddress,
  receiverAddress,
  items,
  reference,
  weight,
}) {
  if (!accessToken) await authenticate();

  const { data } = await axios.post(
    `${BASE}/shipments`,
    {
      SenderAddress: senderAddress,
      ReceiverAddress: receiverAddress,
      Items: items,
      Weight: weight,
      ExternalRef: reference,
    },
    { headers: headers() },
  );

  logger.info(`GIGL shipment created: ${data.Waybill}`);
  return { waybill: data.Waybill, trackingUrl: data.TrackingUrl };
}

async function trackShipment(waybill) {
  if (!accessToken) await authenticate();
  const { data } = await axios.get(`${BASE}/shipments/${waybill}/track`, {
    headers: headers(),
  });
  return {
    status: data.Status,
    location: data.CurrentLocation,
    history: data.History,
  };
}

module.exports = { createShipment, trackShipment };
