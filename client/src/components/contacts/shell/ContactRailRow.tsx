import { Star } from "lucide-react";
import { ContactAvatar } from "../shared/ContactAvatar";
import { QuickActions } from "../shared/QuickActions";
import { CONTACT_TYPE_META } from "@lib/constants/contactTypes";
import type { Contact } from "@typedefs/contacts";
import { cn } from "@lib/cn";

interface Props {
  contact: Contact;
  active?: boolean;
  onClick: () => void;
  showActions?: boolean;
}

export function ContactRailRow({
  contact,
  active,
  onClick,
  showActions,
}: Props) {
  const primary = contact.contact_type?.[0] || "customer";
  const meta = CONTACT_TYPE_META[primary];

  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full text-left flex items-center gap-3 p-3 rounded-xl transition-all border",
        active
          ? "bg-brand-charcoal border-brand-accent/40 shadow-card"
          : "bg-transparent border-transparent hover:bg-brand-charcoal/50 hover:border-brand-graphite",
      )}
    >
      <ContactAvatar contact={contact} size="md" emphasiseType={primary} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-sm text-brand-cream truncate">
            {contact.display_name}
          </span>
          {contact.priority_level === "vip" && (
            <Star className="w-3.5 h-3.5 fill-brand-accent text-brand-accent shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs">
          <span className={cn("truncate", meta.textClass)}>{meta.label}</span>
          {contact.company_name && (
            <>
              <span className="text-brand-smoke">·</span>
              <span className="text-brand-smoke truncate">
                {contact.company_name}
              </span>
            </>
          )}
        </div>
      </div>
      {showActions && (
        <div className="hidden sm:flex opacity-0 group-hover:opacity-100 transition-opacity">
          <QuickActions contact={contact} size="sm" />
        </div>
      )}
    </button>
  );
}
