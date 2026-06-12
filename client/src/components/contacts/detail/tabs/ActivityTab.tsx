import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  MessageSquare,
  Phone,
  Calendar,
  CheckSquare,
  Receipt,
  TrendingUp,
  History,
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";
import { getTimeline } from "@services/contacts/contacts";
import { listTasks } from "@services/contacts/tasks";
import { listEventsForReference } from "@services/contacts/calendar";
import { getRecordAudit } from "@services/contacts/audit";
import { Skeleton } from "@components/ui/Skeleton";
import { Badge } from "@components/ui/Badge";
import { Tabs } from "@components/ui/Tabs";
import { fmtDateTime, fmtRelative, fmtMoney } from "@lib/format";
import { cn } from "@lib/cn";

interface Props {
  contactId: string;
}

type ActivityKind =
  | "call"
  | "sms"
  | "email"
  | "meeting"
  | "task"
  | "deal"
  | "invoice"
  | "system";

interface TimelineEntry {
  id: string;
  kind: ActivityKind;
  title: string;
  detail?: string | null;
  at: string; // ISO
  amount?: number | null;
  direction?: "in" | "out" | null;
}

const KIND_META: Record<
  ActivityKind,
  {
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    label: string;
  }
> = {
  call: { icon: Phone, color: "text-brand-accent", label: "Call" },
  sms: { icon: MessageSquare, color: "text-state-info", label: "Message" },
  email: { icon: MessageSquare, color: "text-state-info", label: "Email" },
  meeting: { icon: Calendar, color: "text-brand-accent", label: "Meeting" },
  task: { icon: CheckSquare, color: "text-accent3", label: "Task" },
  deal: { icon: TrendingUp, color: "text-accent2", label: "Deal" },
  invoice: { icon: Receipt, color: "text-brand-accent", label: "Invoice" },
  system: { icon: History, color: "text-brand-smoke", label: "System" },
};

const FILTERS: Array<{ key: "all" | ActivityKind; label: string }> = [
  { key: "all", label: "All" },
  { key: "call", label: "Calls" },
  { key: "email", label: "Emails" },
  { key: "meeting", label: "Meetings" },
  { key: "task", label: "Tasks" },
  { key: "deal", label: "Deals" },
  { key: "invoice", label: "Invoices" },
  { key: "system", label: "System" },
];

export function ActivityTab({ contactId }: Props) {
  const [filter, setFilter] = useState<"all" | ActivityKind>("all");

  const { data: timeline, isLoading: tlLoading } = useQuery({
    queryKey: ["contacts", contactId, "timeline"],
    queryFn: () => getTimeline(contactId),
  });
  const { data: tasks } = useQuery({
    queryKey: ["contacts", contactId, "tasks"],
    queryFn: () =>
      listTasks({
        reference_type: "contact",
        reference_id: contactId,
        limit: 100,
      }),
  });
  const { data: events } = useQuery({
    queryKey: ["contacts", contactId, "events"],
    queryFn: () => listEventsForReference("contact", contactId),
  });
  const { data: audit } = useQuery({
    queryKey: ["contacts", contactId, "audit", "shared.contacts"],
    queryFn: () => getRecordAudit("shared.contacts", contactId, 50),
  });

  const merged: TimelineEntry[] = useMemo(() => {
    const out: TimelineEntry[] = [];

    for (const a of timeline?.activities ?? []) {
      const kind: ActivityKind = ["call", "sms", "email", "meeting"].includes(
        a.activity_type,
      )
        ? (a.activity_type as ActivityKind)
        : "system";
      out.push({
        id: `a-${a.activity_id}`,
        kind,
        title: a.summary,
        at: a.performed_at,
        direction: a.direction ?? null,
      });
    }
    for (const inv of timeline?.invoices ?? []) {
      out.push({
        id: `inv-${inv.invoice_id}`,
        kind: "invoice",
        title: `Invoice ${inv.invoice_number} · ${inv.status}`,
        at: inv.issue_date,
        amount: inv.total_amount,
        detail: `Paid ${fmtMoney(inv.amount_paid, "NGN")} of ${fmtMoney(inv.total_amount, "NGN")}`,
      });
    }
    for (const d of timeline?.deals ?? []) {
      out.push({
        id: `deal-${d.deal_id}`,
        kind: "deal",
        title: `Deal: ${d.title}`,
        at: d.created_at,
        amount: d.expected_value,
        detail: `Stage: ${d.stage}`,
      });
    }
    for (const t of tasks?.data ?? []) {
      out.push({
        id: `task-${t.task_id}`,
        kind: "task",
        title: t.title,
        at: t.completed_at || t.updated_at || t.created_at,
        detail: `Status: ${t.status} · Priority: ${t.priority}`,
      });
    }
    for (const e of events ?? []) {
      out.push({
        id: `evt-${e.event_id}`,
        kind: "meeting",
        title: e.title,
        at: e.start_at,
        detail: e.location ? `at ${e.location}` : null,
      });
    }
    for (const log of audit ?? []) {
      out.push({
        id: `audit-${log.log_id}`,
        kind: "system",
        title: `${log.user_name} · ${log.action}`,
        at: log.occurred_at,
      });
    }

    return out
      .filter((entry) => filter === "all" || entry.kind === filter)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [timeline, tasks, events, audit, filter]);

  return (
    <div className="space-y-5">
      <Tabs
        variant="pill"
        tabs={FILTERS.map((f) => ({ key: f.key, label: f.label }))}
        active={filter}
        onChange={(k) => setFilter(k as typeof filter)}
      />

      {tlLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : merged.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-graphite bg-brand-charcoal/40 p-10 text-center">
          <History className="w-7 h-7 mx-auto text-brand-smoke mb-3" />
          <p className="text-sm text-brand-smoke">
            No activity to show with this filter.
          </p>
        </div>
      ) : (
        <ol className="relative pl-5 sm:pl-7 border-l border-brand-graphite space-y-4">
          {merged.map((e) => {
            const meta = KIND_META[e.kind];
            const Icon = meta.icon;
            return (
              <li key={e.id} className="relative">
                <span
                  className={cn(
                    "absolute -left-[28px] sm:-left-[34px] top-3 w-6 h-6 rounded-full bg-brand-charcoal border border-brand-graphite flex items-center justify-center",
                    meta.color,
                  )}
                >
                  <Icon className="w-3 h-3" />
                </span>
                <div className="rounded-xl border border-brand-graphite bg-brand-charcoal/50 p-3.5">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      {e.direction === "in" && (
                        <ArrowDownRight className="w-3 h-3 text-accent2 shrink-0" />
                      )}
                      {e.direction === "out" && (
                        <ArrowUpRight className="w-3 h-3 text-brand-accent shrink-0" />
                      )}
                      <span className="text-sm text-brand-cream truncate">
                        {e.title}
                      </span>
                    </div>
                    <Badge tone="neutral" size="xs">
                      {meta.label}
                    </Badge>
                  </div>
                  {e.detail && (
                    <div className="text-xs text-brand-cloud mt-1">
                      {e.detail}
                    </div>
                  )}
                  {e.amount && (e.kind === "invoice" || e.kind === "deal") && (
                    <div className="text-xs font-mono text-brand-accent mt-1">
                      {fmtMoney(e.amount, "NGN")}
                    </div>
                  )}
                  <div className="text-[0.65rem] text-brand-smoke mt-1.5">
                    {fmtDateTime(e.at)} · {fmtRelative(e.at)}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
