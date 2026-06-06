/**
 * openPdf — fetch a PDF through axios (so the Bearer token is included)
 * then open it in a new tab via a temporary blob URL.
 *
 * window.open(rawApiUrl) is a direct browser request with no Authorization
 * header — it always returns 401. This helper avoids that.
 */
import { api } from "@services/api";

export async function openPdf(
  apiPath: string,
  filename = "document.pdf",
): Promise<void> {
  const response = await api.get(apiPath, { responseType: "blob" });
  const blob = new Blob([response.data], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  // Release the object URL after the tab has loaded it
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  if (!win) {
    // Popup blocked — fall back to a direct download
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }
}
