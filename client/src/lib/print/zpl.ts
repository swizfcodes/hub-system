/**
 * ZPL II label generation for the Honeywell PC42E-T (ZSim2 / ZPL II).
 *
 * The printer renders the barcode internally from the raw value, so we only
 * describe coordinates, symbology and text — no client-side bitmap. Sent to
 * the printer via QZ Tray (see qzTray.ts) as a raw string.
 */

export type BarcodeSymbology = "CODE128" | "EAN13" | "UPC" | "QR" | string;

export interface ZplLabelInput {
  value: string; // barcode payload
  name?: string; // product name (top line)
  sku?: string; // small reference line
  priceLine?: string; // e.g. "₦25,000"
  symbology?: BarcodeSymbology;
  copies?: number; // PQ quantity
  dpi?: 203 | 300; // printer resolution
  widthMm?: number; // label width  (default 50mm ≈ 2")
  heightMm?: number; // label height (default 25mm ≈ 1")
}

const mmToDots = (mm: number, dpi: number) => Math.round((mm / 25.4) * dpi);

function barcodeBlock(
  symbology: BarcodeSymbology,
  value: string,
  barHeight: number,
): string {
  const v = sanitize(value);
  switch ((symbology || "CODE128").toUpperCase()) {
    case "QR":
      return `^BQN,2,6^FDLA,${v}^FS`;
    case "EAN13":
      return `^BEN,${barHeight},Y,N^FD${v}^FS`;
    case "UPC":
      return `^BUN,${barHeight},Y,N,N^FD${v}^FS`;
    case "CODE128":
    default:
      return `^BCN,${barHeight},Y,N,N^FD${v}^FS`;
  }
}

/** Escape characters that would break a ZPL ^FD field. */
function sanitize(s: string): string {
  return String(s ?? "")
    .replace(/[\^~]/g, " ")
    .trim();
}

/** Build a single ZPL label. */
export function buildZpl(input: ZplLabelInput): string {
  const dpi = input.dpi ?? 203;
  const widthDots = mmToDots(input.widthMm ?? 50, dpi);
  const heightDots = mmToDots(input.heightMm ?? 25, dpi);
  const copies = Math.max(1, Math.min(999, input.copies ?? 1));
  const margin = Math.round(widthDots * 0.05);
  const isQR = (input.symbology || "").toUpperCase() === "QR";
  const barHeight = Math.round(heightDots * (input.name ? 0.42 : 0.55));

  const lines: string[] = [
    "^XA",
    "^CI28",
    `^PW${widthDots}`,
    `^LL${heightDots}`,
    "^LH0,0",
  ];

  let y = margin;
  if (input.name) {
    lines.push(
      `^FO${margin},${y}^A0N,${Math.round(heightDots * 0.13)},${Math.round(heightDots * 0.13)}^FB${widthDots - margin * 2},2,0,L^FD${sanitize(input.name)}^FS`,
    );
    y += Math.round(heightDots * 0.28);
  }

  lines.push(`^FO${margin},${y}^BY2`);
  lines.push(
    `^FO${margin},${y}${barcodeBlock(input.symbology ?? "CODE128", input.value, barHeight)}`,
  );
  y += barHeight + (isQR ? 0 : Math.round(heightDots * 0.16));

  const footer = [input.sku, input.priceLine].filter(Boolean).join("   ");
  if (footer) {
    lines.push(
      `^FO${margin},${Math.min(y, heightDots - Math.round(heightDots * 0.14))}^A0N,${Math.round(heightDots * 0.1)},${Math.round(heightDots * 0.1)}^FD${sanitize(footer)}^FS`,
    );
  }

  lines.push(`^PQ${copies}`);
  lines.push("^XZ");
  return lines.join("\n");
}

/** Build a multi-label batch (concatenated ZPL). */
export function buildZplBatch(inputs: ZplLabelInput[]): string {
  return inputs.map(buildZpl).join("\n");
}
