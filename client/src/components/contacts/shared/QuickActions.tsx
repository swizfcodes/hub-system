import { Phone, MessageCircle, Mail, MapPin } from "lucide-react";
import { cn } from "@lib/cn";
import type { Contact, ContactAddress } from "@typedefs/contacts";

interface Props {
  contact: Pick<
    Contact,
    "primary_phone" | "whatsapp_number" | "email" | "addresses"
  >;
  size?: "sm" | "md";
  surface?: "dark" | "light";
  className?: string;
}

const sizeMap = {
  sm: "w-8 h-8 text-[0.7rem]",
  md: "w-10 h-10 text-[0.8rem]",
};

const iconSizeMap = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
};

/** Strips non-digits so tel:/wa.me/ links work. */
function digits(s?: string | null): string {
  return (s || "").replace(/[^0-9]/g, "");
}

function defaultAddressUrl(addresses?: ContactAddress[] | null): string | null {
  if (!addresses || addresses.length === 0) return null;
  const def = addresses.find((a) => a.is_default) ?? addresses[0];
  if (!def) return null;
  if (def.google_maps_url) return def.google_maps_url;
  const q = encodeURIComponent(
    `${def.line1}, ${def.city}, ${def.state}, ${def.country}`,
  );
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function QuickActions({
  contact,
  size = "sm",
  surface = "dark",
  className,
}: Props) {
  const phone = digits(contact.primary_phone);
  const whatsapp = digits(contact.whatsapp_number || contact.primary_phone);
  const email = contact.email;
  const map = defaultAddressUrl(contact.addresses ?? undefined);

  const baseCls = cn(
    "inline-flex items-center justify-center rounded-full transition-all",
    surface === "dark"
      ? "bg-brand-graphite/60 text-brand-cream hover:bg-brand-graphite hover:text-brand-accent"
      : "bg-white/60 text-brand-black hover:bg-white hover:shadow-card",
    sizeMap[size],
  );

  // Stop propagation so clicking an action button inside a list row
  // doesn't also select the row.
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className={cn("inline-flex items-center gap-1.5", className)}
      onClick={stop}
    >
      {phone && (
        <a
          href={`tel:${phone}`}
          aria-label="Call"
          className={baseCls}
          title={contact.primary_phone || ""}
        >
          <Phone className={iconSizeMap[size]} />
        </a>
      )}
      {whatsapp && (
        <a
          href={`https://wa.me/${whatsapp}`}
          target="_blank"
          rel="noopener"
          aria-label="WhatsApp"
          className={baseCls}
          title="WhatsApp"
        >
          <MessageCircle className={iconSizeMap[size]} />
        </a>
      )}
      {email && (
        <a
          href={`mailto:${email}`}
          aria-label="Email"
          className={baseCls}
          title={email}
        >
          <Mail className={iconSizeMap[size]} />
        </a>
      )}
      {map && (
        <a
          href={map}
          target="_blank"
          rel="noopener"
          aria-label="Open in Maps"
          className={baseCls}
          title="Open in Maps"
        >
          <MapPin className={iconSizeMap[size]} />
        </a>
      )}
    </div>
  );
}
