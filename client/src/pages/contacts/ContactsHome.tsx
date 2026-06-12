import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  UserPlus,
  BookUser,
  QrCode,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { Topbar } from "@components/shell/Topbar";
import { PageHeader } from "@components/ui/PageHeader";
import { Button } from "@components/ui/Button";
import { Skeleton } from "@components/ui/Skeleton";
import { EmptyState } from "@components/ui/EmptyState";
import { TypeTabBar } from "@components/contacts/shell/TypeTabBar";
import {
  ViewSwitcher,
  type DirectoryView,
} from "@components/contacts/shell/ViewSwitcher";
import {
  DirectoryFilters,
  type DirectoryFilterValues,
} from "@components/contacts/shell/DirectoryFilters";
import { ContactRailRow } from "@components/contacts/shell/ContactRailRow";
import { ContactCard } from "@components/contacts/shell/ContactCard";
import { QuickAddModal } from "@components/contacts/modals/QuickAddModal";
import WalkinQRModal from "@components/contacts/modals/WalkinQRModal";
import { InviteSupplierModal } from "@components/procurement/suppliers/InviteSupplierModal";
import { PartnerFormModal } from "@components/retail-partners/RetailPartnerComponents";
import { listContacts } from "@services/contacts/contacts";
import { CONTACT_TYPE_META } from "@lib/constants/contactTypes";
import { useIsDesktop } from "@hooks/useMediaQuery";
import type { Contact, ContactType } from "@typedefs/contacts";
import { cn } from "@lib/cn";

type TabKey = "all" | ContactType;

const PAGE_SIZE = 50;

