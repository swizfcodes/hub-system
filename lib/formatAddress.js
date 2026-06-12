"use strict";

// Flatten a structured address ({line1, area, city, state, landmark})
// into the single-line text the ERP stores on sales_orders /
// deliveries. Tolerates plain strings (returned unchanged) and
// null/empty objects (returns null).
function flattenAddress(addr) {
  if (!addr) return null;
  if (typeof addr === "string") return addr.trim() || null;
  const parts = [addr.line1, addr.area, addr.city, addr.state]
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean);
  let out = parts.join(", ");
  const landmark = addr.landmark && String(addr.landmark).trim();
  if (landmark) out = out ? `${out} (${landmark})` : landmark;
  return out || null;
}

module.exports = { flattenAddress };
