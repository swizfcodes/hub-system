/**
 * Barcode label printing orchestrator.
 *
 * Default path: open a print-ready window with rendered labels and call the
 * browser print dialog (works with the Honeywell installed as a normal Windows
 * printer — zero setup). Opt-in path (print settings → silent print): send raw
 * ZPL II to the printer via QZ Tray with no dialog. If QZ Tray isn't reachable,
 * it transparently falls back to the browser dialog.
 */
import { code128SVG } from "@lib/barcode/code128";
import { buildZplBatch } from "./zpl";
import { getPrintSettings } from "./printSettings";
import { isQzAvailable, printRawZpl } from "./qzTray";

export interface LabelItem {
  value: string;
  name?: string;
  sku?: string;
  priceLine?: string;
  symbology?: string;
  copies?: number;
}

export interface PrintOutcome {
  method: "thermal" | "browser";
  note?: string;
}

export async function printBarcodeLabels(
  items: LabelItem[],
): Promise<PrintOutcome> {
  const clean = items.filter((i) => i.value);
  if (!clean.length) throw new Error("Nothing to print.");

  const settings = getPrintSettings();

  if (settings.silentPrint) {
    const available = await isQzAvailable();
    if (available) {
      const zpl = buildZplBatch(
        clean.map((it) => ({
          value: it.value,
          name: it.name,
          sku: it.sku,
          priceLine: it.priceLine,
          symbology: it.symbology,
          copies: it.copies,
          dpi: settings.dpi,
          widthMm: settings.widthMm,
          heightMm: settings.heightMm,
        })),
      );
      await printRawZpl(zpl, settings.printerName || undefined);
      return { method: "thermal" };
    }
    browserPrint(clean);
    return {
      method: "browser",
      note: "QZ Tray not reachable — used the browser dialog instead.",
    };
  }

  browserPrint(clean);
  return { method: "browser" };
}

function browserPrint(items: LabelItem[]) {
  const labels = items.flatMap((it) => {
    const copies = Math.max(1, it.copies ?? 1);
    const isCode128 = !it.symbology || it.symbology.toUpperCase() === "CODE128";
    const svg = isCode128
      ? (code128SVG(it.value, { height: 60, moduleWidth: 2 }) ?? "")
      : "";
    const body = isCode128
      ? svg
      : `<div class="bigval">${escapeHtml(it.value)}</div><div class="note">${escapeHtml(it.symbology || "")} — print to a thermal printer for a scannable code</div>`;
    const one =
      `<div class="label">` +
      `${it.name ? `<div class="name">${escapeHtml(it.name)}</div>` : ""}` +
      body +
      `${it.priceLine || it.sku ? `<div class="meta">${escapeHtml([it.sku, it.priceLine].filter(Boolean).join("  ·  "))}</div>` : ""}` +
      `</div>`;
    return Array.from({ length: copies }, () => one);
  });

  const win = window.open("", "_blank", "width=480,height=680");
  if (!win)
    throw new Error(
      "Pop-up blocked — allow pop-ups for this site to print labels.",
    );
  win.document.write(
    `<!doctype html><html><head><title>Barcode labels</title><style>` +
      `@page { margin: 6mm; }` +
      `body { font-family: system-ui, -apple-system, sans-serif; margin: 0; color: #111; }` +
      `.label { page-break-inside: avoid; text-align: center; padding: 10px 8px; margin: 4px auto; border-bottom: 1px dashed #ddd; }` +
      `.name { font-size: 12px; font-weight: 600; margin-bottom: 4px; }` +
      `.meta { font-size: 11px; margin-top: 3px; color: #333; }` +
      `.bigval { font-family: monospace; font-size: 20px; letter-spacing: 1px; padding: 12px 0; }` +
      `.note { font-size: 9px; color: #888; }` +
      `svg { max-width: 100%; height: auto; }` +
      `</style></head><body>${labels.join("")}` +
      `<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},200);};window.onafterprint=function(){window.close();};</script>` +
      `</body></html>`,
  );
  win.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(
    /[<>&"']/g,
    (c) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );
}
