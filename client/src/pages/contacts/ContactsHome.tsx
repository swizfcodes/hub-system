import { useMemo, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, UserPlus, BookUser } from 'lucide-react';
import { Topbar } from '@components/shell/Topbar';
import { PageHeader } from '@components/ui/PageHeader';
import { Button } from '@components/ui/Button';
import { Skeleton } from '@components/ui/Skeleton';
import { EmptyState } from '@components/ui/EmptyState';
import { TypeTabBar } from '@components/contacts/shell/TypeTabBar';
import { ViewSwitcher, type DirectoryView } from '@components/contacts/shell/ViewSwitcher';
import { DirectoryFilters, type DirectoryFilterValues } from '@components/contacts/shell/DirectoryFilters';
import { ContactRailRow } from '@components/contacts/shell/ContactRailRow';
import { ContactCard } from '@components/contacts/shell/ContactCard';
import { QuickAddModal } from '@components/contacts/modals/QuickAddModal';
import { listContacts } from '@services/contacts/contacts';
import { CONTACT_TYPE_META, CONTACT_TYPE_ORDER } from '@lib/constants/contactTypes';
import { useIsDesktop } from '@hooks/useMediaQuery';
import type { Contact, ContactType } from '@typedefs/contacts';
import { cn } from '@lib/cn';

type TabKey = 'all' | ContactType;

