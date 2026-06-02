import { Badge } from "@components/ui/Badge";
import { CONTACT_TYPE_META, PRIORITY_META } from "@lib/constants/contactTypes";
import type { Contact } from "@typedefs/contacts";

export function ContactTypeBadges({
  contact,
  max = 3,
}: {
  contact: Pick<Contact, "contact_type" | "priority_level">;
  max?: number;
}) {
  const types = contact.contact_type?.slice(0, max) || [];
  const priority = PRIORITY_META[contact.priority_level];
  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      {types.map((t) => {
        const m = CONTACT_TYPE_META[t];
        return (
          <Badge key={t} tone={m.tone} size="xs" dot>
            {m.label}
          </Badge>
        );
      })}
      {contact.priority_level && contact.priority_level !== "regular" && (
        <Badge tone={priority.tone} size="xs">
          {priority.label}
        </Badge>
      )}
    </div>
  );
}
