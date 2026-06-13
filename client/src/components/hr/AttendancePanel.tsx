import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, AlertTriangle, Check, X } from "lucide-react";
import { Button } from "@components/ui/Button";
import { Badge } from "@components/ui/Badge";
import { Modal } from "@components/ui/Modal";
import { Textarea } from "@components/ui/Textarea";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { fmtDate } from "@lib/format";
import {
  getMyAttendance,
  listAttendance,
  justifyAttendance,
  reviewJustification,
  type AttendanceRecord,
} from "@services/hr";
import { AttendanceStatusBadge } from "./HrShared";

function timeOf(ts: string | null): string {
  return ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}

export function AttendancePanel({
  mode,
  profileId,
}: {
  mode: "self" | "manage";
  profileId?: string;
}) {
  const qc = useQueryClient();
  const [justifyRec, setJustifyRec] = useState<AttendanceRecord | null>(null);
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey:
      mode === "self" ? ["hr", "me", "attendance"] : ["hr", "attendance", profileId || "all"],
    queryFn: () =>
      mode === "self"
        ? getMyAttendance().then((r) => r.data)
        : listAttendance({ profile_id: profileId }),
  });

  const justifyMut = useMutation({
    mutationFn: () => justifyAttendance(justifyRec!.attendance_id, { note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr"] });
      showToast.success("Explanation submitted for review");
      setJustifyRec(null);
      setNote("");
    },
    onError: (e) => showToast.error(errMsg(e)),
  });

  const reviewMut = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approve" | "reject" }) =>
      reviewJustification(id, decision),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["hr"] });
      showToast.success(`Justification ${v.decision === "approve" ? "approved" : "rejected"}`);
    },
    onError: (e) => showToast.error(errMsg(e)),
  });

  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  const rows = data || [];
  if (!rows.length)
    return (
      <EmptyState
        title="No attendance yet"
        description={
          mode === "self"
            ? "Clock in from the top bar to start tracking your attendance."
            : "No attendance records for this employee yet."
        }
      />
    );

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-white/5">
        <table className="w-full text-sm">
          <thead className="bg-brand-charcoal text-brand-smoke text-xs">
            <tr>
              {mode === "manage" && <th className="px-3 py-2 text-left">Employee</th>}
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">In</th>
              <th className="px-3 py-2 text-left">Out</th>
              <th className="px-3 py-2 text-left">Location</th>
              <th className="px-3 py-2 text-left">Note</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const needsExplain =
                (r.status === "absent" || r.status === "late" || r.is_offsite) &&
                r.justification_status !== "approved";
              return (
                <tr key={r.attendance_id} className="border-t border-white/5">
                  {mode === "manage" && (
                    <td className="px-3 py-2 whitespace-nowrap text-brand-cream">
                      {r.display_name || "—"}
                    </td>
                  )}
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.work_date)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <AttendanceStatusBadge status={r.status} />
                      {r.late_minutes > 0 && (
                        <span className="text-[0.65rem] text-amber-400">+{r.late_minutes}m</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{timeOf(r.clock_in_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{timeOf(r.clock_out_at)}</td>
                  <td className="px-3 py-2">
                    {r.is_offsite ? (
                      <span className="inline-flex items-center gap-1 text-rose-400 text-xs">
                        <AlertTriangle className="w-3 h-3" />
                        {r.distance_from_office_m != null
                          ? `${Math.round(r.distance_from_office_m)}m away`
                          : "Off-site"}
                      </span>
                    ) : r.clock_in_latitude != null ? (
                      <span className="inline-flex items-center gap-1 text-brand-smoke text-xs">
                        <MapPin className="w-3 h-3" />
                        {r.clock_in_location_label || "Located"}
                      </span>
                    ) : (
                      <span className="text-brand-smoke/50 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-[14rem]">
                    {r.justification_note ? (
                      <div className="text-xs">
                        <span className="text-brand-cloud line-clamp-2">{r.justification_note}</span>
                        {r.justification_status && (
                          <Badge
                            tone={
                              r.justification_status === "approved"
                                ? "sage"
                                : r.justification_status === "rejected"
                                  ? "rose"
                                  : "warn"
                            }
                            size="xs"
                          >
                            {r.justification_status}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-brand-smoke/50 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {mode === "self" && needsExplain && r.justification_status !== "pending" && (
                      <Button size="sm" variant="secondary" onClick={() => setJustifyRec(r)}>
                        Explain
                      </Button>
                    )}
                    {mode === "manage" && r.justification_status === "pending" && (
                      <div className="inline-flex gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            reviewMut.mutate({ id: r.attendance_id, decision: "approve" })
                          }
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            reviewMut.mutate({ id: r.attendance_id, decision: "reject" })
                          }
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal
        open={!!justifyRec}
        onClose={() => setJustifyRec(null)}
        title="Explain this day"
        description={justifyRec ? fmtDate(justifyRec.work_date) : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setJustifyRec(null)}>
              Cancel
            </Button>
            <Button onClick={() => justifyMut.mutate()} disabled={!note.trim() || justifyMut.isPending}>
              {justifyMut.isPending ? "Submitting…" : "Submit explanation"}
            </Button>
          </>
        }
      >
        <Textarea
          label="What happened?"
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Hospital appointment — approved by my manager verbally."
        />
      </Modal>
    </>
  );
}
