import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tabs, type Tab } from '@components/ui/Tabs';
import { OverviewTab } from './tabs/OverviewTab';
import { ActivityTab } from './tabs/ActivityTab';
import { TasksTab } from './tabs/TasksTab';
import { CalendarTab } from './tabs/CalendarTab';
import { NotesTab } from './tabs/NotesTab';
import { PropertiesTab } from './tabs/PropertiesTab';
import { AuditTab } from './tabs/AuditTab';
import { ConciergeTab } from './tabs/ConciergeTab';
import { PlaceholderTab } from './tabs/PlaceholderTab';
import { listDeals } from '@services/crm/deals';
import { listInvoices } from '@services/invoicing/invoices';
import { Card } from '@components/ui/Card';
import { Skeleton } from '@components/ui/Skeleton';
import { Badge } from '@components/ui/Badge';
import { StagePill } from '@components/crm/shared/StagePill';
import { ProbabilityBar } from '@components/crm/shared/ProbabilityBar';
import { fmtMoney, fmtRelative } from '@lib/format';
import { Link } from 'react-router-dom';
import { ArrowUpRight, TrendingUp, Plus, Receipt } from 'lucide-react';
import { fmtDate } from '@lib/format';
import { EmptyState } from '@components/ui/EmptyState';
import { Button } from '@components/ui/Button';
import { NewDealModal } from '@components/crm/modals/NewDealModal';
import type { Contact } from '@typedefs/contacts';

interface Props {
  contact: Contact;
  /** Extra tabs injected when contact is also staff. */
  extraTabs?: Tab[];
  extraRenderers?: Record<string, () => React.ReactNode>;
}

const BASE_TABS: Tab[] = [
  { key: 'overview',  label: 'Overview' },
  { key: 'activity',  label: 'Activity' },
  { key: 'tasks',     label: 'Tasks' },
  { key: 'calendar',  label: 'Calendar' },
  { key: 'deals',     label: 'Deals' },
  { key: 'invoices',  label: 'Invoices' },
  { key: 'concierge', label: 'Concierge' },
  { key: 'notes',     label: 'Notes' },
  { key: 'documents', label: 'Documents' },
  { key: 'properties',label: 'Properties' },
  { key: 'audit',     label: 'Audit' },
];

export function ContactDetailTabs({ contact, extraTabs = [], extraRenderers = {} }: Props) {
  const [active, setActive] = useState('overview');
  const tabs = [...BASE_TABS.slice(0, 4), ...extraTabs, ...BASE_TABS.slice(4)];

  return (
    <div className="space-y-6">
      <Tabs tabs={tabs} active={active} onChange={setActive} />

      <div className="animate-slide-up">
        {active === 'overview'   && <OverviewTab contact={contact} onJumpTab={setActive} />}
        {active === 'activity'   && <ActivityTab contactId={contact.contact_id} />}
        {active === 'tasks'      && <TasksTab    contactId={contact.contact_id} contactName={contact.display_name} />}
        {active === 'calendar'   && <CalendarTab contactId={contact.contact_id} contactName={contact.display_name} />}
        {active === 'deals'      && <DealsTab contactId={contact.contact_id} contactName={contact.display_name} />}
        {active === 'invoices'   && <ContactInvoicesTab contactId={contact.contact_id} contactName={contact.display_name} />}
        {active === 'concierge'  && <ConciergeTab contactId={contact.contact_id} contactName={contact.display_name} />}
        {active === 'notes'      && <NotesTab contact={contact} />}
        {active === 'documents'  && <PlaceholderTab title="Documents" description={`Files linked to ${contact.display_name} (contracts, IDs, photos) will appear here when the Documents module is built.`} linkTo="/documents" linkLabel="Open Documents" />}
        {active === 'properties' && <PropertiesTab contact={contact} />}
        {active === 'audit'      && <AuditTab contactId={contact.contact_id} />}
        {extraRenderers[active]?.()}
      </div>
    </div>
  );
}

function DealsTab({ contactId, contactName }: { contactId: string; contactName: string }) {
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['crm', 'deals', { contactId }],
    queryFn: () => listDeals({ contact_id: contactId, limit: 50 }),
  });

  const deals = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.65rem] tracking-widest uppercase text-orika-gold inline-flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5" /> Deals · {deals.length}
        </h3>
        <Button variant="gold" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setCreating(true)}>New deal</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0,1].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : deals.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="w-6 h-6" />}
          title="No deals yet"
          description={`Create the first deal with ${contactName}.`}
          action={<Button variant="gold" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />} onClick={() => setCreating(true)}>New deal</Button>}
        />
      ) : (
        <div className="space-y-2">
          {deals.map((d) => (
            <Link key={d.deal_id} to={`/crm/${d.deal_id}`}>
              <Card className="p-4 hover:border-orika-gold/40 transition-all cursor-pointer">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-orika-cream truncate">{d.title}</span>
                      <StagePill stageKey={d.stage} />
                      {d.won_at && <Badge tone="sage" size="xs">Won</Badge>}
                      {d.lost_at && <Badge tone="danger" size="xs">Lost</Badge>}
                    </div>
                    <div className="text-[0.65rem] text-orika-smoke mt-1">Updated {fmtRelative(d.updated_at)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-sm text-orika-gold">{fmtMoney(d.expected_value, 'NGN')}</div>
                    <div className="text-[0.6rem] text-orika-smoke">{d.probability}%</div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-orika-smoke shrink-0 mt-0.5" />
                </div>
                <ProbabilityBar probability={d.probability ?? 50} className="mt-2" />
              </Card>
            </Link>
          ))}
        </div>
      )}

      <NewDealModal open={creating} onClose={() => setCreating(false)} defaultContactId={contactId} />
    </div>
  );
}

function ContactInvoicesTab({ contactId, contactName }: { contactId: string; contactName: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['invoicing', { contactId }],
    queryFn: () => listInvoices({ contactId, limit: 50 }),
  });
  const invoices = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[0.65rem] tracking-widest uppercase text-orika-gold inline-flex items-center gap-2">
          <Receipt className="w-3.5 h-3.5" /> Invoices · {invoices.length}
        </h3>
        <Link to={`/invoicing?contact=${contactId}`}>
          <Button variant="secondary" size="sm" leftIcon={<ArrowUpRight className="w-3.5 h-3.5" />}>Open Invoicing</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : invoices.length === 0 ? (
        <EmptyState icon={<Receipt className="w-6 h-6" />} title="No invoices yet" description={`No invoices have been issued to ${contactName}.`} />
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <Link key={inv.invoice_id} to={`/invoicing/${inv.invoice_id}`}>
              <Card className="p-4 hover:border-orika-gold/40 transition-all cursor-pointer">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-orika-smoke">{inv.invoice_number}</span>
                      <Badge tone={inv.status === 'paid' ? 'sage' : inv.status === 'overdue' ? 'danger' : 'neutral'} size="xs" dot>{inv.status}</Badge>
                    </div>
                    <div className="text-[0.65rem] text-orika-smoke mt-1">Due {fmtDate(inv.due_date)}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-sm text-orika-gold">{fmtMoney(inv.total_amount, 'NGN')}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-orika-smoke" />
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
