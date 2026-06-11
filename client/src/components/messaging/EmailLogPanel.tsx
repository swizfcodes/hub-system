/**
 * EmailLogPanel — the "Emails" tab in Messaging. A simple, searchable
 * audit of every outbound email (invoices, payslips, quotations,
 * campaigns) so the team can confirm what reached whom.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Mail, CheckCircle2, XCircle } from "lucide-react";
import { Skeleton } from "@components/ui/Skeleton";
import { listEmailLog } from "@services/messaging";
import { fmtRelativeTime } from "@lib/constants/messagingConstants";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { cn } from "@lib/cn";
import type { EmailLogEntry } from "@typedefs/messaging";

export function EmailLogPanel() {
  const { active: business } = useActiveBusiness();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "sent" | "failed">("");

  const { data: emails = [], isLoading } = useQuery({
    queryKey: ["email-log", business, search, statusFilter],
    queryFn: () =>
      listEmailLog({
        q: search || undefined,
        business: business ?? undefined,
        status: statusFilter || undefined,
        limit: 100,
      }),
    refetchInterval: 60_000,
  });

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-accent/15">
          <Mail className="h-4 w-4 text-brand-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-brand-cream">Emails sent</p>
          <p className="text-xs text-brand-smoke">
            Invoices, payslips, quotations & campaigns
          </p>
        </div>
        <div className="flex gap-1">
          {(["", "sent", "failed"] as const).map((s) => (
            <button
              key={s || "all"}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-[0.65rem] font-medium transition-all",
                statusFilter === s
                  ? "bg-brand-accent text-brand-black"
                  : "text-brand-smoke hover:bg-brand-charcoal hover:text-brand-cream",
              )}
            >
              {s === "" ? "All" : s === "sent" ? "Sent" : "Failed"}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-smoke/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by recipient or subject…"
            className="w-full rounded-xl border border-white/5 bg-brand-charcoal py-2 pl-8 pr-3 text-xs text-brand-cream placeholder-brand-smoke/40 focus:border-brand-accent/30 focus:outline-none"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isLoading ? (
          <div className="space-y-px">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : emails.length === 0 ? (
          <div className="py-16 text-center">
            <Mail className="mx-auto h-8 w-8 text-brand-smoke/30" />
            <p className="mt-3 text-xs text-brand-smoke">
              {search ? "No emails match your search" : "No emails sent yet"}
            </p>
          </div>
        ) : (
          <div className="space-y-px">
            {emails.map((email) => (
              <EmailRow key={email.email_id} email={email} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmailRow({ email }: { email: EmailLogEntry }) {
  const failed = email.status === "failed";
  return (
    <div className="flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-brand-charcoal/50">
      {failed ? (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400/80" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-xs font-medium text-brand-cream">
            {email.recipient}
          </p>
          <span className="shrink-0 text-[10px] text-brand-smoke/60">
            {fmtRelativeTime(email.created_at)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-brand-smoke/80">
          {email.subject ?? "(no subject)"}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          {email.business && (
            <span className="rounded-full bg-white/5 px-1.5 py-px text-[9px] uppercase tracking-wide text-brand-smoke/60">
              {email.business}
            </span>
          )}
          {email.sender_name && (
            <span className="text-[10px] text-brand-smoke/50">
              by {email.sender_name}
            </span>
          )}
          {failed && email.error && (
            <span className="truncate text-[10px] text-red-400/80">
              {email.error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
