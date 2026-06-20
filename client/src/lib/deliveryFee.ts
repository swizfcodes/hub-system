// ── Delivery fee computation (pure, data-driven) ──────────────────────────────
// The rate card (zones + settings) is managed in the logistics module and
// served by the backend (e.g. on the campaign landing payload as
// `delivery_rate_card`). Nothing here is hardcoded — this only runs the same
// matching logic the backend uses, over the rates it was given.

export interface DeliveryZone {
  zone_id?: string;
  name: string;
  scope: "lagos" | "nationwide";
  match_terms: string[];
  rate: number;
  is_default?: boolean;
  display_order?: number;
  is_active?: boolean;
}

export interface DeliverySettings {
  lagos_state_name?: string;
  bulk_threshold?: number;
  bulk_fee_lagos?: number;
  bulk_fee_nationwide?: number;
  pickup_free?: boolean;
}

export interface DeliveryRateCard {
  zones: DeliveryZone[];
  settings: DeliverySettings;
}

export interface DeliveryQuote {
  fee: number;
  zoneLabel: string;
  bulk: boolean;
}

export interface DeliveryInput {
  fulfilmentType?: string | null;
  state?: string | null;
  city?: string | null;
  itemCount: number;
}

export function computeDeliveryFee(
  rateCard: DeliveryRateCard | null | undefined,
  input: DeliveryInput,
): DeliveryQuote {
  const zones = rateCard?.zones ?? [];
  const settings = rateCard?.settings ?? {};
  const lagosName = (settings.lagos_state_name ?? "Lagos").trim().toLowerCase();
  const bulkThreshold = Number(settings.bulk_threshold ?? 10);
  const pickupFree = settings.pickup_free !== false;

  if ((input.fulfilmentType || "delivery") === "pickup" && pickupFree) {
    return { fee: 0, zoneLabel: "Store pickup", bulk: false };
  }

  const isLagos = (input.state || "").trim().toLowerCase() === lagosName;

  if (input.itemCount >= bulkThreshold) {
    return isLagos
      ? {
          fee: Number(settings.bulk_fee_lagos ?? 0),
          zoneLabel: "Bulk freight (within Lagos)",
          bulk: true,
        }
      : {
          fee: Number(settings.bulk_fee_nationwide ?? 0),
          zoneLabel: "Bulk freight (nationwide terminal)",
          bulk: true,
        };
  }

  const scope = isLagos ? "lagos" : "nationwide";
  const pool = zones
    .filter((z) => z.scope === scope && z.is_active !== false)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  const hay = ((isLagos ? input.city : input.state) || "")
    .trim()
    .toLowerCase();
  const match = pool.find((z) =>
    (z.match_terms || []).some((t) =>
      isLagos
        ? hay.includes(String(t).toLowerCase())
        : hay === String(t).toLowerCase(),
    ),
  );
  const z = match ?? pool.find((zz) => zz.is_default);

  return z
    ? { fee: Number(z.rate), zoneLabel: z.name, bulk: false }
    : { fee: 0, zoneLabel: "Delivery", bulk: false };
}
