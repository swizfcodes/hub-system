import { Star, Phone, Mail } from "lucide-react";
import { ContactAvatar } from "../shared/ContactAvatar";
import { QuickActions } from "../shared/QuickActions";
import { ContactTypeBadges } from "../shared/ContactTypeBadges";
import type { Contact } from "@typedefs/contacts";

interface Props {
  contact: Contact;
  onClick: () => void;
  style?: React.CSSProperties;
}

export function ContactCard({ contact, onClick, style }: Props) {
  return (
    <article
      onClick={onClick}
      style={style}
      className="group relative rounded-2xl border border-brand-graphite bg-brand-charcoal/70 hover:border-brand-accent/40 hover:shadow-card-lg hover:-translate-y-1 transition-all overflow-hidden cursor-pointer animate-tile-in"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <ContactAvatar contact={contact} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-display text-lg text-brand-cream truncate">
                {contact.display_name}
              </h3>
              {contact.priority_level === "vip" && (
                <Star className="w-4 h-4 fill-brand-accent text-brand-accent shrink-0" />
              )}
            </div>
            {contact.company_name && (
              <p className="text-xs text-brand-smoke truncate">
                {contact.company_name}
              </p>
            )}
            <div className="mt-2">
              <ContactTypeBadges contact={contact} max={2} />
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-1.5 text-xs">
          <div className="flex items-center gap-2 text-brand-cloud">
            <Phone className="w-3 h-3 text-brand-smoke shrink-0" />
            <span className="truncate">{contact.primary_phone}</span>
          </div>
          {contact.email && (
            <div className="flex items-center gap-2 text-brand-cloud">
              <Mail className="w-3 h-3 text-brand-smoke shrink-0" />
              <span className="truncate">{contact.email}</span>
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-brand-graphite/70 px-5 py-3 bg-brand-black/30 flex items-center justify-between">
        <span className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
          {contact.visible_to?.length === 1
            ? contact.visible_to[0]
            : "Multi-business"}
        </span>
        <QuickActions contact={contact} size="sm" />
      </div>
    </article>
  );
}
