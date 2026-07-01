import { ExternalLink } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { packingSlipUrl } from "@services/logistics";

/**
 * PackingSlipModal — renders the packing-slip PDF inside an in-app modal.
 *
 * Why this exists: the previous implementation opened the slip with
 * `<a target="_blank">`. In a browser that spawns a new tab, but when the app
 * runs as an installed PWA (standalone display mode) there is no tab bar and no
 * browser back button — the webview simply navigates to the PDF and the user is
 * stranded with no way back to the app. Showing the PDF in a modal keeps the
 * user inside the PWA: the modal's Close button, the Escape key, and the
 * backdrop all return them to where they were. The "Open in new tab" link is
 * kept for desktop users who prefer a full tab.
 *
 * The packing-slip URL already carries auth (token + business) as query params,
 * so the <iframe> can load it directly with no extra headers.
 */
export function PackingSlipModal({
  open,
  onClose,
  deliveryId,
}: {
  open: boolean;
  onClose: () => void;
  deliveryId: string | null;
}) {
  const url = deliveryId ? packingSlipUrl(deliveryId) : "";

  return (
    <Modal
      open={open && !!deliveryId}
      onClose={onClose}
      title="Packing slip"
      size="lg"
      surface="light"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="sm">
              <ExternalLink className="h-4 w-4" />
              Open in new tab
            </Button>
          </a>
          <Button variant="primary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="h-[70vh] w-full overflow-hidden rounded-lg border border-brand-cloud/30 bg-white">
        {url && (
          <iframe
            src={url}
            title="Packing slip"
            className="h-full w-full"
          />
        )}
      </div>
    </Modal>
  );
}
