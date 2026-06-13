/**
 * AttachmentView — renders a message attachment inline:
 *   - image messages: thumbnail with click-to-enlarge lightbox
 *   - voice notes: audio player
 *   - anything else: a document chip that downloads on click
 *
 * Attachment binaries live behind GET /documents/:id/download (auth
 * required), so previews are fetched as blobs on demand.
 */
import { useEffect, useRef, useState } from "react";
import { FileText, Download, Play, Pause } from "lucide-react";
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

// ── Voice note: lazy player with WebM-duration fix ────────────────────────
// MediaRecorder webm blobs ship with no duration header, so a bare
// <audio> element reports duration:Infinity and shows 0:00. We force the
// browser to compute the real length (seek to the end, then reset) before
// using it — otherwise the clip looks empty even though the audio is there.

function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function VoiceAttachment({
  attachment,
  isOwn,
}: {
  attachment: MessageAttachment;
  isOwn: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const wantPlayRef = useRef(false);
  const fixingRef = useRef(false);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function handleToggle() {
    if (!url) {
      if (loading) return;
      setLoading(true);
      wantPlayRef.current = true;
      try {
        setUrl(await fetchAttachmentBlobUrl(attachment.document_id));
      } catch {
        setLoading(false);
        wantPlayRef.current = false;
      }
      return;
    }
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  }

  function maybePlay() {
    if (wantPlayRef.current) {
      wantPlayRef.current = false;
      void audioRef.current?.play();
    }
  }

  function handleLoadedMetadata() {
    const a = audioRef.current;
    if (!a) return;
    setLoading(false);
    if (a.duration === Infinity || Number.isNaN(a.duration)) {
      // Kick the browser into resolving the missing duration.
      fixingRef.current = true;
      a.currentTime = 1e101;
    } else {
      setDuration(a.duration);
      maybePlay();
    }
  }

  function handleTimeUpdate() {
    const a = audioRef.current;
    if (!a) return;
    if (fixingRef.current) {
      fixingRef.current = false;
      setDuration(Number.isFinite(a.duration) ? a.duration : 0);
      a.currentTime = 0;
      maybePlay();
      return;
    }
    setElapsed(a.currentTime);
  }

  const pct = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
  const timeLabel =
    playing || elapsed > 0 ? fmtTime(elapsed) : fmtTime(duration);

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full px-2.5 py-1.5",
        isOwn ? "bg-brand-black/15" : "bg-white/10",
      )}
    >
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors",
          isOwn
            ? "bg-brand-black/20 text-brand-black hover:bg-brand-black/30"
            : "bg-white/15 text-brand-cream hover:bg-white/25",
        )}
        aria-label={playing ? "Pause" : "Play voice note"}
      >
        {loading ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : playing ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
      </button>

      <div
        className={cn(
          "h-1 w-28 overflow-hidden rounded-full",
          isOwn ? "bg-brand-black/20" : "bg-white/20",
        )}
      >
        <div
          className={cn(
            "h-full rounded-full",
            isOwn ? "bg-brand-black/60" : "bg-brand-accent",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <span
        className={cn(
          "min-w-[34px] text-right text-[10px] tabular-nums",
          isOwn ? "text-brand-black/70" : "text-brand-smoke",
        )}
      >
        {timeLabel}
      </span>

      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onDurationChange={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setElapsed(0);
          }}
          hidden
        />
      )}
    </div>
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