export default function ContactsHome() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<DirectoryView>(
    () =>
      (localStorage.getItem("orika_contacts_view") as DirectoryView) || "rail",
  );
  const [activeTab, setActiveTab] = useState<TabKey>(
    (searchParams.get("tab") as TabKey) || "all",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [partnerModalOpen, setPartnerModalOpen] = useState(false);
  const [walkinQROpen, setWalkinQROpen] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<DirectoryFilterValues>({
    search: "",
    priority: "",
    source: "",
    showAllBusinesses: false,
  });

  useEffect(() => {
    localStorage.setItem("orika_contacts_view", view);
  }, [view]);
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (activeTab !== "all") params.set("tab", activeTab);
    else params.delete("tab");
    setSearchParams(params, { replace: true });
    setPage(1);
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // All filtering is server-side — type, search, priority, source.
  const { data, isLoading } = useQuery({
    queryKey: ["contacts", { search: filters.search, type: activeTab, page }],
    queryFn: () =>
      listContacts({
        search: filters.search || undefined,
        type: activeTab !== "all" ? activeTab : undefined,
        page,
        limit: PAGE_SIZE,
      }),
    keepPreviousData: true,
  } as any);

  const contacts: Contact[] = (data as any)?.data ?? [];
  const total = (data as any)?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const counts: Partial<Record<TabKey, number>> = { all: total };

  const selected = contacts.find((c: Contact) => c.contact_id === selectedId);

  const onClickContact = (c: Contact) => {
    if (isDesktop && view === "rail") setSelectedId(c.contact_id);
    else navigate(`/contacts/${c.contact_id}`);
  };

  return (
    <>
      <Topbar
        title="Directory"
        subtitle="Clients · Suppliers · Employees · Partners"
      />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
        <PageHeader
          title="Directory"
          subtitle="Every person and organisation in your world — clients, suppliers, employees and retail partners — in one place. Tap a row to see the full profile."
          crumbs={[{ label: "Hub", to: "/" }, { label: "Directory" }]}
          actions={
            <>
              <ViewSwitcher value={view} onChange={setView} />
              <button
                title="Walk-in registration QR"
                onClick={() => setWalkinQROpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-brand-graphite px-3 py-2 text-xs text-brand-cloud hover:border-brand-accent/40 hover:text-brand-accent transition"
              >
                <QrCode className="w-4 h-4" />
                <span className="hidden sm:inline">Walk-in QR</span>
              </button>
              <Button
                variant="secondary"
                size="md"
                leftIcon={<UserPlus className="w-4 h-4" />}
                onClick={() => navigate("/contacts/new")}
              >
                Full form
              </Button>
              <Button
                variant="gold"
                size="md"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => {
                  if (activeTab === "supplier") setSupplierModalOpen(true);
                  else if (activeTab === "retail_partner")
                    setPartnerModalOpen(true);
                  else if (activeTab === "staff")
                    navigate("/contacts/staff/new");
                  else setQuickAddOpen(true);
                }}
              >
                Quick add
              </Button>
            </>
          }
        />

        <div className="mb-6 space-y-4">
          <TypeTabBar
            active={activeTab}
            onChange={(t) => {
              setActiveTab(t);
              setSelectedId(null);
            }}
            counts={counts}
          />
          <DirectoryFilters value={filters} onChange={setFilters} />
        </div>

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={<BookUser className="w-7 h-7" />}
            title={
              filters.search
                ? "No matches"
                : activeTab === "all"
                  ? "Your directory is empty"
                  : `No ${CONTACT_TYPE_META[activeTab as ContactType].shortLabel.toLowerCase()} yet`
            }
            description={
              filters.search
                ? "Try a different search term or clear the filters."
                : "Capture your first contact in under 10 seconds with Quick Add."
            }
            action={
              !filters.search && (
                <Button
                  variant="gold"
                  leftIcon={<Plus className="w-4 h-4" />}
                  onClick={() => {
                    if (activeTab === "supplier") setSupplierModalOpen(true);
                    else if (activeTab === "retail_partner")
                      setPartnerModalOpen(true);
                    else if (activeTab === "staff")
                      navigate("/contacts/staff/new");
                    else setQuickAddOpen(true);
                  }}
                >
                  Quick add
                </Button>
              )
            }
          />
        ) : view === "cards" ? (
          // Cards view
          <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 stagger">
            {contacts.map((c, i) => (
              <ContactCard
                key={c.contact_id}
                contact={c}
                onClick={() => navigate(`/contacts/${c.contact_id}`)}
                style={{ animationDelay: `${i * 25}ms` }}
              />
            ))}
          </div>
        ) : (
          // Master-detail (rail) view
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
            <aside className="space-y-1 lg:max-h-[calc(100vh-260px)] lg:overflow-y-auto lg:pr-2">
              {contacts.map((c) => (
                <ContactRailRow
                  key={c.contact_id}
                  contact={c}
                  active={selectedId === c.contact_id}
                  onClick={() => onClickContact(c)}
                  showActions
                />
              ))}
            </aside>

            <section
              className={cn(
                "hidden lg:block",
                !selected && "flex items-center justify-center",
              )}
            >
              {selected ? (
                <SelectedPreview contactId={selected.contact_id} />
              ) : (
                <div className="rounded-2xl border border-dashed border-brand-graphite bg-brand-charcoal/30 p-12 text-center">
                  <BookUser className="w-10 h-10 text-brand-smoke mx-auto mb-3" />
                  <p className="text-sm text-brand-smoke">
                    Pick someone from the list to preview them here.
                  </p>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-xs text-brand-smoke">
              {total} total · page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-brand-charcoal px-3 py-1.5 text-xs text-brand-smoke hover:border-white/20 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-brand-charcoal px-3 py-1.5 text-xs text-brand-smoke hover:border-white/20 disabled:opacity-40"
              >
                Next <ChevronRightIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      <QuickAddModal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        defaultType={activeTab !== "all" && activeTab !== "subscriber" ? activeTab : undefined}
        onCreated={(id) => navigate(`/contacts/${id}`)}
      />
      <WalkinQRModal
        open={walkinQROpen}
        onClose={() => setWalkinQROpen(false)}
      />
      {/* Partner add — creates the directory contact (quick-create inside
          the picker) AND the procurement-style partner record in one flow */}
      <PartnerFormModal
        open={partnerModalOpen}
        onClose={() => setPartnerModalOpen(false)}
        onSaved={(p) => {
          setPartnerModalOpen(false);
          navigate(`/contacts/${p.contact_id}`);
        }}
      />
      <InviteSupplierModal
        open={supplierModalOpen}
        onClose={() => setSupplierModalOpen(false)}
      />
    </>
  );
}

/** Minimal inline preview — full profile is one click away. */
function SelectedPreview({ contactId }: { contactId: string }) {
  const navigate = useNavigate();
  const { data: c } = useQuery({
    queryKey: ["contacts", contactId],
    queryFn: () =>
      import("@services/contacts/contacts").then((m) =>
        m.getContact(contactId),
      ),
  });
  if (!c) return <Skeleton className="h-96" />;
  return (
    <div className="rounded-2xl border border-brand-graphite bg-brand-charcoal/50 p-6">
      <div className="text-[0.65rem] tracking-widest uppercase text-brand-smoke mb-1">
        Preview
      </div>
      <h2 className="font-display text-3xl text-brand-cream">
        {c.display_name}
      </h2>
      {c.company_name && (
        <p className="text-sm text-brand-smoke mt-1">{c.company_name}</p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-brand-smoke">Phone</span>
          <div className="text-brand-cream mt-0.5">{c.primary_phone}</div>
        </div>
        {c.email && (
          <div>
            <span className="text-brand-smoke">Email</span>
            <div className="text-brand-cream mt-0.5 truncate">{c.email}</div>
          </div>
        )}
      </div>
      {c.notes && (
        <p className="text-xs text-brand-cloud mt-4 italic line-clamp-3">
          "{c.notes}"
        </p>
      )}
      <Button
        variant="gold"
        className="mt-5"
        onClick={() => navigate(`/contacts/${c.contact_id}`)}
      >
        Open full profile →
      </Button>
    </div>
  );
}
