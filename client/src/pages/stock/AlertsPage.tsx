import { useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import {
  BellRing,
  ArrowLeft,
  AlertCircle,
  ArrowUpRight,
  Calendar,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Breadcrumbs } from "@components/ui/Breadcrumbs";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Card } from "@components/ui/Card";
import { Badge } from "@components/ui/Badge";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { listAlerts, markAlertRead } from "@services/stock/alerts";
import { fmtRelative } from "@lib/format";

export default function AlertsPage() {
  const { active: business } = useActiveBusiness();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: alerts, isLoading } = useQuery({
    queryKey: ["stock", "alerts", business],
    queryFn: () => listAlerts(),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => markAlertRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stock", "alerts"] }),
  });

  return (
    <>
      <Topbar
        title="Stock alerts"
        subtitle="Low stock · Expiring · Out of stock"
      />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-4xl mx-auto">
        <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
          <Breadcrumbs
            items={[
              { label: "Hub", to: "/" },
              { label: "Stock", to: "/stock" },
              { label: "Alerts" },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate("/stock")}
          >
            Back
          </Button>
        </div>

        <PageHeader
          title="Stock alerts"
          subtitle="Products that need attention: low stock, expiring batches, anything below reorder level."
        />

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : !alerts || alerts.length === 0 ? (
          <EmptyState
            icon={<BellRing className="w-6 h-6" />}
            title="No alerts"
            description="Everything is stocked above reorder level and no batches are expiring soon."
          />
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => (
              <Card
                key={a.notification_id}
                className={`p-4 ${!a.is_read ? "border-brand-accent/40" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-state-warn/15 text-state-warn flex items-center justify-center">
                    {a.type === "expiring_batch" ||
                    a.type === "expired_batch" ? (
                      <Calendar className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-brand-cream truncate">
                        {a.product_name}
                      </span>
                      <Badge
                        tone={
                          a.type === "out_of_stock" ||
                          a.type === "expired_batch"
                            ? "danger"
                            : "warn"
                        }
                        size="xs"
                      >
                        {a.type.replace("_", " ")}
                      </Badge>
                      {!a.is_read && (
                        <Badge tone="gold" size="xs">
                          New
                        </Badge>
                      )}
                    </div>
                    <div className="text-[0.65rem] text-brand-smoke mt-0.5">
                      {a.product_sku}
                      {a.location_name && ` · ${a.location_name}`} ·{" "}
                      {fmtRelative(a.created_at)}
                    </div>
                    {(a.type === "low_stock" || a.type === "out_of_stock") && (
                      <div className="text-xs text-brand-cloud mt-1">
                        {a.on_hand} on hand · reorder at {a.reorder_level}
                      </div>
                    )}
                  </div>
                  <Link
                    to={`/catalogue/${a.product_id}`}
                    className="inline-flex items-center gap-1 text-xs text-brand-smoke hover:text-brand-accent transition-colors"
                    onClick={() =>
                      !a.is_read && markRead.mutate(a.notification_id)
                    }
                  >
                    View <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
