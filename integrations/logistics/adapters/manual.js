"use strict";

// Manual courier — no API. Staff enter tracking details directly.
// This adapter is a no-op that returns a skeleton response.

async function createDelivery({ contactName, reference }) {
  return {
    courierId: null,
    waybill: null,
    trackingUrl: null,
    note: `Manual delivery for ${contactName} [${reference}]. Enter tracking details manually.`,
  };
}

module.exports = { createDelivery };
