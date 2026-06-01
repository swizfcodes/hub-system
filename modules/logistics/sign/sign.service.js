"use strict";

const { pool } = require("../../../config/db");
const { getActiveBusinesses } = require("../../../config/businesses");
const { renderToPDF } = require("../../../lib/pdf/generator");
const logger = require("../../../config/logger");

// Find which business schema owns a delivery by its signature token.
// We search all active schemas — deliveries.business column is the
// canonical way once the migration (PATCH_NOTES §9) is applied.
async function findDeliveryByToken(token) {
  for (const business of getActiveBusinesses()) {
    const { rows } = await pool.query(
      `SELECT d.delivery_id, d.delivery_number, d.status,
              d.delivery_address, d.token_expires_at, d.signed_at,
              d.courier, d.business,
              c.display_name AS contact_name,
              json_agg(
                json_build_object(
                  'description', di.description,
                  'quantity',    di.quantity
                ) ORDER BY di.item_id
              ) AS items
       FROM ${business}.deliveries d
       JOIN shared.contacts c ON c.contact_id = d.contact_id
       LEFT JOIN ${business}.delivery_items di ON di.delivery_id = d.delivery_id
       WHERE d.signature_token = $1
       GROUP BY d.delivery_id, c.display_name`,
      [token],
    );
    if (rows.length) return { delivery: rows[0], business };
  }
  return null;
}

async function getSigningInfo(token) {
  const result = await findDeliveryByToken(token);

  if (!result)
    throw Object.assign(new Error("Invalid or expired signing link"), {
      status: 404,
    });

  const { delivery } = result;

  if (delivery.signed_at)
    throw Object.assign(new Error("This delivery has already been signed"), {
      status: 410,
    });

  if (new Date(delivery.token_expires_at) < new Date())
    throw Object.assign(new Error("Signing link has expired"), {
      status: 410,
    });

  return {
    delivery_number: delivery.delivery_number,
    contact_name: delivery.contact_name,
    delivery_address: delivery.delivery_address,
    items: delivery.items,
    already_signed: !!delivery.signed_at,
  };
}

async function submitSignatures(
  token,
  { customer_signature, driver_signature, customer_name, driver_name },
) {
  // Validate base64 PNG data URIs
  if (!customer_signature.startsWith("data:image/png;base64,"))
    throw Object.assign(new Error("Invalid customer signature format"), {
      status: 400,
    });
  if (!driver_signature.startsWith("data:image/png;base64,"))
    throw Object.assign(new Error("Invalid driver signature format"), {
      status: 400,
    });

  // Max 500 KB per signature
  const MAX_BYTES = 500 * 1024;
  const cusSize = Buffer.byteLength(customer_signature.split(",")[1], "base64");
  const drvSize = Buffer.byteLength(driver_signature.split(",")[1], "base64");
  if (cusSize > MAX_BYTES || drvSize > MAX_BYTES)
    throw Object.assign(new Error("Signature too large"), { status: 400 });

  const result = await findDeliveryByToken(token);
  if (!result)
    throw Object.assign(new Error("Invalid or expired signing link"), {
      status: 404,
    });

  const { delivery, business } = result;

  if (delivery.signed_at)
    throw Object.assign(new Error("This delivery has already been signed"), {
      status: 410,
    });

  if (new Date(delivery.token_expires_at) < new Date())
    throw Object.assign(new Error("Signing link has expired"), {
      status: 410,
    });

  const now = new Date().toISOString();

  await pool.query(
    `UPDATE ${business}.deliveries
     SET customer_signature  = $1,
         driver_signature    = $2,
         customer_signed_at  = $3,
         driver_signed_at    = $3,
         signed_at           = $3,
         status              = 'delivered',
         delivered_at        = $3,
         signature_token     = NULL,
         updated_at          = $3
     WHERE delivery_id = $4
       AND signed_at IS NULL
       AND token_expires_at > now()`,
    [customer_signature, driver_signature, now, delivery.delivery_id],
  );

  // Generate delivery note PDF asynchronously — don't block the response
  generateDeliveryNotePDF({
    business,
    deliveryId: delivery.delivery_id,
    customer_name,
    driver_name,
    customer_signature,
    driver_signature,
  }).catch((err) => logger.error("Delivery note PDF generation failed", err));

  return { success: true, message: "Delivery confirmed. Thank you!" };
}

async function generateDeliveryNotePDF({
  business,
  deliveryId,
  customer_name,
  driver_name,
  customer_signature,
  driver_signature,
}) {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, c.display_name AS contact_name,
              json_agg(
                json_build_object(
                  'description', di.description,
                  'quantity',    di.quantity
                ) ORDER BY di.item_id
              ) AS items
       FROM ${business}.deliveries d
       JOIN shared.contacts c ON c.contact_id = d.contact_id
       LEFT JOIN ${business}.delivery_items di ON di.delivery_id = d.delivery_id
       WHERE d.delivery_id = $1
       GROUP BY d.delivery_id, c.display_name`,
      [deliveryId],
    );
    if (!rows.length) return;

    const delivery = rows[0];
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

    const noteTemplateData = {
      delivery_number:    esc(delivery.delivery_number || "—"),
      contact_name:       esc(delivery.contact_name || "—"),
      delivery_address:   esc(addressStr),
      courier:            esc(delivery.courier || "—"),
      signed_at:          fmtDate(delivery.signed_at || new Date()),
      items_html:         itemsHtml,
      customer_name:      esc(customer_name || "—"),
      driver_name:        esc(driver_name || "—"),
      customer_signature: customer_signature || "",
      driver_signature:   driver_signature || "",
    };

    await renderToPDF("delivery-note", noteTemplateData);
  } catch (err) {
    logger.error(`[sign] delivery-note PDF failed for ${deliveryId}`, err);
  }
}

module.exports = { getSigningInfo, submitSignatures };
