import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Copy,
  Check,
  Mail,
  MessageCircle,
  ExternalLink,
  AlertTriangle,
  Link2,
} from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import { getShareUrl } from "@services/catalogue/products";
import { showToast } from "@hooks/useToast";

interface Props {
  open: boolean;
  onClose: () => void;
  productId: string;
}

export function ShareProductModal({ open, onClose, productId }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["catalogue", "product", productId, "share"],
    queryFn: () => getShareUrl(productId),
    enabled: open,
  });

  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState<"link" | "msg" | null>(null);

  useEffect(() => {
    if (data?.message) setMessage(data.message);
  }, [data?.message]);

  async function copy(text: string, which: "link" | "msg") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      showToast.error(
        "Could not copy",
        "Your browser blocked clipboard access.",
      );
    }
  }

  const url = data?.url ?? "";
  const shareText = message || data?.message || "";
  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(data?.name ?? "Product")}&body=${encodeURIComponent(shareText)}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      surface="light"
      size="md"
      title="Share product"
      description="Copy the link or send it via WhatsApp or email with a ready-made message."
    >
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-28" />
        </div>
      ) : isError || !data ? (
        <p className="text-sm text-red-600">
          Could not load the share details. Please try again.
        </p>
      ) : (
        <div className="space-y-4">
          {!data.published && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                This product isn’t published to the website yet, so the link may
                not open a live page. Publish it from{" "}
                <strong>Edit → Storefront listing</strong> first.
              </span>
            </div>
          )}

          <div className="flex gap-3 items-center">
            {data.image_url ? (
              <img
                src={data.image_url}
                alt={data.name}
                className="w-16 h-16 rounded-xl object-cover bg-brand-cloud/30 shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-brand-cloud/30 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium text-brand-charcoal truncate">
                {data.name}
              </div>
              {data.price != null && data.price > 0 && (
                <div className="text-xs text-brand-smoke">
                  {data.currency} {Number(data.price).toLocaleString()}
                </div>
              )}
            </div>
          </div>

          {/* Link row */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
              Link
            </label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 rounded-xl border border-brand-cloud/40 bg-white px-3 py-2.5 text-sm text-brand-charcoal min-w-0">
                <Link2 className="w-3.5 h-3.5 text-brand-smoke shrink-0" />
                <span className="truncate">{url}</span>
              </div>
              <Button
                variant="secondary"
                onClick={() => copy(url, "link")}
                leftIcon={
                  copied === "link" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )
                }
              >
                {copied === "link" ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          {/* Editable message */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-brand-smoke">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="w-full rounded-xl border border-brand-cloud/40 bg-white px-3 py-2.5 text-sm text-brand-charcoal resize-y"
            />
          </div>

          {/* Channels */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] text-white text-sm font-medium py-2.5 hover:opacity-90 transition-opacity"
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </a>
            <a
              href={mailHref}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-charcoal text-brand-cream text-sm font-medium py-2.5 hover:opacity-90 transition-opacity"
            >
              <Mail className="w-4 h-4" /> Email
            </a>
            <button
              onClick={() => copy(shareText, "msg")}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-brand-cloud/50 text-brand-charcoal text-sm font-medium py-2.5 hover:bg-brand-cloud/10 transition-colors"
            >
              {copied === "msg" ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}{" "}
              {copied === "msg" ? "Copied" : "Message"}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-brand-cloud/50 text-brand-charcoal text-sm font-medium py-2.5 hover:bg-brand-cloud/10 transition-colors"
            >
              <ExternalLink className="w-4 h-4" /> Open
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}
