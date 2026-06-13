import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Users,
  UserPlus,
  CalendarCheck,
  Plane,
  MessageSquareWarning,
  RefreshCw,
  Check,
  X,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Card } from "@components/ui/Card";
import { Button } from "@components/ui/Button";
import { Badge } from "@components/ui/Badge";
import { Tabs } from "@components/ui/Tabs";
import { Modal } from "@components/ui/Modal";
import { Select } from "@components/ui/Select";
import { Input } from "@components/ui/Input";
import { Textarea } from "@components/ui/Textarea";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { fmtDate } from "@lib/format";
import {
  getOverview,
  listLeave,
  approveLeave,
  rejectLeave,
  raiseQuery,
  type LeaveRequest,
} from "@services/hr";
import { listStaff } from "@services/contacts/staff";
import { AttendancePanel } from "@components/hr/AttendancePanel";
import { QueriesPanel } from "@components/hr/QueriesPanel";

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <Card className="p-4">
      <div className={`font-display text-3xl ${tone || "text-brand-cream"}`}>{value}</div>
      <div className="mt-0.5 text-xs text-brand-smoke">{label}</div>
    </Card>
  );
}

function LeaveInbox() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["leave", "pending"],
    queryFn: () => listLeave({ status: "pending" }),
  });
  const approve = useMutation({
    mutationFn: (id: string) => approveLeave(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave"] });
      qc.invalidateQueries({ queryKey: ["hr"] });
      showToast.success("Leave approved");
    },
    onError: (e) => showToast.error(errMsg(e)),
  });
  const reject = useMutation({
    mutationFn: (id: string) => rejectLeave(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leave"] });
      qc.invalidateQueries({ queryKey: ["hr"] });
      showToast.success("Leave rejected");
    },
    onError: (e) => showToast.error(errMsg(e)),
  });

  if (isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  const rows: LeaveRequest[] = data || [];
  if (!rows.length)
    return <EmptyState icon={<Plane className="h-6 w-6" />} title="No pending leave requests" />;

  return (
    <div className="space-y-2">
      {rows.map((l) => (
        <Card key={l.leave_id} className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm text-brand-cream">{l.staff_name || "Staff"}</span>
              <Badge tone={l.leave_type === "unpaid" ? "rose" : "neutral"} size="xs">
                {l.leave_type}
              </Badge>
            </div>
            <div className="text-xs text-brand-smoke">
              {fmtDate(l.start_date)} – {fmtDate(l.end_date)} · {l.days_requested} day
              {l.days_requested > 1 ? "s" : ""}
              {l.reason ? ` · ${l.reason}` : ""}
            </div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button size="sm" onClick={() => approve.mutate(l.leave_id)} leftIcon={<Check className="h-3.5 w-3.5" />}>
              Approve
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => reject.mutate(l.leave_id)}
              leftIcon={<X className="h-3.5 w-3.5" />}
            >
              Reject
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function RaiseQueryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: staff } = useQuery({
    queryKey: ["staff", "for-query"],
    queryFn: () => listStaff({ limit: 200 }),
    enabled: open,
  });
  const [profileId, setProfileId] = useState("");
  const [type, setType] = useState("other");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [severity, setSeverity] = useState("normal");

  const mut = useMutation({
    mutationFn: () =>
      raiseQuery({
        profile_id: profileId,
        query_type: type,
        severity,
        subject,
        details,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr"] });
      showToast.success("Query sent to employee");
      onClose();
      setSubject("");
      setDetails("");
      setProfileId("");
    },
    onError: (e) => showToast.error(errMsg(e)),
  });

  const staffOptions = [
    { value: "", label: "— select employee —" },
    ...((staff?.data as Array<{ profile_id: string; display_name: string }> | undefined) || []).map(
      (s) => ({ value: s.profile_id, label: s.display_name }),
    ),
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Query an employee"
      description="Ask a staff member to formally explain a lateness, absence, off-site clock-in or conduct issue."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={!profileId || !subject.trim() || !details.trim() || mut.isPending}
          >
            {mut.isPending ? "Sending…" : "Send query"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Select label="Employee" options={staffOptions} value={profileId} onChange={(e) => setProfileId(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Type"
            options={[
              { value: "lateness", label: "Lateness" },
              { value: "absence", label: "Absence" },
              { value: "offsite_clockin", label: "Off-site clock-in" },
              { value: "conduct", label: "Conduct" },
              { value: "performance", label: "Performance" },
              { value: "other", label: "Other" },
            ]}
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
          <Select
            label="Severity"
            options={[
              { value: "low", label: "Low" },
              { value: "normal", label: "Normal" },
              { value: "high", label: "High" },
            ]}
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          />
        </div>
        <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea
          label="Details"
          rows={4}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Describe what needs explaining…"
        />
      </div>
    </Modal>
  );
}

export default function HrHub() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");
  const [raiseOpen, setRaiseOpen] = useState(false);

  const { data: overview, isLoading } = useQuery({
    queryKey: ["hr", "overview"],
    queryFn: () => getOverview(),
  });

  const reconcile = useMutation({
    mutationFn: () => import("@services/hr").then((m) => m.reconcileDay(new Date().toISOString().slice(0, 10))),
    onSuccess: (r: { records_created: number }) => {
      qc.invalidateQueries({ queryKey: ["hr"] });
      showToast.success(`Reconciled today — ${r.records_created} record(s) created`);
    },
    onError: (e) => showToast.error(errMsg(e)),
  });

  const c = overview?.counts;

  return (
    <>
      <Topbar title="HR & Staff" subtitle="People · Attendance · Leave · Performance" />
      <div className="px-4 sm:px-8 py-6 max-w-6xl mx-auto space-y-6">
        <PageHeader
          title="HR & Staff"
          subtitle="Manage your people — directory, attendance, leave, queries and performance."
          crumbs={[{ label: "HR & Staff" }]}
          actions={
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => navigate("/contacts?tab=staff")}
                leftIcon={<Users className="h-4 w-4" />}
              >
                Directory
              </Button>
              <Button
                onClick={() => navigate("/contacts/staff/new")}
                leftIcon={<UserPlus className="h-4 w-4" />}
              >
                Add employee
              </Button>
            </div>
          }
        />

        <Tabs
          tabs={[
            { key: "overview", label: "Overview" },
            { key: "leave", label: "Leave", badge: c?.pending_leave || undefined },
            { key: "attendance", label: "Attendance", badge: c?.pending_justifications || undefined },
            { key: "queries", label: "Queries", badge: c?.open_queries || undefined },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === "overview" &&
          (isLoading || !c ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <StatCard label="Total staff" value={c.total_staff} />
                <StatCard label="Present today" value={c.present_today} tone="text-emerald-400" />
                <StatCard label="Late today" value={c.late_today} tone="text-amber-400" />
                <StatCard label="On leave" value={c.on_leave_today} tone="text-purple-300" />
                <StatCard label="Pending leave" value={c.pending_leave} tone="text-brand-accent" />
                <StatCard label="Open queries" value={c.open_queries} tone="text-rose-400" />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={() => setRaiseOpen(true)}
                  leftIcon={<MessageSquareWarning className="h-4 w-4" />}
                >
                  Query an employee
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => reconcile.mutate()}
                  disabled={reconcile.isPending}
                  leftIcon={<RefreshCw className="h-4 w-4" />}
                >
                  Reconcile today's attendance
                </Button>
              </div>

              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-cream">
                  <Plane className="h-4 w-4 text-accent3" /> Pending leave
                </h3>
                <LeaveInbox />
              </div>

              {overview.pending_justifications.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-cream">
                    <CalendarCheck className="h-4 w-4 text-amber-400" /> Justifications awaiting review
                  </h3>
                  <AttendancePanel mode="manage" />
                </div>
              )}
            </div>
          ))}

        {tab === "leave" && <LeaveInbox />}
        {tab === "attendance" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => reconcile.mutate()}
                disabled={reconcile.isPending}
                leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
              >
                Reconcile today
              </Button>
            </div>
            <AttendancePanel mode="manage" />
          </div>
        )}
        {tab === "queries" && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setRaiseOpen(true)} leftIcon={<MessageSquareWarning className="h-3.5 w-3.5" />}>
                Query an employee
              </Button>
            </div>
            <QueriesPanel mode="manage" />
          </div>
        )}
      </div>

      <RaiseQueryModal open={raiseOpen} onClose={() => setRaiseOpen(false)} />
    </>
  );
}
