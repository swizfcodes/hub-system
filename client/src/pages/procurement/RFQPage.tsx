import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, FileQuestion } from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Card } from "@components/ui/Card";
import { Badge } from "@components/ui/Badge";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { listRFQs } from "@services/purchasing/rfqs";
import { fmtDate, fmtRelative } from "@lib/format";
import type { RFQStatus } from "@typedefs/purchasing";

const STATUS_TONE: Record<
  RFQStatus,
  "gold" | "sage" | "neutral" | "rose" | "danger"
> = {
  draft: "neutral",
  sent: "gold",
  responses_received: "sage",
  closed: "neutral",
  cancelled: "danger",
};

export default function RFQPage() {
  const [statusFilter, setStatusFilter] = useState<RFQStatus | "">("");
  const { data, isLoading } = useQuery({
    queryKey: ["purchasing", "rfqs", { status: statusFilter }],
    queryFn: () => listRFQs({ status: statusFilter || undefined, limit: 100 }),
  });

  const rfqs = data?.data ?? [];

  return (
    <>
      <Topbar title="Requests for Quote" subtitle="RFQ pipeline" />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-6xl mx-auto">
        <PageHeader
          title="Requests for Quote"
          subtitle="Send an RFQ to multiple suppliers. They fill prices independently via a tokenised URL. The system recommends the best value — you make the call."
          crumbs={[
            { label: "Hub", to: "/" },
            { label: "Procurement", to: "/procurement" },
            { label: "RFQs" },
          ]}
          actions={
            <Link to="/procurement/rfqs/new">
              <Button variant="gold" leftIcon={<Plus className="w-4 h-4" />}>
                New RFQ
              </Button>
            </Link>
          }
        />

        {/* Status filter chips */}
        <div className="mb-5 flex flex-wrap gap-2">
          {[
            { key: "", label: "All" },
            { key: "draft", label: "Draft" },
            { key: "sent", label: "Sent" },
            { key: "responses_received", label: "Responses in" },
            { key: "closed", label: "Closed" },
            { key: "cancelled", label: "Cancelled" },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key as RFQStatus | "")}
              className={`px-3 py-1.5 rounded-full text-[0.65rem] font-semibold uppercase tracking-widest transition-all ${
                statusFilter === s.key
                  ? "bg-brand-accent text-brand-black"
                  : "bg-brand-charcoal border border-brand-graphite text-brand-smoke hover:text-brand-cream"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : rfqs.length === 0 ? (
          <EmptyState
            icon={<FileQuestion className="w-7 h-7" />}
            title="No RFQs yet"
            description="Issue your first Request for Quote to start sourcing."
            action={
              <Link to="/procurement/rfqs/new">
                <Button variant="gold" leftIcon={<Plus className="w-4 h-4" />}>
                  New RFQ
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {rfqs.map((r) => (
              <Link key={r.rfq_id} to={`/procurement/rfqs/${r.rfq_id}`}>
                <Card className="p-4 hover:border-brand-accent/40 transition-all">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-brand-smoke">
                          {r.rfq_number}
                        </span>
                        <span className="text-sm font-medium text-brand-cream truncate">
                          {r.title}
                        </span>
                      </div>
                      <div className="text-[0.65rem] text-brand-smoke mt-1">
                        {r.response_deadline && (
                          <>Deadline {fmtDate(r.response_deadline)} · </>
                        )}
                        Updated {fmtRelative(r.updated_at)}
                      </div>
                    </div>
                    <Badge tone={STATUS_TONE[r.status]} size="sm" dot>
                      {r.status.replace("_", " ")}
                    </Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
