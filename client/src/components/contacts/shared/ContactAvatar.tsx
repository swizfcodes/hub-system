import { CONTACT_TYPE_META } from "@lib/constants/contactTypes";
import type { Contact, ContactType } from "@typedefs/contacts";
import { initialsOf } from "@lib/format";
import { cn } from "@lib/cn";

interface Props {
  contact: Pick<Contact, "display_name" | "contact_type">;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  // When a contact has multiple types we pick the first (or override).
  emphasiseType?: ContactType;
  className?: string;
}

const SIZES: Record<
  NonNullable<Props["size"]>,
  { box: string; text: string; ring: string }
> = {
  xs: { box: "w-7 h-7", text: "text-[0.6rem]", ring: "ring-1" },
  sm: { box: "w-9 h-9", text: "text-[0.65rem]", ring: "ring-2" },
  md: { box: "w-12 h-12", text: "text-sm", ring: "ring-2" },
  lg: { box: "w-16 h-16", text: "text-base", ring: "ring-2" },
  xl: { box: "w-24 h-24", text: "text-2xl", ring: "ring-[3px]" },
};

export function ContactAvatar({
  contact,
  size = "sm",
  emphasiseType,
  className,
}: Props) {
  const primaryType = emphasiseType ?? contact.contact_type?.[0] ?? "customer";
  const meta = CONTACT_TYPE_META[primaryType];
  const dims = SIZES[size];
  const initials = initialsOf(contact.display_name || "");

  return (
    <div
      className={cn(
        "relative shrink-0 rounded-full flex items-center justify-center font-semibold tracking-wide",
        "bg-brand-graphite text-brand-cream",
        dims.box,
        dims.text,
        className,
      )}
      style={{
        boxShadow: `inset 0 0 0 2px ${meta.ringColor}, 0 0 0 2px transparent`,
      }}
    >
      <span>{initials || "?"}</span>
      {/* Multi-type indicator dot (when contact has more than one type) */}
      {contact.contact_type && contact.contact_type.length > 1 && (
        <span
          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-brand-charcoal"
          style={{
            background: CONTACT_TYPE_META[contact.contact_type[1]].ringColor,
          }}
          title={`Also: ${contact.contact_type
            .slice(1)
            .map((t) => CONTACT_TYPE_META[t].label)
            .join(", ")}`}
        />
      )}
    </div>
  );
}
