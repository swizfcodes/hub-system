import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, type Tab } from "@components/ui/Tabs";
import { OverviewTab } from "./tabs/OverviewTab";
import { ActivityTab } from "./tabs/ActivityTab";
import { TasksTab } from "./tabs/TasksTab";
import { CalendarTab } from "./tabs/CalendarTab";
import { NotesTab } from "./tabs/NotesTab";
import { PropertiesTab } from "./tabs/PropertiesTab";
import { AuditTab } from "./tabs/AuditTab";
import { ConciergeTab } from "./tabs/ConciergeTab";
import {
  listDocuments,
  uploadDocument,
  downloadDocument,
  deleteDocument,
} from "@services/documents";
import { useBusinessStore } from "@stores/useBusinessStore";
import { showToast } from "@hooks/useToast";
import { errMsg } from "@services/api";
import { listDeals } from "@services/crm/deals";
import { listInvoices } from "@services/invoicing/invoices";
import { listSuppliers } from "@services/purchasing/suppliers";
import { listPOs } from "@services/purchasing/purchaseOrders";
import {
  listPartners,
  listConsignmentStock,
  listSettlements,
} from "@services/retail-partners/retailPartnersService";
import { PartnerFormModal } from "@components/retail-partners/RetailPartnerComponents";
import { Handshake } from "lucide-react";
import { Card } from "@components/ui/Card";
import { Skeleton } from "@components/ui/Skeleton";
import { Badge } from "@components/ui/Badge";
import { StagePill } from "@components/crm/shared/StagePill";
import { ProbabilityBar } from "@components/crm/shared/ProbabilityBar";
import { fmtMoney, fmtRelative } from "@lib/format";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  TrendingUp,
  Plus,
  Receipt,
  FileText,
  Upload,
  Download,
  Trash2,
  ShoppingCart,
  Package,
} from "lucide-react";
import { fmtDate } from "@lib/format";
import { EmptyState } from "@components/ui/EmptyState";
import { Button } from "@components/ui/Button";
import { NewDealModal } from "@components/crm/modals/NewDealModal";
import type { Contact } from "@typedefs/contacts";

interface Props {
  contact: Contact;
  /** Extra tabs injected when contact is also staff. */
  extraTabs?: Tab[];
  extraRenderers?: Record<string, () => React.ReactNode>;
}

export function ContactDetailTabs({
  contact,
  extraTabs = [],
  extraRenderers = {},
}: Props) {
  const [active, setActive] = useState("overview");

  // Tabs adapt to what the contact actually is. Universal tabs always show;
  // customer-only (Deals / Invoices / Concierge) and supplier-only (Purchasing)
  // tabs appear based on contact_type. Staff employment tabs arrive via extraTabs.
  const types = contact.contact_type ?? [];
  const isCustomer = types.includes("customer");
  const isSupplier = types.includes("supplier");
  const isPartner = types.includes("retail_partner");

  const tabs: Tab[] = [
    { key: "overview", label: "Overview" },
    { key: "activity", label: "Activity" },
    { key: "tasks", label: "Tasks" },
    { key: "calendar", label: "Calendar" },
    ...extraTabs,
    ...(isCustomer ? [
      { key: 'deals',     label: 'Deals' },
      { key: 'invoices',  label: 'Invoices' },
      { key: 'concierge', label: 'Concierge' },
    ] : []),
    ...(isSupplier ? [{ key: 'purchasing', label: 'Purchasing' }] : []),
    ...(isPartner ? [{ key: 'partner', label: 'Partnership' }] : []),
    { key: 'notes',      label: 'Notes' },
    { key: 'documents',  label: 'Documents' },
    { key: 'properties', label: 'Addresses & tags' },
    { key: 'audit',      label: 'Audit' },
  ];

  return (
    <div className="space-y-6">
      <Tabs tabs={tabs} active={active} onChange={setActive} />

      <div className="animate-slide-up">
        {active === "overview" && (
          <OverviewTab contact={contact} onJumpTab={setActive} />
        )}
        {active === "activity" && (
          <ActivityTab contactId={contact.contact_id} />
        )}
        {active === "tasks" && (
          <TasksTab
            contactId={contact.contact_id}
            contactName={contact.display_name}
          />
        )}
        {active === "calendar" && (
          <CalendarTab
            contactId={contact.contact_id}
            contactName={contact.display_name}
          />
        )}
        {active === "deals" && isCustomer && (
          <DealsTab
            contactId={contact.contact_id}
            contactName={contact.display_name}
          />
        )}
        {active === "invoices" && isCustomer && (
          <ContactInvoicesTab
            contactId={contact.contact_id}
            contactName={contact.display_name}
          />
        )}
        {active === "concierge" && isCustomer && (
          <ConciergeTab
            contactId={contact.contact_id}
            contactName={contact.display_name}
          />
        )}
        {active === "purchasing" && isSupplier && (
          <SupplierPurchasingTab
            contactId={contact.contact_id}
            contactName={contact.display_name}
          />
        )}
        {active === "partner" && isPartner && (
          <RetailPartnerTab contact={contact} />
        )}
        {active === "notes" && <NotesTab contact={contact} />}
        {active === "documents" && (
          <ContactDocumentsTab
            contactId={contact.contact_id}
            contactName={contact.display_name}
          />
        )}
        {active === "properties" && <PropertiesTab contact={contact} />}
        {active === "audit" && <AuditTab contactId={contact.contact_id} />}
        {extraRenderers[active]?.()}
      </div>
    </div>
  );
}

