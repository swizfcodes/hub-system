import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { getRecordAudit } from "@services/contacts/audit";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { fmtDateTime, fmtRelative } from "@lib/format";

export function AuditTab({ contactId }: { contactId: string }) {
  const { data, isLoading } = useQuery({
    // The contacts service logs audit rows with table_name "contacts"
    // (unqualified — same convention as every other module), so query that,
    // not "shared.contacts", otherwise the trail is always empty.
    queryKey: ["contacts", contactId, "audit", "contacts"],
    queryFn: () => getRecordAudit("contacts", contactId, 100),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<History className="w-6 h-6" />}
        title="No audit entries"
        description="Create, edit and delete actions on this contact are recorded here. If it stays empty, your role may not yet have audit access."
      />
    );
  }

  return (
    <ol className="relative pl-5 border-l border-brand-graphite space-y-3">
      {data.map((entry) => (
        <li key={entry.log_id} className="relative">
          <span className="absolute -left-[7px] top-3 w-3 h-3 rounded-full bg-brand-accent border-2 border-brand-charcoal" />
          <div className="rounded-xl border border-brand-graphite bg-brand-charcoal/40 p-3.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm text-brand-cream">
                {entry.user_name}
              </span>
              <span className="text-[0.6rem] uppercase tracking-widest font-semibold text-brand-accent">
                {entry.action}
              </span>
            </div>
            <div className="text-[0.65rem] text-brand-smoke mt-1">
              {fmtDateTime(entry.occurred_at)} ·{" "}
              {fmtRelative(entry.occurred_at)}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
