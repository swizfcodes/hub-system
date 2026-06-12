// Client profile — the relationship 360 for the current business.
//
// Everything a salesperson needs before picking up the phone or
// greeting a walk-in: lifetime value, purchase rhythm, preferences,
// milestones, loyalty, open balance, B2B deals and notes. The
// contacts module remains the admin record (addresses, documents,
// type management) — linked from the header.

import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  Cake,
  Crown,
  ExternalLink,
  Gem,
  Mail,
  MessageCircle,
  Phone,
  Pin,
  Plus,
  Receipt,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { Button } from "@components/ui/Button";
import { Badge } from "@components/ui/Badge";
import { Tabs } from "@components/ui/Tabs";
import { Card } from "@components/ui/Card";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { Textarea } from "@components/ui/Textarea";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { PreferencesPanel } from "@components/crm/concierge/PreferencesPanel";
import { MilestonesPanel } from "@components/crm/concierge/MilestonesPanel";
import { NewDealModal } from "@components/crm/modals/NewDealModal";
import { StagePill } from "@components/crm/shared/StagePill";
import {
  ClientAvatar,
  SegmentBadge,
  VipStar,
} from "@components/crm/clients/ClientBits";
import {
  addClientNote,
  getClient,
  listClientNotes,
  listClientPurchases,
} from "@services/crm/clients";
import { fmtDate, fmtMoney, fmtRelative } from "@lib/format";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import type { ClientProfileData } from "@typedefs/crm";

type TabKey = "overview" | "purchases" | "concierge" | "deals" | "notes";

