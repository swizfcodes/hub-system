// ── WalkinQRModal.tsx ─────────────────────────────────────────────────────────
// Modal shown from the Contacts page header.
// Fetches (and caches) the permanent walk-in QR for this business,
// lets staff download the SVG or copy the link to print / share.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Download, Copy, QrCode } from "lucide-react";
import { getWalkinQR } from "@services/contacts/contacts";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { showToast } from "@hooks/useToast";
import { cn } from "@lib/cn";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function WalkinQRModal({ open, onClose }: Props) {
  const { active: business } = useActiveBusiness();
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["walkin-qr", business],
    queryFn: () => getWalkinQR(business!),
    enabled: open && !!business,
    staleTime: Infinity, // URL never changes — no need to refetch
  });

  if (!open) return null;

  function handleCopy() {
    if (!data?.join_url) return;
    navigator.clipboard.writeText(data.join_url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    if (!data?.qr_code_url) return;
    const a = document.createElement("a");
    a.href = data.qr_code_url;
    a.download = `${business}-walkin-qr.svg`;
    a.click();
    showToast.success("QR code downloaded");
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-brand-charcoal border border-white/10 shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
            <div className="flex items-center gap-2.5">
              <QrCode className="h-4 w-4 text-brand-accent" />
              <div>
                <p className="text-sm font-semibold text-brand-cream">
                  Walk-in Registration QR
                </p>
                <p className="text-xs text-brand-smoke mt-0.5">
                  Permanent — print once, use forever
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-white/8 text-brand-smoke hover:text-brand-cream transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            {isLoading && (
              <div className="h-48 rounded-xl bg-white/5 animate-pulse" />
            )}
            {isError && (
              <p className="text-sm text-red-400 text-center py-8">
                Failed to load QR code. Please try again.
              </p>
            )}
            {data && (
              <>
                {/* QR image */}
                <div className="flex justify-center">
                  <div className="bg-white p-3 rounded-2xl">
                    <img
                      src={data.qr_code_url}
                      alt="Walk-in registration QR"
                      className="h-44 w-44"
                    />
                  </div>
                </div>

                {/* Instruction */}
                <p className="text-xs text-brand-smoke text-center leading-relaxed">
                  Print and place at your counter or entrance. Clients scan
                  this once to register — name, phone, email, and optional
                  location & birthday.
                </p>

                {/* Link display */}
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-brand-graphite px-3 py-2">
                  <p className="text-xs text-brand-cloud flex-1 truncate">
                    {data.join_url}
                  </p>
                  <button
                    onClick={handleCopy}
                    className={cn(
                      "text-xs font-medium shrink-0 transition",
                      copied ? "text-green-400" : "text-brand-accent hover:underline",
                    )}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleDownload}
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-brand-graphite px-4 py-2.5 text-sm text-brand-cloud hover:border-white/20 hover:text-brand-cream transition"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download SVG
                  </button>
                  <button
                    onClick={handleCopy}
                    className="flex items-center justify-center gap-2 rounded-xl bg-brand-accent/10 border border-brand-accent/30 px-4 py-2.5 text-sm text-brand-accent hover:bg-brand-accent/20 transition"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy link
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
