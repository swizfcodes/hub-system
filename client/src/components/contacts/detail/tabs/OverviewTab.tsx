import { useQuery } from "@tanstack/react-query";
import {
  MessageSquare,
  Calendar,
  CheckSquare,
  Receipt,
  TrendingUp,
  MapPin,
  ArrowRight,
  FileText,
  Briefcase,
  ShoppingCart,
  Handshake,
} from "lucide-react";
import { Card } from "@components/ui/Card";
import { Skeleton } from "@components/ui/Skeleton";
import { Badge } from "@components/ui/Badge";
import { getTimeline } from "@services/contacts/contacts";
import { listTasks } from "@services/contacts/tasks";
import { listEventsForReference } from "@services/contacts/calendar";
import { listSuppliers } from "@services/purchasing/suppliers";
import { listPOs } from "@services/purchasing/purchaseOrders";
import { listBills } from "@services/purchasing/bills";
import { listPartners } from "@services/retail-partners/retailPartnersService";
import { useStaffByContact } from "@components/contacts/employment/useStaffByContact";
import { fmtMoney, fmtDateTime, fmtRelative, fmtDate } from "@lib/format";
import { useBusinessStore } from "@stores/useBusinessStore";
import type { Contact } from "@typedefs/contacts";
import { cn } from "@lib/cn";

interface Props {
  contact: Contact;
  onJumpTab: (tab: string) => void;
}

