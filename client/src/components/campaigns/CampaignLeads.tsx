// ── CampaignLeads.tsx ─────────────────────────────────────────────────────────
// Leads tab content for the Campaign Builder.
// Shows all leads captured via QR scan or inquiry form for a campaign,
// with a live indicator (auto-refreshes every 20 seconds when open).

import { useQuery } from "@tanstack/react-query";
import { Users, Mail, Phone, MapPin, Cake } from "lucide-react";
import { listLeads } from "@services/salesCampaign";
import { fmtDateTime } from "@lib/format";
import { cn } from "@lib/cn";
import type { CampaignLead } from "@typedefs/salesCampaign";

const MONTHS_SHORT = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const LEAD_TYPE_META: Record<
  CampaignLead["lead_type"],
  { label: string; dot: string }
> = {
  qr_scan: { label: "QR Scan",   dot: "bg-green-400" },
  form:    { label: "Inquiry",   dot: "bg-blue-400" },
  whatsapp_tap: { label: "WhatsApp", dot: "bg-emerald-400" },
};

interface Props {
  campaignId: string;
  business: string;
}

export default function CampaignLeads({ campaignId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["campaign-leads", campaignId],
    queryFn: () => listLeads(campaignId, { limit: 100 }),
    refetchInterval: 20_000, // live refresh every 20 s while tab is open
    staleTime: 10_000,
  });

  const leads = data?.data ?? [];
  const total = data?.total ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 rounded-2xl bg-white/5 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!leads.length) {
    return (
      <div className="rounded-2xl border border-white/8 bg-brand-graphite p-10 text-center space-y-3">
        <Users className="h-10 w-10 text-brand-smoke mx-auto opacity-40" />
        <p className="text-sm text-brand-cloud font-medium">No leads yet</p>
        <p className="text-xs text-brand-smoke">
          Leads will appear here as people scan the QR code or submit the
          inquiry form.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-brand-cloud">
          <span className="font-semibold text-brand-cream">{total}</span>{" "}
          {total === 1 ? "lead" : "leads"} captured
        </p>
        <span className="text-[10px] text-brand-smoke flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
          Live
        </span>
      </div>

      {/* Lead cards */}
      <div className="space-y-2">
        {leads.map((lead) => {
          const meta = LEAD_TYPE_META[lead.lead_type as keyof typeof LEAD_TYPE_META] ?? LEAD_TYPE_META.form;
          const displayName =
            [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
            lead.name ||
            lead.phone ||
            "Unknown";

          return (
            <div
              key={lead.lead_id}
              className="rounded-2xl border border-white/8 bg-brand-graphite p-4 space-y-2"
            >
              {/* Row 1: name + type badge + time */}
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-brand-cream leading-snug">
                  {displayName}
                </p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      meta.dot,
                    )}
                  />
                  <span className="text-[10px] text-brand-smoke">
                    {meta.label}
                  </span>
                </div>
              </div>

              {/* Row 2: contact chips */}
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {lead.phone && (
                  <span className="flex items-center gap-1 text-xs text-brand-cloud">
                    <Phone className="h-3 w-3 text-brand-smoke shrink-0" />
                    {lead.phone}
                  </span>
                )}
                {lead.email && (
                  <span className="flex items-center gap-1 text-xs text-brand-cloud">
                    <Mail className="h-3 w-3 text-brand-smoke shrink-0" />
                    {lead.email}
                  </span>
                )}
                {(lead.address_city || lead.address_state) && (
                  <span className="flex items-center gap-1 text-xs text-brand-cloud">
                    <MapPin className="h-3 w-3 text-brand-smoke shrink-0" />
                    {[lead.address_city, lead.address_state]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                )}
                {lead.wants_birthday &&
                  lead.birthday_month &&
                  lead.birthday_day && (
                    <span className="flex items-center gap-1 text-xs text-brand-cloud">
                      <Cake className="h-3 w-3 text-brand-smoke shrink-0" />
                      {MONTHS_SHORT[lead.birthday_month]} {lead.birthday_day}
                    </span>
                  )}
              </div>

              {/* Row 3: timestamp */}
              <p className="text-[10px] text-brand-smoke/60">
                {fmtDateTime(lead.created_at)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
