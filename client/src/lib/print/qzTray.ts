/**
 * Optional QZ Tray bridge for silent raw-ZPL printing over USB.
 *
 * QZ Tray (https://qz.io) is a small local agent the user installs once on the
 * workstation wired to the Honeywell PC42E-T. It exposes a secure websocket the
 * browser talks to, then pushes raw ZPL straight to the printer's spooler — no
 * browser print dialog. The library is loaded lazily from CDN so it never
 * affects users who don't print labels, and every call fails soft so the caller
 * can fall back to the browser print dialog.
 *
 * Note on security: unsigned mode shows a one-time "Allow" prompt from QZ Tray.
 * For fully unattended printing, deploy a signed certificate and replace the
 * security promises below (see QZ Tray docs → "Signing messages").
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    qz?: any;
  }
}

const QZ_CDN = "https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js";

let scriptPromise: Promise<any> | null = null;

function loadQz(): Promise<any> {
  if (window.qz) return Promise.resolve(window.qz);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<any>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = QZ_CDN;
    s.async = true;
    s.onload = () =>
      window.qz
        ? resolve(window.qz)
        : reject(new Error("QZ Tray library failed to initialise"));
    s.onerror = () =>
      reject(new Error("Could not load the QZ Tray library (offline?)"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

let securityConfigured = false;
function configureSecurity(qz: any) {
  if (securityConfigured) return;
  securityConfigured = true;
  // Untrusted mode — QZ shows a one-time confirmation. Swap these out for a
  // real cert/signature for silent unattended printing.
  qz.security.setCertificatePromise((resolve: () => void) => resolve());
  qz.security.setSignaturePromise(() => (resolve: () => void) => resolve());
}

async function ensureConnected(retries = 2): Promise<any> {
  const qz = await loadQz();
  configureSecurity(qz);
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect({ retries, delay: 1 });
  }
  return qz;
}

/** True if QZ Tray is installed, running and reachable. Never throws. */
export async function isQzAvailable(): Promise<boolean> {
  try {
    const qz = await loadQz();
    configureSecurity(qz);
    if (qz.websocket.isActive()) return true;
    await qz.websocket.connect({ retries: 1, delay: 1 });
    return qz.websocket.isActive();
  } catch {
    return false;
  }
}

/** Send a raw ZPL string to the named printer (or the OS default). */
export async function printRawZpl(
  zpl: string,
  printerName?: string,
): Promise<void> {
  const qz = await ensureConnected();
  const printer = printerName
    ? await qz.printers.find(printerName)
    : await qz.printers.getDefault();
  if (!printer) {
    throw new Error(
      "No printer found. Connect the printer, set it as default, or enter its exact name in print settings.",
    );
  }
  const config = qz.configs.create(printer);
  await qz.print(config, [{ type: "raw", format: "plain", data: zpl }]);
}

/** List installed printer names (for the settings picker). Returns [] on failure. */
export async function listPrinters(): Promise<string[]> {
  try {
    const qz = await ensureConnected(1);
    const found = await qz.printers.find();
    return Array.isArray(found) ? found : [found].filter(Boolean);
  } catch {
    return [];
  }
}