function DealsTab({
  contactId,
  contactName,
}: {
  contactId: string;
  contactName: string;
}) {
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["crm", "deals", { contactId }],
    queryFn: () => listDeals({ contact_id: contactId, limit: 50 }),
  });

  const deals = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent inline-flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5" /> Deals · {deals.length}
        </h3>
        <Button
          variant="gold"
          size="sm"
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => setCreating(true)}
        >
          New deal
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="w-6 h-6" />}
          title="No deals yet"
          description={`Create the first deal with ${contactName}.`}
          action={
            <Button
              variant="gold"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setCreating(true)}
            >
              New deal
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {deals.map((d) => (
            <Link key={d.deal_id} to={`/crm/${d.deal_id}`}>
              <Card className="p-4 hover:border-brand-accent/40 transition-all cursor-pointer">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-brand-cream truncate">
                        {d.title}
                      </span>
                      <StagePill stageKey={d.stage} />
                      {d.won_at && (
                        <Badge tone="sage" size="xs">
                          Won
                        </Badge>
                      )}
                      {d.lost_at && (
                        <Badge tone="danger" size="xs">
                          Lost
                        </Badge>
                      )}
                    </div>
                    <div className="text-[0.65rem] text-brand-smoke mt-1">
                      Updated {fmtRelative(d.updated_at)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-sm text-brand-accent">
                      {fmtMoney(d.expected_value, "NGN")}
                    </div>
                    <div className="text-[0.6rem] text-brand-smoke">
                      {d.probability}%
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-brand-smoke shrink-0 mt-0.5" />
                </div>
                <ProbabilityBar
                  probability={d.probability ?? 50}
                  className="mt-2"
                />
              </Card>
            </Link>
          ))}
        </div>
      )}

      <NewDealModal
        open={creating}
        onClose={() => setCreating(false)}
        defaultContactId={contactId}
      />
    </div>
  );
}

function ContactInvoicesTab({
  contactId,
  contactName,
}: {
  contactId: string;
  contactName: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["invoicing", { contactId }],
    queryFn: () => listInvoices({ contactId, limit: 50 }),
  });
  const invoices = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent inline-flex items-center gap-2">
          <Receipt className="w-3.5 h-3.5" /> Invoices · {invoices.length}
        </h3>
        <Link to={`/invoicing?contact=${contactId}`}>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<ArrowUpRight className="w-3.5 h-3.5" />}
          >
            Open Invoicing
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={<Receipt className="w-6 h-6" />}
          title="No invoices yet"
          description={`No invoices have been issued to ${contactName}.`}
        />
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <Link key={inv.invoice_id} to={`/invoicing/${inv.invoice_id}`}>
              <Card className="p-4 hover:border-brand-accent/40 transition-all cursor-pointer">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-brand-smoke">
                        {inv.invoice_number}
                      </span>
                      <Badge
                        tone={
                          inv.status === "paid"
                            ? "sage"
                            : inv.status === "overdue"
                              ? "danger"
                              : "neutral"
                        }
                        size="xs"
                        dot
                      >
                        {inv.status}
                      </Badge>
                    </div>
                    <div className="text-[0.65rem] text-brand-smoke mt-1">
                      Due {fmtDate(inv.due_date)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-sm text-brand-accent">
                      {fmtMoney(inv.total_amount, "NGN")}
                    </span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-brand-smoke" />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function poTone(status: string): "sage" | "danger" | "neutral" | "gold" {
  if (status === "received" || status === "closed" || status === "completed")
    return "sage";
  if (status === "cancelled") return "danger";
  if (status === "draft") return "neutral";
  return "gold";
}