export default function ContactsHome() {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<DirectoryView>(() => (localStorage.getItem('orika_contacts_view') as DirectoryView) || 'rail');
  const [activeTab, setActiveTab] = useState<TabKey>((searchParams.get('tab') as TabKey) || 'all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [filters, setFilters] = useState<DirectoryFilterValues>({ search: '', priority: '', source: '', showAllBusinesses: false });

  useEffect(() => { localStorage.setItem('orika_contacts_view', view); }, [view]);
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (activeTab !== 'all') params.set('tab', activeTab); else params.delete('tab');
    setSearchParams(params, { replace: true });
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load: when "All" tab, no server type filter (we show every type).
  const { data, isLoading } = useQuery({
    queryKey: ['contacts', { search: filters.search }],
    queryFn: () => listContacts({ search: filters.search, limit: 200 }),
  });

  // Client-side filter for type, priority, source.
  const filtered = useMemo(() => {
    const all = data?.data ?? [];
    return all.filter((c) => {
      if (activeTab !== 'all' && !c.contact_type?.includes(activeTab)) return false;
      if (filters.priority && c.priority_level !== filters.priority) return false;
      if (filters.source && c.source !== filters.source) return false;
      return true;
    });
  }, [data, activeTab, filters.priority, filters.source]);

  // Counts per tab.
  const counts = useMemo(() => {
    const all = data?.data ?? [];
    const c: Partial<Record<TabKey, number>> = { all: all.length };
    for (const type of CONTACT_TYPE_ORDER) c[type] = all.filter((x) => x.contact_type?.includes(type)).length;
    return c;
  }, [data]);

  const selected = filtered.find((c) => c.contact_id === selectedId);

  // When the user clicks a row on desktop with the rail view, we use the side panel.
  // On mobile or in cards view, we navigate to /contacts/:id.
  const onClickContact = (c: Contact) => {
    if (isDesktop && view === 'rail') setSelectedId(c.contact_id);
    else navigate(`/contacts/${c.contact_id}`);
  };

  return (
    <>
      <Topbar title="Directory" subtitle="Clients · Suppliers · Employees · Partners" />
      <div className="px-4 sm:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
        <PageHeader
          title="Directory"
          subtitle="Every person and organisation in your world — clients, suppliers, employees and retail partners — in one place. Tap a row to see the full profile."
          crumbs={[{ label: 'Hub', to: '/' }, { label: 'Directory' }]}
          actions={
            <>
              <ViewSwitcher value={view} onChange={setView} />
              <Button variant="secondary" size="md" leftIcon={<UserPlus className="w-4 h-4" />} onClick={() => navigate('/contacts/new')}>
                Full form
              </Button>
              <Button variant="gold" size="md" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setQuickAddOpen(true)}>
                Quick add
              </Button>
            </>
          }
        />

        <div className="mb-6 space-y-4">
          <TypeTabBar
            active={activeTab}
            onChange={(t) => { setActiveTab(t); setSelectedId(null); }}
            counts={counts}
          />
          <DirectoryFilters value={filters} onChange={setFilters} />
        </div>

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[0,1,2,3,4,5].map((i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<BookUser className="w-7 h-7" />}
            title={filters.search ? 'No matches' : activeTab === 'all' ? 'Your directory is empty' : `No ${CONTACT_TYPE_META[activeTab as ContactType].shortLabel.toLowerCase()} yet`}
            description={filters.search ? 'Try a different search term or clear the filters.' : 'Capture your first contact in under 10 seconds with Quick Add.'}
            action={!filters.search && (
              <Button variant="gold" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setQuickAddOpen(true)}>
                Quick add
              </Button>
            )}
          />
        ) : view === 'cards' ? (
          // Cards view
          <div className="grid gap-4 sm:gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 stagger">
            {filtered.map((c, i) => (
              <ContactCard key={c.contact_id} contact={c} onClick={() => navigate(`/contacts/${c.contact_id}`)} style={{ animationDelay: `${i * 25}ms` }} />
            ))}
          </div>
        ) : (
          // Master-detail (rail) view
          <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
            <aside className="space-y-1 lg:max-h-[calc(100vh-260px)] lg:overflow-y-auto lg:pr-2">
              {filtered.map((c) => (
                <ContactRailRow
                  key={c.contact_id}
                  contact={c}
                  active={selectedId === c.contact_id}
                  onClick={() => onClickContact(c)}
                  showActions
                />
              ))}
            </aside>

            <section className={cn('hidden lg:block', !selected && 'flex items-center justify-center')}>
              {selected ? (
                <SelectedPreview contactId={selected.contact_id} />
              ) : (
                <div className="rounded-2xl border border-dashed border-orika-graphite bg-orika-charcoal/30 p-12 text-center">
                  <BookUser className="w-10 h-10 text-orika-smoke mx-auto mb-3" />
                  <p className="text-sm text-orika-smoke">Pick someone from the list to preview them here.</p>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <QuickAddModal
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        defaultType={activeTab !== 'all' ? activeTab : undefined}
        onCreated={(id) => navigate(`/contacts/${id}`)}
      />
    </>
  );
}

/** Minimal inline preview — full profile is one click away. */
function SelectedPreview({ contactId }: { contactId: string }) {
  const navigate = useNavigate();
  const { data: c } = useQuery({ queryKey: ['contacts', contactId], queryFn: () => import('@services/contacts/contacts').then((m) => m.getContact(contactId)) });
  if (!c) return <Skeleton className="h-96" />;
  return (
    <div className="rounded-2xl border border-orika-graphite bg-orika-charcoal/50 p-6">
      <div className="text-[0.65rem] tracking-widest uppercase text-orika-smoke mb-1">Preview</div>
      <h2 className="font-display text-3xl text-orika-cream">{c.display_name}</h2>
      {c.company_name && <p className="text-sm text-orika-smoke mt-1">{c.company_name}</p>}
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div><span className="text-orika-smoke">Phone</span><div className="text-orika-cream mt-0.5">{c.primary_phone}</div></div>
        {c.email && <div><span className="text-orika-smoke">Email</span><div className="text-orika-cream mt-0.5 truncate">{c.email}</div></div>}
      </div>
      {c.notes && <p className="text-xs text-orika-cloud mt-4 italic line-clamp-3">"{c.notes}"</p>}
      <Button variant="gold" className="mt-5" onClick={() => navigate(`/contacts/${c.contact_id}`)}>Open full profile →</Button>
    </div>
  );
}
