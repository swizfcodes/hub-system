import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart2 } from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Skeleton } from "@components/ui/Skeleton";
import { Modal } from "@components/ui/Modal";
import {
  listSessions,
  getZReport,
  markReconciled,
} from "@services/pos/sessions";
import { XZReportView } from "@components/pos/POSModals";
import {
  SESSION_STATUS_META,
  VARIANCE_STATUS_META,
} from "@lib/constants/posConstants";
import { fmtMoney, fmtDateTime } from "@lib/format";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { PosSession, ZReport } from "@typedefs/pos";

export default function POSSessions() {
  const { currency } = useActiveBusiness();
  const [selectedSession, setSelectedSession] = useState<PosSession | null>(
    null,
  );
  const [zReport, setZReport] = useState<ZReport | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);

  const {
    data: sessions = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["pos-sessions"],
    queryFn: () => listSessions({ days: 30 }),
  });

  async function viewReport(session: PosSession) {
    setSelectedSession(session);
    setLoadingReport(true);
    setShowReport(true);
    try {
      const report = await getZReport(session.session_id);
      setZReport(report);
    } catch {
      setZReport(null);
    } finally {
      setLoadingReport(false);
    }
  }

  async function handleReconcile(sessionId: string) {
    try {
      await markReconciled(sessionId);
      showToast.success("Session reconciled");
      refetch();
    } catch (err) {
      showToast.error(errMsg(err));
    }
  }

  return (
    <div className="px-4 sm:px-8 py-6 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title="Session History"
        subtitle="Review, reconcile, and sign off closed POS sessions."
        crumbs={[
          { label: "Hub", to: "/" },
          { label: "POS", to: "/pos" },
          { label: "Sessions" },
        ]}
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-white/5 bg-brand-graphite/40">
                {[
                  "Terminal",
                  "Cashier",
                  "Opened",
                  "Revenue",
                  "Variance",
                  "Status",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest text-brand-smoke"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sessions.map((session: any) => {
                const statusMeta =
                  SESSION_STATUS_META[
                    session.status as keyof typeof SESSION_STATUS_META
                  ];
                const StatusIcon = statusMeta?.icon;
                const variance = parseFloat(session.variance ?? 0);
                const varStatus =
                  session.status !== "closed"
                    ? null
                    : Math.abs(variance) < 1
                      ? "balanced"
                      : Math.abs(variance) < 1000
                        ? variance < 0
                          ? "minor_short"
                          : "minor_over"
                        : variance < 0
                          ? "short"
                          : "over";

                return (
                  <tr
                    key={session.session_id}
                    className="bg-brand-charcoal hover:bg-brand-graphite/20 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-brand-cream">
                      {session.terminal_name}
                    </td>
                    <td className="px-4 py-3 text-brand-cloud text-xs">
                      {session.opened_by_email}
                    </td>
                    <td className="px-4 py-3 text-brand-cloud">
                      {fmtDateTime(session.opened_at)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-brand-cream">
                      {fmtMoney(session.total_revenue ?? 0, currency)}
                    </td>
                    <td className="px-4 py-3">
                      {varStatus ? (
                        <span
                          className="text-xs font-medium"
                          style={{
                            color: VARIANCE_STATUS_META[varStatus]?.color,
                          }}
                        >
                          {VARIANCE_STATUS_META[varStatus]?.label}
                          {Math.abs(variance) > 0 &&
                            ` (${fmtMoney(Math.abs(variance), currency)})`}
                        </span>
                      ) : (
                        <span className="text-xs text-brand-smoke">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                        style={{
                          backgroundColor: `${statusMeta?.color}1F`,
                          color: statusMeta?.color,
                        }}
                      >
                        {StatusIcon && <StatusIcon className="h-3 w-3" />}
                        {statusMeta?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {session.status === "closed" && (
                          <button
                            onClick={() => viewReport(session)}
                            className="text-xs text-brand-smoke hover:text-brand-accent transition-colors flex items-center gap-1"
                          >
                            <BarChart2 className="h-3.5 w-3.5" />Z Report
                          </button>
                        )}
                        {session.status === "closed" && (
                          <button
                            onClick={() => handleReconcile(session.session_id)}
                            className="text-xs text-green-400 hover:text-green-300 transition-colors"
                          >
                            Reconcile
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {sessions.length === 0 && (
            <p className="py-12 text-center text-sm text-brand-smoke">
              No sessions in the last 30 days.
            </p>
          )}
        </div>
      )}

      {/* Z Report modal */}
      <Modal
        open={showReport}
        onClose={() => {
          setShowReport(false);
          setZReport(null);
        }}
        title={`Z Report — ${selectedSession?.terminal_name}`}
        size="md"
        surface="light"
      >
        {loadingReport ? (
          <div className="space-y-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : zReport ? (
          <XZReportView report={zReport} currency={currency} />
        ) : (
          <p className="text-sm text-brand-smoke">
            Report not available for this session.
          </p>
        )}
      </Modal>
    </div>
  );
}