export default function ClientProfile() {
  const { contactId = "" } = useParams();
  const { active: business } = useActiveBusiness();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("overview");
  const [newDeal, setNewDeal] = useState(false);

  const { data: client, isLoading } = useQuery({
    queryKey: ["crm", "client", business, contactId],
    queryFn: () => getClient(contactId),
    enabled: !!contactId,
  });

  if (isLoading || !client) {
    return (
      <>
        <Topbar title="CRM" subtitle="Client profile" />
        <div className="px-4 sm:px-8 py-8 max-w-[1200px] mx-auto space-y-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-20" />
          <Skeleton className="h-64" />
        </div>
      </>
    );
  }

  const spend = Number(client.total_spend) || 0;
  const ins = client.insights;

  return (
    <>
      <Topbar title="CRM" subtitle={client.display_name} />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-[1200px] mx-auto">
        {/* ── Header ── */}
        <button
          onClick={() => navigate("/crm")}
          className="inline-flex items-center gap-1.5 text-[0.65rem] uppercase tracking-widest text-brand-smoke hover:text-brand-cream mb-4 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Clients
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          <ClientAvatar name={client.display_name} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-display text-brand-cream">
                {client.display_name}
              </h1>
              <VipStar isVip={client.is_vip} />
              <SegmentBadge segment={client.segment} />
              {client.tags.map((t) => (
                <Badge key={t.tag_id} tone="neutral" size="xs">
                  {t.tag_name}
                </Badge>
              ))}
            </div>
            <div className="text-[0.7rem] text-brand-smoke mt-1">
              {client.company_name && `${client.company_name} · `}
              {client.source && `via ${client.source.replace(/_/g, " ")} · `}
              client since {fmtDate(client.created_at)}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {client.primary_phone && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Phone className="w-3.5 h-3.5" />}
                onClick={() => window.open(`tel:${client.primary_phone}`)}
              >
                Call
              </Button>
            )}
            {(client.whatsapp_number || client.primary_phone) && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<MessageCircle className="w-3.5 h-3.5" />}
                onClick={() =>
                  window.open(
                    `https://wa.me/${(client.whatsapp_number || client.primary_phone || "").replace(/[^0-9]/g, "")}`,
                  )
                }
              >
                WhatsApp
              </Button>
            )}
            {client.email && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Mail className="w-3.5 h-3.5" />}
                onClick={() => window.open(`mailto:${client.email}`)}
              >
                Email
              </Button>
            )}
            <Link to={`/contacts/${client.contact_id}`}>
              <Button
                variant="ghost"
                size="sm"
                rightIcon={<ExternalLink className="w-3.5 h-3.5" />}
              >
                Full record
              </Button>
            </Link>
          </div>
        </div>

        {/* ── KPIs ── */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-5 mb-4">
          <Kpi
            icon={<Gem className="w-4 h-4" />}
            label="Lifetime spend"
            value={fmtMoney(spend, "NGN")}
          />
          <Kpi
            icon={<Receipt className="w-4 h-4" />}
            label="Purchases"
            value={String(client.purchase_count)}
            hint={
              ins.avg_basket
                ? `avg ${fmtMoney(ins.avg_basket, "NGN")}`
                : undefined
            }
          />
          <Kpi
            icon={<Sparkles className="w-4 h-4" />}
            label="Last purchase"
            value={
              client.last_purchase_at
                ? fmtRelative(client.last_purchase_at)
                : "—"
            }
          />
          <Kpi
            icon={<Crown className="w-4 h-4" />}
            label="Loyalty points"
            value={client.loyalty_points.toLocaleString()}
          />
          <Kpi
            icon={<Wallet className="w-4 h-4" />}
            label="Open balance"
            value={fmtMoney(ins.open_balance, "NGN")}
            warn={ins.open_balance > 0}
            hint={
              ins.overdue_invoices > 0
                ? `${ins.overdue_invoices} overdue`
                : undefined
            }
          />
        </div>

        {/* ── Insight chips ── */}
        <div className="flex flex-wrap gap-1.5 mb-6">
          {ins.purchase_cadence_days != null && (
            <InsightChip>
              Buys every ~{Math.round(ins.purchase_cadence_days)} days
            </InsightChip>
          )}
          {ins.due_for_visit && (
            <InsightChip tone="warn">
              Overdue a visit — usually back by now
            </InsightChip>
          )}
          {ins.top_categories.slice(0, 2).map((c) => (
            <InsightChip key={c.category}>Loves {c.category}</InsightChip>
          ))}
          {client.next_birthday && (
            <InsightChip tone="rose">
              <Cake className="w-3 h-3 inline mr-1" />
              Birthday {fmtDate(client.next_birthday)}
            </InsightChip>
          )}
        </div>

        {/* ── Tabs ── */}
        <Tabs
          tabs={[
            { key: "overview", label: "Overview" },
            { key: "purchases", label: "Purchases", badge: client.purchase_count },
            { key: "concierge", label: "Concierge" },
            { key: "deals", label: "B2B deals", badge: client.deals.length || undefined },
            { key: "notes", label: "Notes" },
          ]}
          active={tab}
          onChange={(k) => setTab(k as TabKey)}
          className="mb-5"
        />

        {tab === "overview" && <OverviewTab client={client} />}
        {tab === "purchases" && <PurchasesTab contactId={contactId} />}
        {tab === "concierge" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <PreferencesPanel
              contactId={contactId}
              contactName={client.display_name}
            />
            <MilestonesPanel
              contactId={contactId}
              contactName={client.display_name}
            />
          </div>
        )}
        {tab === "deals" && (
          <DealsTab client={client} onNewDeal={() => setNewDeal(true)} />
        )}
        {tab === "notes" && <NotesTab contactId={contactId} />}
      </div>

      <NewDealModal
        open={newDeal}
        onClose={() => setNewDeal(false)}
        defaultContactId={client.contact_id}
        onCreated={(id) => navigate(`/crm/${id}`)}
      />
    </>
  );
}

// ── Pieces ──────────────────────────────────────────────────

function Kpi({
  icon,
  label,
  value,
  hint,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className="p-4 rounded-2xl border border-brand-graphite bg-brand-charcoal/60">
      <div
        className={
          warn
            ? "inline-flex items-center justify-center w-8 h-8 rounded-lg bg-state-warn/15 text-state-warn"
            : "inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-accent/15 text-brand-accent"
        }
      >
        {icon}
      </div>
      <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke mt-2">
        {label}
      </div>
      <div className="text-lg font-display text-brand-cream mt-0.5 tabular-nums truncate">
        {value}
      </div>
      {hint && <div className="text-[0.6rem] text-brand-smoke mt-0.5">{hint}</div>}
    </div>
  );
}

