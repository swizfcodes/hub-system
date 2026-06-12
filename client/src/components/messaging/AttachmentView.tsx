/**
 * AttachmentView — renders a message attachment inline:
 *   - image messages: thumbnail with click-to-enlarge lightbox
 *   - voice notes: audio player
 *   - anything else: a document chip that downloads on click
 *
 * Attachment binaries live behind GET /documents/:id/download (auth
 * required), so previews are fetched as blobs on demand.
 */
import { useEffect, useState } from "react";
import { FileText, Download, Play } from "lucide-react";
import { fetchAttachmentBlobUrl } from "@services/messaging";
import type { MessageAttachment, MessageType } from "@typedefs/messaging";
import { cn } from "@lib/cn";

interface Props {
  attachment: MessageAttachment;
  messageType: MessageType;
  isOwn: boolean;
}

export function AttachmentView({ attachment, messageType, isOwn }: Props) {
  if (messageType === "image") return <ImageAttachment attachment={attachment} />;
  if (messageType === "voice_note")
    return <VoiceAttachment attachment={attachment} isOwn={isOwn} />;
  return <DocumentAttachment attachment={attachment} isOwn={isOwn} />;
}

// ── Image: inline thumbnail + lightbox ────────────────────────────────────

function ImageAttachment({ attachment }: { attachment: MessageAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState(false);

  useEffect(() => {
    let revoked: string | null = null;
    fetchAttachmentBlobUrl(attachment.document_id)
      .then((u) => {
        revoked = u;
        setUrl(u);
      })
      .catch(() => setUrl(null));
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [attachment.document_id]);

  if (!url) {
    return (
      <div className="h-40 w-56 animate-pulse rounded-xl bg-white/10" />
    );
  }

  return (
    <>
      <button type="button" onClick={() => setEnlarged(true)}>
        <img
          src={url}
          alt={attachment.display_name ?? "Image"}
          className="max-h-64 max-w-full rounded-xl object-cover"
        />
      </button>
      {enlarged && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
          onClick={() => setEnlarged(false)}
        >
          <img
            src={url}
            alt={attachment.display_name ?? "Image"}
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        </div>
      )}
    </>
  );
}

// ── Voice note: lazy audio player ─────────────────────────────────────────

function VoiceAttachment({
  attachment,
  isOwn,
}: {
  attachment: MessageAttachment;
  isOwn: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (url || loading) return;
    setLoading(true);
    try {
      setUrl(await fetchAttachmentBlobUrl(attachment.document_id));
    } finally {
      setLoading(false);
    }
  }

  if (url) {
    return <audio src={url} controls autoPlay className="h-10 max-w-[230px]" />;
  }

  return (
    <button
      type="button"
      onClick={load}
      className={cn(
        "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs transition-colors",
        isOwn
          ? "bg-brand-black/15 text-brand-black hover:bg-brand-black/25"
          : "bg-white/10 text-brand-cream hover:bg-white/15",
      )}
    >
      <Play className="h-3.5 w-3.5" />
      {loading ? "Loading…" : "Voice note"}
    </button>
  );
}

// ── Document chip ─────────────────────────────────────────────────────────

function DocumentAttachment({
  attachment,
  isOwn,
}: {
  attachment: MessageAttachment;
  isOwn: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      const url = await fetchAttachmentBlobUrl(attachment.document_id);
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment.display_name ?? "attachment";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      className={cn(
        "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-colors",
        isOwn
          ? "bg-brand-black/15 text-brand-black hover:bg-brand-black/25"
          : "bg-white/10 text-brand-cream hover:bg-white/15",
      )}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">
        {attachment.display_name ?? "Attachment"}
      </span>
      <Download className={cn("h-3.5 w-3.5 shrink-0", busy && "animate-pulse")} />
    </button>
  );
}