export function OverviewTab({ contact, onJumpTab }: Props) {
  const active = useBusinessStore((s) => s.active);
  const types = contact.contact_type ?? [];
  const isCustomer = types.includes("customer");
  const isSupplier = types.includes("supplier");
  const isPartner = types.includes("retail_partner");
  const isEmployee = types.includes("staff");

  const { data: timeline, isLoading: tlLoading } = useQuery({
    queryKey: ["contacts", contact.contact_id, "timeline"],
    queryFn: () => getTimeline(contact.contact_id),
  });

  const { data: tasks } = useQuery({
    queryKey: ["contacts", contact.contact_id, "tasks"],
    queryFn: () =>
      listTasks({
        reference_type: "contact",
        reference_id: contact.contact_id,
        limit: 5,
      }),
  });

  const { data: events } = useQuery({
    queryKey: ["contacts", contact.contact_id, "events"],
    queryFn: () => listEventsForReference("contact", contact.contact_id),
  });

  const openTasks = (tasks?.data ?? []).filter(
    (t) => t.status !== "done" && t.status !== "cancelled",
  );
  const upcomingEvents = (events ?? [])
    .filter((e) => new Date(e.end_at) >= new Date())
    .slice(0, 3);
  const lifetimeValue = (timeline?.invoices ?? []).reduce(
    (sum, inv) => sum + Number(inv.total_amount || 0),
    0,
  );
  const openDeals = (timeline?.deals ?? []).filter(
    (d) => !["won", "lost", "closed"].includes(d.stage),
  ).length;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Key stats — adapt to who this contact is */}
      <div className="lg:col-span-2 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isCustomer && (
          <>
            <KpiCard
              icon={<TrendingUp className="w-4 h-4" />}
              label="Lifetime value"
              value={tlLoading ? "—" : fmtMoney(lifetimeValue, "NGN")}
              accent="gold"
            />
            <KpiCard
              icon={<Receipt className="w-4 h-4" />}
              label="Invoices"
              value={tlLoading ? "—" : `${timeline?.invoices?.length ?? 0}`}
              accent="gold"
            />
          </>
        )}
        <KpiCard
          icon={<CheckSquare className="w-4 h-4" />}
          label="Open tasks"
          value={`${openTasks.length}`}
          accent="rose"
          onClick={() => onJumpTab("tasks")}
        />
        {isCustomer ? (
          <KpiCard
            icon={<MessageSquare className="w-4 h-4" />}
            label="Open deals"
            value={`${openDeals}`}
            accent="sage"
            onClick={() => onJumpTab("deals")}
          />
        ) : (
          <KpiCard
            icon={<Calendar className="w-4 h-4" />}
            label="Upcoming events"
            value={`${upcomingEvents.length}`}
            accent="sage"
            onClick={() => onJumpTab("calendar")}
          />
        )}
      </div>

      {/* Stakeholder snapshots */}
      {isEmployee && <EmployeeSnapshot contactId={contact.contact_id} onJumpTab={onJumpTab} />}
      {isSupplier && <SupplierSnapshot contactId={contact.contact_id} onJumpTab={onJumpTab} />}
      {isPartner && <PartnerSnapshot contactId={contact.contact_id} onJumpTab={onJumpTab} />}

      {/* Upcoming events */}
      <Card className="p-5">
        <Header
          icon={<Calendar className="w-3.5 h-3.5" />}
          title="Upcoming"
          onJump={() => onJumpTab("calendar")}
        />
        {!events ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : upcomingEvents.length === 0 ? (
          <p className="text-xs text-brand-smoke">No upcoming events.</p>
        ) : (
          <ul className="space-y-2">
            {upcomingEvents.map((e) => (
              <li
                key={e.event_id}
                className="flex items-start gap-3 p-3 rounded-xl bg-brand-black/30 border border-brand-graphite"
              >
                <div className="shrink-0 w-10 h-10 rounded-lg bg-brand-accent/15 text-brand-accent flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-brand-cream truncate">
                    {e.title}
                  </div>
                  <div className="text-[0.65rem] text-brand-smoke mt-0.5">
                    {fmtDateTime(e.start_at)}
                  </div>
                  {e.location && (
                    <div className="text-[0.65rem] text-brand-smoke">
                      {e.location}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Recent activity */}
      <Card className="p-5">
        <Header
          icon={<MessageSquare className="w-3.5 h-3.5" />}
          title="Recent activity"
          onJump={() => onJumpTab("activity")}
        />
        {tlLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : (timeline?.activities ?? []).length === 0 ? (
          <p className="text-xs text-brand-smoke">No activity recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {(timeline?.activities ?? []).slice(0, 4).map((a) => (
              <li
                key={a.activity_id}
                className="flex items-start gap-3 text-xs"
              >
                <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-brand-accent mt-1.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-brand-cream truncate">{a.summary}</div>
                  <div className="text-[0.65rem] text-brand-smoke">
                    {fmtRelative(a.performed_at)} · {a.activity_type}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Recent invoices */}
      <Card className="p-5">
        <Header
          icon={<Receipt className="w-3.5 h-3.5" />}
          title="Recent invoices"
          onJump={() => onJumpTab("invoices")}
        />
        {tlLoading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : (timeline?.invoices ?? []).length === 0 ? (
          <p className="text-xs text-brand-smoke">
            No invoices yet in {active}.
          </p>
        ) : (
          <ul className="space-y-2">
            {(timeline?.invoices ?? []).slice(0, 4).map((inv) => (
              <li
                key={inv.invoice_id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-brand-black/30 border border-brand-graphite"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-brand-accent shrink-0" />
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-brand-cream truncate">
                      {inv.invoice_number}
                    </div>
                    <div className="text-[0.6rem] text-brand-smoke">
                      {fmtDate(inv.issue_date)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    tone={
                      inv.status === "paid"
                        ? "sage"
                        : inv.status === "overdue"
                          ? "danger"
                          : "neutral"
                    }
                    size="xs"
                  >
                    {inv.status}
                  </Badge>
                  <span className="text-xs font-medium text-brand-cream">
                    {fmtMoney(inv.total_amount, "NGN")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Default address */}
      <Card className="p-5">
        <Header
          icon={<MapPin className="w-3.5 h-3.5" />}
          title="Primary address"
          onJump={() => onJumpTab("properties")}
        />
        {(contact.addresses ?? []).length === 0 ? (
          <p className="text-xs text-brand-smoke">No address on file.</p>
        ) : (
          (() => {
            const def =
              (contact.addresses ?? []).find((a) => a.is_default) ??
              (contact.addresses ?? [])[0];
            return (
              <div className="text-sm text-brand-cream space-y-0.5">
                {def.recipient_name && (
                  <div className="text-xs text-brand-smoke">
                    {def.recipient_name}
                  </div>
                )}
                <div>
                  {def.line1}
                  {def.line2 ? `, ${def.line2}` : ""}
                </div>
                <div>
                  {[def.area, def.city, def.state].filter(Boolean).join(", ")}
                </div>
                {def.landmark && (
                  <div className="text-xs text-brand-smoke">
                    Near {def.landmark}
                  </div>
                )}
              </div>
            );
          })()
        )}
      </Card>
    </div>
  );
}

function Header({
  icon,
  title,
  onJump,
}: {
  icon: React.ReactNode;
  title: string;
  onJump: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="inline-flex items-center gap-2 text-[0.65rem] tracking-widest uppercase text-brand-accent">
        {icon}
        {title}
      </div>
      <button
        onClick={onJump}
        className="text-[0.65rem] text-brand-smoke hover:text-brand-cream inline-flex items-center gap-1 transition-colors"
      >
        See all <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  accent,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "gold" | "rose" | "sage";
  onClick?: () => void;
}) {
  const accentBg = {
    gold: "bg-brand-accent/15 text-brand-accent",
    rose: "bg-accent3/15 text-accent3",
    sage: "bg-accent2/15 text-accent2",
  }[accent];
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "p-4 rounded-2xl border border-brand-graphite bg-brand-charcoal/60 text-left transition-all",
        onClick &&
          "hover:border-brand-accent/40 hover:-translate-y-0.5 cursor-pointer",
      )}
    >
      <div
        className={cn(
          "inline-flex items-center justify-center w-8 h-8 rounded-lg",
          accentBg,
        )}
      >
        {icon}
      </div>
      <div className="mt-2 text-[0.6rem] tracking-widest uppercase text-brand-smoke">
        {label}
      </div>
      <div className="text-xl font-display text-brand-cream mt-0.5 tabular-nums">
        {value}
      </div>
    </button>
  );
}

// ── Per-type snapshots ───────────────────────────────────────────────────────
// Employee: role & tenure only — salary stays inside the restricted
// Employment tab, never on the overview.

function EmployeeSnapshot({
  contactId,
  onJumpTab,
}: {
  contactId: string;
  onJumpTab: (tab: string) => void;
}) {
  const { staff } = useStaffByContact(contactId);
  if (!staff) return null;
  const tenure = staff.start_date
    ? fmtRelative(staff.start_date).replace(" ago", "")
    : null;
  return (
    <Card className="p-5 lg:col-span-2">
      <button
        type="button"
        onClick={() => onJumpTab("employment")}
        className="w-full text-left"
      >
        <div className="flex items-center gap-2 mb-3">
          <Briefcase className="w-4 h-4 text-brand-accent" />
          <span className="text-[0.65rem] tracking-widest uppercase text-brand-accent">
            Employment
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-brand-smoke ml-auto" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
              Role
            </div>
            <div className="text-brand-cream mt-0.5">{staff.job_title}</div>
          </div>
          <div>
            <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
              Employee #
            </div>
            <div className="text-brand-cream mt-0.5 font-mono text-xs">
              {staff.employee_number}
            </div>
          </div>
          <div>
            <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
              Department
            </div>
            <div className="text-brand-cream mt-0.5 capitalize">
              {staff.department ?? "—"}
            </div>
          </div>
          <div>
            <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
              With us for
            </div>
            <div className="text-brand-cream mt-0.5">
              {tenure ?? "—"}
              {staff.end_date ? " (ended)" : ""}
            </div>
          </div>
        </div>
      </button>
    </Card>
  );
}

function SupplierSnapshot({
  contactId,
  onJumpTab,
}: {
  contactId: string;
  onJumpTab: (tab: string) => void;
}) {
  const { data: sups } = useQuery({
    queryKey: ["purchasing", "suppliers", "by-contact", contactId],
    queryFn: () => listSuppliers({ contact_id: contactId, limit: 1 }),
  });
  const supplier = sups?.data?.[0] ?? null;

  const { data: poResp } = useQuery({
    queryKey: ["purchasing", "pos", "by-supplier", supplier?.supplier_id],
    queryFn: () => listPOs({ supplier_id: supplier!.supplier_id, limit: 100 }),
    enabled: !!supplier,
  });
  const { data: bills = [] } = useQuery({
    queryKey: ["purchasing", "bills", "by-supplier", supplier?.supplier_id],
    queryFn: () => listBills({ supplier_id: supplier!.supplier_id }),
    enabled: !!supplier,
  });
  if (!supplier) return null;

  const pos = poResp?.data ?? [];
  const openPOs = pos.filter(
    (po) => !["received", "cancelled", "paid"].includes(po.status),
  ).length;
  const owed = bills.reduce(
    (s, b) => s + Math.max(0, Number(b.amount) - Number(b.amount_paid ?? 0)),
    0,
  );
  return (
    <Card className="p-5 lg:col-span-2">
      <button
        type="button"
        onClick={() => onJumpTab("purchasing")}
        className="w-full text-left"
      >
        <div className="flex items-center gap-2 mb-3">
          <ShoppingCart className="w-4 h-4 text-brand-accent" />
          <span className="text-[0.65rem] tracking-widest uppercase text-brand-accent">
            Supplier · {supplier.supplier_code}
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-brand-smoke ml-auto" />
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
              Open POs
            </div>
            <div className="text-brand-cream mt-0.5 tabular-nums">{openPOs}</div>
          </div>
          <div>
            <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
              We owe them
            </div>
            <div
              className={cn(
                "mt-0.5 tabular-nums",
                owed > 0 ? "text-state-warn" : "text-accent2",
              )}
            >
              {fmtMoney(owed, "NGN")}
            </div>
          </div>
          <div>
            <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
              Payment terms
            </div>
            <div className="text-brand-cream mt-0.5">
              {supplier.payment_terms_days ?? 30} days
            </div>
          </div>
        </div>
      </button>
    </Card>
  );
}

function PartnerSnapshot({
  contactId,
  onJumpTab,
}: {
  contactId: string;
  onJumpTab: (tab: string) => void;
}) {
  const { data: partners } = useQuery({
    queryKey: ["retail-partners", "by-contact", contactId],
    queryFn: () => listPartners({ contact_id: contactId, limit: 1 }),
  });
  const partner = partners?.data?.[0] ?? null;
  if (!partner) return null;
  return (
    <Card className="p-5 lg:col-span-2">
      <button
        type="button"
        onClick={() => onJumpTab("partner")}
        className="w-full text-left"
      >
        <div className="flex items-center gap-2 mb-3">
          <Handshake className="w-4 h-4 text-brand-accent" />
          <span className="text-[0.65rem] tracking-widest uppercase text-brand-accent">
            Retail partner · {partner.partner_code}
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-brand-smoke ml-auto" />
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
              Arrangement
            </div>
            <div className="text-brand-cream mt-0.5 capitalize">
              {partner.arrangement_type}
            </div>
          </div>
          <div>
            <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
              Balance owed to us
            </div>
            <div
              className={cn(
                "mt-0.5 tabular-nums",
                Number(partner.current_balance) > 0
                  ? "text-state-warn"
                  : "text-accent2",
              )}
            >
              {fmtMoney(partner.current_balance ?? 0, "NGN")}
            </div>
          </div>
          <div>
            <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
              Settlement cycle
            </div>
            <div className="text-brand-cream mt-0.5 capitalize">
              {partner.settlement_cycle ?? "monthly"}
            </div>
          </div>
        </div>
      </button>
    </Card>
  );
}