function InsightChip({
  children,
  tone = "gold",
}: {
  children: React.ReactNode;
  tone?: "gold" | "warn" | "rose";
}) {
  const cls = {
    gold: "border-brand-accent/30 text-brand-accent bg-brand-accent/10",
    warn: "border-state-warn/30 text-state-warn bg-state-warn/10",
    rose: "border-accent3/30 text-accent3 bg-accent3/10",
  }[tone];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[0.65rem] ${cls}`}
    >
      {children}
    </span>
  );
}

function OverviewTab({ client }: { client: ClientProfileData }) {
  const { data: purchases, isLoading } = useQuery({
    queryKey: ["crm", "client-purchases", client.contact_id, "recent"],
    queryFn: () => listClientPurchases(client.contact_id, { limit: 5 }),
  });
  const { data: notes } = useQuery({
    queryKey: ["crm", "client-notes", client.contact_id],
    queryFn: () => listClientNotes(client.contact_id),
  });
  const pinned = (notes ?? []).filter((n) => n.is_pinned).slice(0, 3);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-4 lg:col-span-2">
        <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-3">
          Recent purchases
        </h3>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : (purchases?.data ?? []).length === 0 ? (
          <p className="text-xs text-brand-smoke italic">
            Nothing yet — their first purchase will appear here automatically.
          </p>
        ) : (
          <ul className="space-y-2">
            {(purchases?.data ?? []).map((p) => (
              <PurchaseRow key={p.invoice_id} p={p} />
            ))}
          </ul>
        )}
      </Card>

      <div className="space-y-4">
        {pinned.length > 0 && (
          <Card className="p-4">
            <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-3">
              Pinned notes
            </h3>
            <ul className="space-y-2">
              {pinned.map((n) => (
                <li
                  key={n.note_id}
                  className="text-xs text-brand-cloud border-l-2 border-brand-accent/50 pl-2.5"
                >
                  {n.content}
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card className="p-4">
          <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-3">
            Preferences
          </h3>
          {client.preferences.length === 0 ? (
            <p className="text-xs text-brand-smoke italic">
              None recorded — capture sizes, metals, scents in Concierge.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {client.preferences.slice(0, 6).map((p) => (
                <li key={p.preference_id} className="flex justify-between text-xs">
                  <span className="text-brand-smoke">
                    {p.preference_key.replace(/_/g, " ")}
                  </span>
                  <span className="text-brand-cream">{p.preference_value}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-4">
          <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent mb-3">
            Important dates
          </h3>
          {client.milestones.length === 0 && !client.next_birthday ? (
            <p className="text-xs text-brand-smoke italic">None recorded.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {client.next_birthday && (
                <li className="flex justify-between">
                  <span className="text-brand-smoke">birthday</span>
                  <span className="text-brand-cream">
                    {fmtDate(client.next_birthday)}
                  </span>
                </li>
              )}
              {client.milestones.slice(0, 5).map((m) => (
                <li key={m.milestone_id} className="flex justify-between">
                  <span className="text-brand-smoke">
                    {m.milestone_type.replace(/_/g, " ")}
                  </span>
                  <span className="text-brand-cream">
                    {fmtDate(m.milestone_date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function PurchaseRow({
  p,
}: {
  p: import("@typedefs/crm").ClientPurchase;
}) {
  const typeLabel =
    p.invoice_type === "pos_sale" ? "In store" : "Invoice";
  return (
    <li className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03]">
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-accent/10 text-brand-accent shrink-0">
        <Receipt className="w-3.5 h-3.5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs text-brand-cream truncate">
          {p.summary || p.invoice_number}
        </span>
        <span className="block text-[0.6rem] text-brand-smoke">
          {typeLabel} · {fmtDate(p.issue_date)} · {p.invoice_number}
        </span>
      </span>
      <span className="text-right">
        <span className="block text-xs font-mono text-brand-accent tabular-nums">
          {fmtMoney(Number(p.total_amount), p.currency || "NGN")}
        </span>
        <Badge
          tone={p.status === "paid" ? "sage" : p.status === "overdue" ? "danger" : "neutral"}
          size="xs"
        >
          {p.status.replace(/_/g, " ")}
        </Badge>
      </span>
    </li>
  );
}

function PurchasesTab({ contactId }: { contactId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["crm", "client-purchases", contactId, page],
    queryFn: () => listClientPurchases(contactId, { page, limit: 25 }),
  });

  if (isLoading) return <Skeleton className="h-64" />;
  const rows = data?.data ?? [];
  if (rows.length === 0 && page === 1) {
    return (
      <EmptyState
        icon={<Receipt className="w-6 h-6" />}
        title="No purchases yet"
        description="POS sales, web orders and invoices all land here automatically."
      />
    );
  }
  return (
    <Card className="p-4">
      <ul className="space-y-2">
        {rows.map((p) => (
          <PurchaseRow key={p.invoice_id} p={p} />
        ))}
      </ul>
      <div className="flex justify-end gap-2 mt-4">
        <Button
          variant="ghost"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={rows.length < 25}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </Card>
  );
}

function DealsTab({
  client,
  onNewDeal,
}: {
  client: ClientProfileData;
  onNewDeal: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-[0.65rem] text-brand-smoke">
          For larger sales — corporate gifting, hotels, wholesale.
        </p>
        <Button
          variant="gold"
          size="sm"
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={onNewDeal}
        >
          New deal
        </Button>
      </div>
      {client.deals.length === 0 ? (
        <EmptyState
          icon={<Gem className="w-6 h-6" />}
          title="No deals"
          description="Day-to-day purchases don't need a deal — this is for the big, negotiated ones."
        />
      ) : (
        client.deals.map((d) => (
          <Link key={d.deal_id} to={`/crm/${d.deal_id}`} className="block">
            <Card className="p-4 flex items-center gap-3 hover:border-brand-accent/40 transition-colors">
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-brand-cream truncate">
                  {d.title}
                </span>
                <span className="block text-[0.6rem] text-brand-smoke mt-0.5">
                  opened {fmtDate(d.created_at)}
                  {d.expected_close_date &&
                    ` · closes ${fmtDate(d.expected_close_date)}`}
                </span>
              </span>
              {d.expected_value != null && (
                <span className="text-sm font-mono text-brand-accent tabular-nums">
                  {fmtMoney(Number(d.expected_value), "NGN")}
                </span>
              )}
              <StagePill stageKey={d.stage} size="xs" />
            </Card>
          </Link>
        ))
      )}
    </div>
  );
}

function NotesTab({ contactId }: { contactId: string }) {
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const [pin, setPin] = useState(false);

  const { data: notes, isLoading } = useQuery({
    queryKey: ["crm", "client-notes", contactId],
    queryFn: () => listClientNotes(contactId),
  });

  const mutation = useMutation({
    mutationFn: () => addClientNote(contactId, { content, is_pinned: pin }),
    onSuccess: () => {
      setContent("");
      setPin(false);
      qc.invalidateQueries({ queryKey: ["crm", "client-notes", contactId] });
    },
    onError: (e) => showToast.error("Could not save note", errMsg(e)),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What should the team remember about this client?"
          rows={3}
        />
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => setPin((v) => !v)}
            className={`inline-flex items-center gap-1.5 text-[0.65rem] uppercase tracking-wide transition-colors ${
              pin ? "text-brand-accent" : "text-brand-smoke hover:text-brand-cream"
            }`}
          >
            <Pin className="w-3.5 h-3.5" /> {pin ? "Pinned" : "Pin to profile"}
          </button>
          <Button
            variant="gold"
            size="sm"
            disabled={!content.trim()}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Add note
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <Skeleton className="h-32" />
      ) : (notes ?? []).length === 0 ? (
        <p className="text-xs text-brand-smoke italic px-1">
          No notes yet — the first one sets the tone.
        </p>
      ) : (
        <ul className="space-y-2">
          {(notes ?? []).map((n) => (
            <Card key={n.note_id} className="p-4">
              <div className="flex items-start gap-2">
                {n.is_pinned && (
                  <Pin className="w-3.5 h-3.5 text-brand-accent mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-brand-cloud whitespace-pre-wrap">
                    {n.content}
                  </p>
                  <p className="text-[0.6rem] text-brand-smoke mt-2">
                    {n.created_by_email || "team"} · {fmtRelative(n.created_at)}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
