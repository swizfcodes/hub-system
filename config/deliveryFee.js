"use strict";

// ── Delivery fee computation (pure, data-driven) ────────────────────────────
// The rate card (zones + settings) is loaded from the DB by the logistics
// module (<business>.delivery_zones / delivery_settings) — nothing here is
// hardcoded. Both the backend (order totals) and the frontend (checkout
// preview, via the served rate card) run this same matching logic.
//
//   rateCard = { zones: [...], settings: {...} }
//   input    = { fulfilmentType, state, city, itemCount }
//
// Rules:
//   • Pickup is free (unless settings.pickup_free === false).
//   • itemCount >= settings.bulk_threshold → bulk freight (Lagos vs nationwide).
//   • Otherwise the per-zone flat rate: Lagos matches city against a zone's
//     match_terms; nationwide matches the state. Falls back to the scope's
//     is_default zone.

function computeDeliveryFee(rateCard, input = {}) {
  const { fulfilmentType, state, city, itemCount } = input;
  const zones = (rateCard && rateCard.zones) || [];
  const settings = (rateCard && rateCard.settings) || {};

  const lagosName = (settings.lagos_state_name || "Lagos").trim().toLowerCase();
  const bulkThreshold = Number(settings.bulk_threshold || 10);
  const pickupFree = settings.pickup_free !== false;

  if ((fulfilmentType || "delivery") === "pickup" && pickupFree) {
    return { fee: 0, zoneLabel: "Store pickup", bulk: false };
  }

  const isLagos = (state || "").trim().toLowerCase() === lagosName;

  if (Number(itemCount) >= bulkThreshold) {
    return isLagos
      ? {
          fee: Number(settings.bulk_fee_lagos || 0),
          zoneLabel: "Bulk freight (within Lagos)",
          bulk: true,
        }
      : {
          fee: Number(settings.bulk_fee_nationwide || 0),
          zoneLabel: "Bulk freight (nationwide terminal)",
          bulk: true,
        };
  }

  const scope = isLagos ? "lagos" : "nationwide";
  const pool = zones
    .filter((z) => z.scope === scope && z.is_active !== false)
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  const hay = (isLagos ? city : state || "").trim().toLowerCase();
  const match = pool.find((z) =>
    (z.match_terms || []).some((t) =>
      isLagos
        ? hay.includes(String(t).toLowerCase())
        : hay === String(t).toLowerCase(),
    ),
  );
  const z = match || pool.find((zz) => zz.is_default) || null;

  return z
    ? { fee: Number(z.rate), zoneLabel: z.name, bulk: false }
    : { fee: 0, zoneLabel: "Delivery", bulk: false };
}

function computeDeliveryFeeKobo(rateCard, input) {
  return Math.round(computeDeliveryFee(rateCard, input).fee * 100);
}

module.exports = { computeDeliveryFee, computeDeliveryFeeKobo };
