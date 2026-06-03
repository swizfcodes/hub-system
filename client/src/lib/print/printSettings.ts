/** Local (per-workstation) barcode print settings, persisted in localStorage.
 *  Silent thermal printing is OFF by default — users opt in once their
 *  Honeywell + QZ Tray are set up. */

export interface BarcodePrintSettings {
  /** Send raw ZPL to the printer via QZ Tray (silent). When false, use the
   *  browser print dialog. */
  silentPrint: boolean;
  /** Exact printer name as it appears in the OS. Empty = OS default printer. */
  printerName: string;
  dpi: 203 | 300;
  widthMm: number;
  heightMm: number;
}

const KEY = "orika_barcode_print_settings";

const DEFAULTS: BarcodePrintSettings = {
  silentPrint: false,
  printerName: "",
  dpi: 203,
  widthMm: 50,
  heightMm: 25,
};

export function getPrintSettings(): BarcodePrintSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrintSettings(
  patch: Partial<BarcodePrintSettings>,
): BarcodePrintSettings {
  const next = { ...getPrintSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
