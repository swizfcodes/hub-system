import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Play,
  Trash2,
  Edit2,
  Clock,
  Share2,
  Lock,
  Calendar,
  Mail,
  MessageSquare,
  Plus,
  BarChart2,
} from "lucide-react";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Modal } from "@components/ui/Modal";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { Badge } from "@components/ui/Badge";
import { Skeleton } from "@components/ui/Skeleton";
import {
  listSavedReports,
  deleteSavedReport,
  updateSavedReport,
} from "@services/reports";
import { REPORT_FAMILIES } from "@lib/constants/reportsConstants";
import type { ReportFamilyKey } from "@lib/constants/reportsConstants";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { fmtDate } from "@lib/format";
import { cn } from "@lib/cn";
import type { SavedReport, ScheduleConfig } from "@typedefs/reports";
import { Topbar } from "@components/shell/Topbar";

const DAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

export default function SavedReports() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [editReport, setEditReport] = useState<SavedReport | null>(null);
  const [scheduleFor, setScheduleFor] = useState<SavedReport | null>(null);
  const [schedule, setSchedule] = useState<Partial<ScheduleConfig>>({
    frequency: "weekly",
    day_of_week: 1,
    channels: ["email"],
    recipients: [],
  });
  const [recipientInput, setRecipientInput] = useState("");
  const [editName, setEditName] = useState("");
  const [editShared, setEditShared] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["saved-reports"],
    queryFn: listSavedReports,
  });
  const reports = data?.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSavedReport(id),
    onSuccess: () => {
      showToast.success("Report deleted");
      qc.invalidateQueries({ queryKey: ["saved-reports"] });
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: Parameters<typeof updateSavedReport>[1];
    }) => updateSavedReport(id, values),
    onSuccess: () => {
      showToast.success("Report updated");
      qc.invalidateQueries({ queryKey: ["saved-reports"] });
      setEditReport(null);
      setScheduleFor(null);
    },
    onError: (err) => showToast.error(errMsg(err)),
  });

  function openEdit(r: SavedReport) {
    setEditName(r.report_name);
    setEditShared(r.is_shared);
    setEditReport(r);
  }

  function openSchedule(r: SavedReport) {
    setSchedule(
      r.schedule ?? {
        frequency: "weekly",
        day_of_week: 1,
        channels: ["email"],
        recipients: [],
      },
    );
    setScheduleFor(r);
  }

  function addRecipient() {
    const v = recipientInput.trim();
    if (!v) return;
    setSchedule((s) => ({ ...s, recipients: [...(s.recipients ?? []), v] }));
    setRecipientInput("");
  }

  function removeRecipient(i: number) {
    setSchedule((s) => ({
      ...s,
      recipients: s.recipients?.filter((_, idx) => idx !== i),
    }));
  }

  function toggleChannel(ch: "email" | "whatsapp") {
    setSchedule((s) => {
      const cur = s.channels ?? [];
      return {
        ...s,
        channels: cur.includes(ch) ? cur.filter((c) => c !== ch) : [...cur, ch],
      };
    });
  }

  function runNow(r: SavedReport) {
    const [fam, type] = r.report_type.split(".");
    navigate(`/reports/${fam}/${type}?saved=${r.report_id}`);
  }

  return (
    <>
      <Topbar
        title="Saved Reports"
        subtitle="Scheduled & saved report configs"
      />
      <div className="px-4 sm:px-8 py-6 max-w-4xl mx-auto space-y-6">
        <PageHeader
          title="Saved Reports"
          subtitle="Your saved report configurations. Set schedules for automatic weekly or monthly delivery."
          crumbs={[{ label: "Reports", to: "/reports" }, { label: "Saved" }]}
          actions={
            <Button variant="secondary" onClick={() => navigate("/reports")}>
              <Plus className="h-4 w-4" />
              New Report
            </Button>
          }
        />

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-brand-charcoal py-16 text-center">
            <BarChart2 className="mx-auto h-10 w-10 text-brand-smoke/30 mb-3" />
            <p className="text-sm text-brand-smoke">No saved reports yet</p>
            <p className="text-xs text-brand-smoke/50 mt-1">
              Run a report and click "Save" to save it here.
            </p>
            <Button
              variant="ghost"
              className="mt-4"
              onClick={() => navigate("/reports")}
            >
              Browse reports
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => {
              const [fam, type] = r.report_type.split(".");
              const familyDef = REPORT_FAMILIES[fam as ReportFamilyKey];
              const hasSchedule = r.schedule?.frequency;

              return (
                <div
                  key={r.report_id}
                  className="flex items-center gap-4 rounded-2xl border border-white/5 bg-brand-charcoal px-5 py-4 hover:border-white/10 transition-colors"
                >
                  {/* Family icon */}
                  <span className="text-2xl shrink-0">
                    {familyDef?.icon ?? "📊"}
                  </span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-brand-cream">
                        {r.report_name}
                      </p>
                      {r.is_shared ? (
                        <Badge tone="gold" size="xs">
                          <Share2 className="h-2.5 w-2.5 inline mr-0.5" />
                          Pinned
                        </Badge>
                      ) : (
                        <Badge tone="neutral" size="xs">
                          <Lock className="h-2.5 w-2.5 inline mr-0.5" />
                          Private
                        </Badge>
                      )}
                      {hasSchedule && (
                        <Badge tone="info" size="xs">
                          <Clock className="h-2.5 w-2.5 inline mr-0.5" />
                          {r.schedule!.frequency === "weekly"
                            ? "Weekly"
                            : "Monthly"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-brand-smoke mt-0.5">
                      {familyDef?.label} ·{" "}
                      {familyDef?.types.find((t) => t.key === type)?.label ??
                        type}
                      {r.last_run_at && ` · Last run ${fmtDate(r.last_run_at)}`}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => runNow(r)}
                      title="Run now"
                      className="text-brand-smoke hover:text-brand-accent transition-colors"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => openSchedule(r)}
                      title="Schedule delivery"
                      className="text-brand-smoke hover:text-brand-accent transition-colors"
                    >
                      <Calendar className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => openEdit(r)}
                      title="Edit"
                      className="text-brand-smoke hover:text-brand-accent transition-colors"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${r.report_name}"?`))
                          deleteMutation.mutate(r.report_id);
                      }}
                      title="Delete"
                      className="text-brand-smoke hover:text-state-danger transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Edit modal */}
        <Modal
          open={!!editReport}
          onClose={() => setEditReport(null)}
          title="Edit Saved Report"
          size="sm"
          surface="light"
          footer={
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setEditReport(null)}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  updateMutation.mutate({
                    id: editReport!.report_id,
                    values: { report_name: editName, is_shared: editShared },
                  })
                }
                loading={updateMutation.isPending}
              >
                Save Changes
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <Input
              label="Report Name *"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              surface="light"
            />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={editShared}
                onChange={(e) => setEditShared(e.target.checked)}
                className="rounded"
              />
              <span className="text-text-on-light-muted">
                Pin to home dashboard (shared with all staff)
              </span>
            </label>
          </div>
        </Modal>

        {/* Schedule modal */}
        <Modal
          open={!!scheduleFor}
          onClose={() => setScheduleFor(null)}
          title="Schedule Delivery"
          size="md"
          surface="light"
          footer={
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setScheduleFor(null)}>
                Cancel
              </Button>
              {scheduleFor?.schedule && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() =>
                    updateMutation.mutate({
                      id: scheduleFor.report_id,
                      values: { schedule: null as any },
                    })
                  }
                >
                  Remove schedule
                </Button>
              )}
              <Button
                onClick={() =>
                  updateMutation.mutate({
                    id: scheduleFor!.report_id,
                    values: { schedule: schedule as Record<string, unknown> },
                  })
                }
                loading={updateMutation.isPending}
              >
                <Clock className="h-4 w-4" />
                Save Schedule
              </Button>
            </div>
          }
        >
          <div className="space-y-5">
            <p className="text-sm text-text-on-light-muted">
              Automatically generate and deliver this report on a schedule.
            </p>

            {/* Frequency */}
            <Select
              label="Frequency"
              surface="light"
              value={schedule.frequency ?? "weekly"}
              onChange={(e) =>
                setSchedule((s) => ({
                  ...s,
                  frequency: e.target.value as "weekly" | "monthly",
                }))
              }
              options={[
                { value: "weekly", label: "Weekly" },
                { value: "monthly", label: "Monthly (1st of month)" },
              ]}
            />

            {schedule.frequency === "weekly" && (
              <Select
                label="Day of Week"
                surface="light"
                value={String(schedule.day_of_week ?? 1)}
                onChange={(e) =>
                  setSchedule((s) => ({
                    ...s,
                    day_of_week: parseInt(e.target.value),
                  }))
                }
                options={DAY_OPTIONS}
              />
            )}

            {/* Channels */}
            <div className="space-y-2">
              <p className="text-[0.7rem] font-medium uppercase tracking-widest text-text-on-light-muted">
                Deliver via
              </p>
              <div className="flex gap-3">
                {(["email", "whatsapp"] as const).map((ch) => {
                  const Icon = ch === "email" ? Mail : MessageSquare;
                  const selected = schedule.channels?.includes(ch);
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => toggleChannel(ch)}
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all",
                        selected
                          ? "border-brand-accent/60 bg-brand-accent/10 text-brand-accent"
                          : "border-gray-200 text-gray-500",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {ch === "email" ? "Email" : "WhatsApp"}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recipients */}
            {schedule.channels?.includes("email") && (
              <div className="space-y-2">
                <p className="text-[0.7rem] font-medium uppercase tracking-widest text-text-on-light-muted">
                  Email recipients
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={recipientInput}
                    onChange={(e) => setRecipientInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addRecipient();
                      }
                    }}
                    placeholder="name@example.com"
                    className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-brand-accent/40 focus:outline-none"
                  />
                  <Button
                    size="sm"
                    type="button"
                    onClick={addRecipient}
                    disabled={!recipientInput.trim()}
                  >
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(schedule.recipients ?? []).map((r, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
                    >
                      {r}
                      <button
                        onClick={() => removeRecipient(i)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {schedule.channels?.includes("whatsapp") && (
              <div className="space-y-2">
                <p className="text-[0.7rem] font-medium uppercase tracking-widest text-text-on-light-muted">
                  WhatsApp numbers
                </p>
                <p className="text-xs text-gray-400">
                  Summary message sent to these numbers. Include country code
                  e.g. +2348012345678
                </p>
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={recipientInput}
                    onChange={(e) => setRecipientInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addRecipient();
                      }
                    }}
                    placeholder="+2348012345678"
                    className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-brand-accent/40 focus:outline-none"
                  />
                  <Button size="sm" type="button" onClick={addRecipient}>
                    Add
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      </div>
    </>
  );
}