function SupplierPurchasingTab({
  contactId,
  contactName,
}: {
  contactId: string;
  contactName: string;
}) {
  const { data: sups, isLoading: loadingSup } = useQuery({
    queryKey: ["purchasing", "suppliers", "by-contact", contactId],
    queryFn: () => listSuppliers({ contact_id: contactId, limit: 1 }),
  });
  const supplier = sups?.data?.[0] ?? null;

  const { data: poResp, isLoading: loadingPO } = useQuery({
    queryKey: ["purchasing", "pos", "by-supplier", supplier?.supplier_id],
    queryFn: () => listPOs({ supplier_id: supplier!.supplier_id, limit: 50 }),
    enabled: !!supplier?.supplier_id,
  });
  const pos = poResp?.data ?? [];

  if (loadingSup) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  if (!supplier) {
    return (
      <EmptyState
        icon={<Package className="w-6 h-6" />}
        title="No supplier record yet"
        description={`${contactName} is tagged as a supplier but isn’t set up in Procurement yet.`}
        action={
          <Link to="/procurement/suppliers">
            <Button variant="gold" size="sm">
              Open Procurement
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent inline-flex items-center gap-2">
          <ShoppingCart className="w-3.5 h-3.5" /> Purchase orders ·{" "}
          {pos.length}
        </h3>
        <Link to={`/procurement/suppliers/${supplier.supplier_id}`}>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<ArrowUpRight className="w-3.5 h-3.5" />}
          >
            Supplier file
          </Button>
        </Link>
      </div>

      {loadingPO ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : pos.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="w-6 h-6" />}
          title="No purchase orders yet"
          description={`No POs have been raised for ${contactName}.`}
          action={
            <Link to="/procurement/purchase-orders/new">
              <Button
                variant="gold"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                New PO
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {pos.map((po) => (
            <Link
              key={po.po_id}
              to={`/procurement/purchase-orders/${po.po_id}`}
            >
              <Card className="p-4 hover:border-brand-accent/40 transition-all cursor-pointer">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-brand-smoke">
                      {po.po_number}
                    </span>
                    <Badge tone={poTone(po.status)} size="xs" dot>
                      {po.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-sm text-brand-accent">
                      {fmtMoney(po.total_amount, "NGN")}
                    </span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-brand-smoke" />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
}

// Must match the backend's allowed document_type enum (documents.service).
const CONTACT_DOC_TYPES: { value: string; label: string }[] = [
  { value: 'other',                   label: 'Other / general' },
  { value: 'employment_contract',     label: 'Employment contract' },
  { value: 'nda',                     label: 'NDA' },
  { value: 'authenticity_certificate',label: 'Authenticity certificate' },
  { value: 'warranty_card',           label: 'Warranty card' },
  { value: 'appraisal',               label: 'Appraisal' },
  { value: 'supplier_invoice',        label: 'Supplier invoice' },
  { value: 'supplier_quotation',      label: 'Supplier quotation' },
  { value: 'purchase_order',          label: 'Purchase order' },
  { value: 'invoice',                 label: 'Invoice' },
  { value: 'receipt',                 label: 'Receipt' },
  { value: 'delivery_note',           label: 'Delivery note' },
];

function ContactDocumentsTab({ contactId, contactName }: { contactId: string; contactName: string }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const business = useBusinessStore((s) => s.active);
  const [docType, setDocType] = useState('other');

  const { data, isLoading } = useQuery({
    queryKey: ["contacts", contactId, "documents"],
    queryFn: () =>
      listDocuments({
        reference_type: "contact",
        reference_id: contactId,
        limit: 100,
      }),
  });
  const docs = data?.data ?? [];

  const upload = useMutation({
    mutationFn: (file: File) => uploadDocument({
      file,
      business: business ?? '',
      document_type: docType,
      title: file.name,
      reference_type: 'contact',
      reference_id: contactId,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contacts', contactId, 'documents'] }); showToast.success('Document uploaded'); },
    onError: (e) => showToast.error('Upload failed', errMsg(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteDocument(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts", contactId, "documents"] });
      showToast.success("Document removed");
    },
    onError: (e) => showToast.error("Could not remove", errMsg(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent inline-flex items-center gap-2">
          <FileText className="w-3.5 h-3.5" /> Documents · {docs.length}
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            title="Document type"
            className="bg-brand-charcoal text-brand-cream border border-brand-graphite rounded-lg px-2.5 py-2 text-xs focus:border-brand-accent focus:outline-none max-w-[10rem]"
          >
            {CONTACT_DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input ref={inputRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); if (inputRef.current) inputRef.current.value = ''; }} />
          <Button variant="gold" size="sm" leftIcon={<Upload className="w-3.5 h-3.5" />} loading={upload.isPending} disabled={!business} onClick={() => inputRef.current?.click()}>
            Upload
          </Button>
        </div>
      </div>

      {!business && (
        <p className="text-xs text-state-warn">
          Select a business above to upload documents.
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-6 h-6" />}
          title="No documents yet"
          description={`Upload contracts, IDs or photos linked to ${contactName}.`}
        />
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <Card key={d.document_id} className="p-3.5 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-brand-graphite text-brand-accent flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-brand-cream truncate">
                  {d.title}
                </div>
                <div className="text-[0.6rem] text-brand-smoke mt-0.5">
                  {fmtBytes(d.file_size_bytes)} · {fmtRelative(d.created_at)}
                  {d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ""}
                </div>
              </div>
              <button
                onClick={() =>
                  downloadDocument(d).catch(() =>
                    showToast.error("Download failed"),
                  )
                }
                className="p-2 text-brand-smoke hover:text-brand-cream"
                aria-label="Download"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => remove.mutate(d.document_id)}
                className="p-2 text-brand-smoke hover:text-state-danger"
                aria-label="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Retail partner tab — terms, consignment position, settlements ───────────

function RetailPartnerTab({ contact }: { contact: Contact }) {
  const [setupOpen, setSetupOpen] = useState(false);
  const qc = useQueryClient();

  const { data: partners, isLoading } = useQuery({
    queryKey: ["retail-partners", "by-contact", contact.contact_id],
    queryFn: () => listPartners({ contact_id: contact.contact_id, limit: 1 }),
  });
  const partner = partners?.data?.[0] ?? null;

  const { data: stock } = useQuery({
    queryKey: ["retail-partners", partner?.partner_id, "stock"],
    queryFn: () => listConsignmentStock({ partner_id: partner!.partner_id }),
    enabled: !!partner,
  });
  const { data: settlements = [] } = useQuery({
    queryKey: ["retail-partners", partner?.partner_id, "settlements"],
    queryFn: () => listSettlements({ partner_id: partner!.partner_id }),
    enabled: !!partner,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  if (!partner) {
    return (
      <>
        <EmptyState
          icon={<Handshake className="w-6 h-6" />}
          title="No partner record yet"
          description={`${contact.display_name} is tagged as a retail partner but the partnership terms haven't been set up.`}
          action={
            <Button variant="gold" size="sm" onClick={() => setSetupOpen(true)}>
              Set up partnership
            </Button>
          }
        />
        <PartnerFormModal
          open={setupOpen}
          onClose={() => setSetupOpen(false)}
          defaultContact={contact}
          onSaved={() => {
            setSetupOpen(false);
            qc.invalidateQueries({ queryKey: ["retail-partners"] });
          }}
        />
      </>
    );
  }

  const onConsignment = (stock?.data ?? []).reduce(
    (s, row) => s + Number(row.quantity_outstanding ?? 0),
    0,
  );
  const unpaidSettlements = settlements.filter((st) => st.status !== "paid");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.65rem] tracking-widest uppercase text-brand-accent inline-flex items-center gap-2">
          <Handshake className="w-3.5 h-3.5" /> Partnership · {partner.partner_code}
        </h3>
        <Link to="/retail-partners">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<ArrowUpRight className="w-3.5 h-3.5" />}
          >
            Open Retail Partners
          </Button>
        </Link>
      </div>

      {/* Terms */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
            Arrangement
          </div>
          <div className="text-sm text-brand-cream mt-1 capitalize">
            {partner.arrangement_type}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
            {partner.arrangement_type === "wholesale"
              ? "Wholesale discount"
              : "Our margin"}
          </div>
          <div className="text-sm text-brand-cream mt-1">
            {partner.arrangement_type === "wholesale"
              ? `${partner.wholesale_discount_pct ?? 0}%`
              : `${partner.consignment_margin_pct ?? 0}%`}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
            Units on consignment
          </div>
          <div className="text-sm text-brand-cream mt-1 tabular-nums">
            {onConsignment}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[0.6rem] uppercase tracking-widest text-brand-smoke">
            Balance owed to us
          </div>
          <div
            className={`text-sm mt-1 tabular-nums ${Number(partner.current_balance) > 0 ? "text-state-warn" : "text-accent2"}`}
          >
            {fmtMoney(partner.current_balance ?? 0, "NGN")}
          </div>
        </Card>
      </div>

      {/* Outstanding settlements */}
      <div>
        <h4 className="text-[0.65rem] tracking-widest uppercase text-brand-smoke mb-2">
          Settlements · {unpaidSettlements.length} open
        </h4>
        {settlements.length === 0 ? (
          <p className="text-xs text-brand-smoke">No settlements yet.</p>
        ) : (
          <div className="space-y-2">
            {settlements.slice(0, 8).map((st) => (
              <Card key={st.settlement_id} className="p-3.5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-brand-smoke">
                      {st.settlement_number}
                    </span>
                    <Badge
                      tone={st.status === "paid" ? "sage" : "gold"}
                      size="xs"
                      dot
                    >
                      {st.status}
                    </Badge>
                  </div>
                  <span className="font-mono text-sm text-brand-accent">
                    {fmtMoney(st.net_payable ?? st.amount ?? 0, "NGN")}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
