import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Lock,
  ArrowLeft,
  ArrowUpRight,
  Clock,
  LockOpen,
  ShoppingBag,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Card } from "@components/ui/Card";
import { Badge } from "@components/ui/Badge";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import {
  listReservations,
  releaseReservation,
} from "@services/stock/reservations";
import { fmtDateTime, fmtRelative } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { ReservationStatus } from "@typedefs/stock";

const STATUS_TONE: Record<ReservationStatus, "gold" | "sage" | "neutral"> = {
  active: "gold",
  released: "neutral",
  converted_to_sale: "sage",
};

export default function ReservationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ReservationStatus | "">("active");

  const { data, isLoading } = useQuery({
    queryKey: ["stock", "reservations", { status }],
    queryFn: () =>
      listReservations({ status: status || undefined, limit: 200 }),
  });

  const release = useMutation({
    mutationFn: (id: string) => releaseReservation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock"] });
      showToast.success("Reservation released");
    },
    onError: (e) => showToast.error("Failed", errMsg(e)),
  });

  const list = data?.data ?? [];

  return (
    <>
      <Topbar title="Reservations" subtitle="Stock held for deals" />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-5xl mx-auto">
        <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "Stock", to: "/stock" },
              { label: "Reservations" },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate("/stock")}
          >
            Back to stock
          </Button>
        </div>

        <PageHeader
          title="Stock reservations"
          subtitle="Stock held against open CRM deals. Reservations release automatically at the expiry time. Converting to a sale turns them into stock exits."
        />

        <div className="mb-5 flex flex-wrap gap-2">
          {[
            { key: "active", label: "Active" },
            { key: "released", label: "Released" },
            { key: "converted_to_sale", label: "Converted" },
            { key: "", label: "All" },
          ].map((s) => (
            <button
              key={s.key}
              onClick={() => setStatus(s.key as ReservationStatus | "")}
              className={`px-3 py-1.5 rounded-full text-[0.65rem] font-semibold uppercase tracking-widest transition-all ${status === s.key ? "bg-brand-accent text-brand-black" : "bg-brand-charcoal border border-brand-graphite text-brand-smoke hover:text-brand-cream"}`}
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
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Lock className="w-6 h-6" />}
            title="No reservations"
            description="CRM deals at the 'payment pending' stage automatically reserve stock."
          />
        ) : (
          <div className="space-y-2">
            {list.map((r) => {
              const expiresIn =
                r.status === "active"
                  ? new Date(r.expires_at).getTime() - Date.now()
                  : 0;
              const expiringSoon =
                r.status === "active" &&
                expiresIn > 0 &&
                expiresIn < 7 * 86400000;
              const expired = r.status === "active" && expiresIn <= 0;
              return (
                <Card key={r.reservation_id} className="p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-state-warn/15 text-state-warn flex items-center justify-center shrink-0">
                        <Lock className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-brand-cream truncate">
                            {r.product_name ?? r.product_id}
                          </span>
                          <Badge tone={STATUS_TONE[r.status]} size="xs" dot>
                            {r.status.replace(/_/g, " ")}
                          </Badge>
                          <span className="font-mono text-xs text-brand-accent">
                            ×{r.quantity}
                          </span>
                        </div>
                        <div className="text-[0.65rem] text-brand-smoke mt-1 flex items-center gap-3 flex-wrap">
                          {r.reserved_for_name && (
                            <span>For {r.reserved_for_name}</span>
                          )}
                          {r.crm_deal_id && (
                            <Link
                              to={`/crm/${r.crm_deal_id}`}
                              className="inline-flex items-center gap-0.5 text-brand-accent hover:text-brand-cream"
                            >
                              Open deal <ArrowUpRight className="w-2.5 h-2.5" />
                            </Link>
                          )}
                        </div>
                        {r.notes && (
                          <p className="text-xs text-brand-cloud mt-1 italic">
                            "{r.notes}"
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className={`inline-flex items-center gap-1 text-[0.65rem] ${expired ? "text-state-danger" : expiringSoon ? "text-state-warn" : "text-brand-smoke"}`}
                      >
                        <Clock className="w-3 h-3" />
                        {expired
                          ? `Expired ${fmtRelative(r.expires_at)}`
                          : `Expires ${fmtRelative(r.expires_at)}`}
                      </div>
                      <div className="text-[0.6rem] text-brand-smoke mt-1">
                        {fmtDateTime(r.expires_at)}
                      </div>
                      {r.status === "active" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          leftIcon={<LockOpen className="w-3.5 h-3.5" />}
                          className="mt-2"
                          onClick={() => release.mutate(r.reservation_id)}
                        >
                          Release
                        </Button>
                      )}
                      {r.status === "converted_to_sale" && (
                        <div className="inline-flex items-center gap-1 mt-2 text-[0.6rem] text-accent2">
                          <ShoppingBag className="w-2.5 h-2.5" />
                          Became a sale
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
