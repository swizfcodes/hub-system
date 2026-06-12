/**
 * EmojiPicker — compact emoji grid popover for the composer.
 * Closes on outside click or Escape.
 */
import { useEffect, useRef } from "react";
import { EMOJI_SET } from "@lib/constants/messagingConstants";
import { cn } from "@lib/cn";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
  className?: string;
}

export function EmojiPicker({ open, onClose, onPick, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "absolute z-20 grid grid-cols-8 gap-1 rounded-2xl border border-white/10 bg-brand-charcoal p-2.5 shadow-xl",
        className,
      )}
    >
      {EMOJI_SET.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-transform hover:scale-125 hover:bg-white/5"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
