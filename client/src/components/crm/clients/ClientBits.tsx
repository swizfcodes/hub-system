// Small shared pieces for the clients-first CRM workspace:
// segment badges, VIP star, one-tap call/WhatsApp actions and
// the avatar bubble used across the list, Today strip and profile.

import { Star, Phone, MessageCircle } from "lucide-react";
import { Badge } from "@components/ui/Badge";
import { initialsOf } from "@lib/format";
import type { ClientSegment } from "@typedefs/crm";
import { cn } from "@lib/cn";

const SEGMENT_META: Record<
  ClientSegment,
  { label: string; tone: "gold" | "rose" | "sage" | "neutral" | "warn" | "info" }
> = {
  new: { label: "New", tone: "info" },
  active: { label: "Active", tone: "sage" },
  lapsed: { label: "Win back", tone: "warn" },
  big_spender: { label: "Big spender", tone: "gold" },
  prospect: { label: "Prospect", tone: "neutral" },
};

export function SegmentBadge({ segment }: { segment?: ClientSegment }) {
  if (!segment) return null;
  const meta = SEGMENT_META[segment] ?? SEGMENT_META.prospect;
  return (
    <Badge tone={meta.tone} size="xs" dot>
      {meta.label}
    </Badge>
  );
}

export function VipStar({ isVip }: { isVip?: boolean }) {
  if (!isVip) return null;
  return (
    <span title="VIP client">
      <Star className="w-3.5 h-3.5 text-brand-accent fill-brand-accent" />
    </span>
  );
}

export function ClientAvatar({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div
      className={cn(
        "rounded-full bg-brand-accent/15 text-brand-accent flex items-center justify-center font-semibold shrink-0",
        size === "sm" && "w-8 h-8 text-[0.65rem]",
        size === "md" && "w-10 h-10 text-xs",
        size === "lg" && "w-14 h-14 text-base",
      )}
    >
      {initialsOf(name || "?")}
    </div>
  );
}

/** One-tap call / WhatsApp icons. Stops row-click navigation. */
export function QuickReach({
  phone,
  whatsapp,
}: {
  phone?: string | null;
  whatsapp?: string | null;
}) {
  const wa = whatsapp || phone;
  return (
    <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {phone && (
        <a
          href={`tel:${phone}`}
          title={`Call ${phone}`}
          className="p-1.5 rounded-lg text-brand-smoke hover:text-brand-accent hover:bg-brand-accent/10 transition-colors"
        >
          <Phone className="w-3.5 h-3.5" />
        </a>
      )}
      {wa && (
        <a
          href={`https://wa.me/${wa.replace(/[^0-9]/g, "")}`}
          target="_blank"
          rel="noreferrer"
          title="WhatsApp"
          className="p-1.5 rounded-lg text-brand-smoke hover:text-accent2 hover:bg-accent2/10 transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5" />
        </a>
      )}
    </span>
  );
}
