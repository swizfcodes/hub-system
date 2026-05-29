/**
 * MessagingPage — SmartComm unified inbox
 * Three-column layout (on wide screens):
 *   Left:   ChannelList (platform tabs, search, channel rows)
 *   Center: MessageThread (active conversation + composer)
 *   Right:  CustomerSidebar (customer 360: contact, orders, invoices, deliveries)
 *
 * Route: /messaging
 */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Users, MessageSquare } from 'lucide-react';
import { Modal } from '@components/ui/Modal';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select } from '@components/ui/Select';
import { ChannelList } from '@components/messaging/ChannelList';
import { MessageThread } from '@components/messaging/MessageThread';
import { CustomerSidebar } from '@components/messaging/CustomerSidebar';
import { getChannel, createChannel } from '@services/messaging';
import { useActiveBusiness } from '@hooks/useActiveBusiness';
import { cn } from '@lib/cn';
import type { Channel } from '@typedefs/messaging';
import { Topbar } from '@/components/shell/Topbar';
export default function MessagingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { active: business } = useActiveBusiness();
  const qc = useQueryClient();

  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState<'list' | 'thread' | 'sidebar'>('list');

  // Support deep-link via ?channel=UUID
  const channelParam = searchParams.get('channel');
  const { data: linkedChannel } = useQuery({
    queryKey: ['channel', channelParam],
    queryFn:  () => getChannel(channelParam!),
    enabled:  !!channelParam && !activeChannel,
  });

  useEffect(() => {
    if (linkedChannel && !activeChannel) {
      setActiveChannel(linkedChannel);
      setMobilePanelOpen('thread');
    }
  }, [linkedChannel]);

  function handleSelectChannel(channel: Channel) {
    setActiveChannel(channel);
    setSearchParams({ channel: channel.channel_id });
    setMobilePanelOpen('thread');
  }

  const isCustomerThread = activeChannel?.channel_type === 'customer_thread';

  return (
    <>
    <Topbar title="Messaging" subtitle="Inbox · Conversations" />
    <div className="flex h-screen overflow-hidden">
      {/* Column 1: Channel list */}
      <div className={cn(
        'w-72 shrink-0 transition-all duration-200',
        // Mobile: show/hide based on panel state
        'hidden lg:flex lg:flex-col',
        mobilePanelOpen === 'list' && 'flex flex-col lg:flex',
      )}>
        <ChannelList
          activeChannelId={activeChannel?.channel_id ?? null}
          onSelect={handleSelectChannel}
          onNewChannel={() => setShowNewChannel(true)}
        />
      </div>

      {/* Column 2: Message thread */}
      <div className={cn(
        'flex-1 flex flex-col min-w-0',
        !activeChannel && 'hidden lg:flex',
        mobilePanelOpen === 'thread' ? 'flex' : 'hidden lg:flex',
      )}>
        {activeChannel ? (
          <MessageThread
            channel={activeChannel}
            onResolve={(ch) => {
              setActiveChannel(ch as Channel);
              qc.invalidateQueries({ queryKey: ['channels'] });
            }}
          />
        ) : (
          <EmptyState onNew={() => setShowNewChannel(true)} />
        )}
      </div>

      {/* Column 3: Customer 360 sidebar (only for customer threads) */}
      {activeChannel && isCustomerThread && (
        <div className={cn(
          'w-64 shrink-0',
          'hidden xl:block',
          mobilePanelOpen === 'sidebar' && 'block xl:block',
        )}>
          <CustomerSidebar channel={activeChannel} />
        </div>
      )}

      {/* New channel modal */}
      <NewChannelModal
        open={showNewChannel}
        onClose={() => setShowNewChannel(false)}
        business={business ?? ''}
        onCreated={(ch) => {
          qc.invalidateQueries({ queryKey: ['channels'] });
          handleSelectChannel(ch);
          setShowNewChannel(false);
        }}
      />
    </div>
    </>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-orika-black gap-4">
      <div className="h-16 w-16 rounded-full bg-orika-charcoal flex items-center justify-center">
        <MessageSquare className="h-8 w-8 text-orika-smoke/40" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-orika-cream">SmartComm</p>
        <p className="text-xs text-orika-smoke mt-1">
          Select a conversation or start a new one
        </p>
      </div>
      <Button size="sm" variant="secondary" onClick={onNew}>
        <Plus className="h-4 w-4" />
        New Conversation
      </Button>
    </div>
  );
}

// ── NewChannelModal ───────────────────────────────────────────────────────────

function NewChannelModal({ open, onClose, business, onCreated }: {
  open: boolean; onClose: () => void; business: string;
  onCreated: (ch: Channel) => void;
}) {
  const [channelType, setChannelType] = useState<'group' | 'direct'>('group');
  const [name, setName] = useState('');
  const [memberIds, setMemberIds] = useState('');

  const mutation = useMutation({
    mutationFn: () => createChannel({
      channel_type: channelType,
      name:         channelType === 'group' ? name : undefined,
      business,
      member_user_ids: memberIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    }),
    onSuccess: (ch) => {
      onCreated(ch);
      setName('');
      setMemberIds('');
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Internal Conversation"
      size="sm"
      surface="light"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={channelType === 'group' && !name.trim()}
          >
            <Users className="h-4 w-4" />
            Create
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Select
          label="Type"
          surface="light"
          value={channelType}
          onChange={(e) => setChannelType(e.target.value as 'group' | 'direct')}
          options={[
            { value: 'group',  label: 'Group — multiple team members' },
            { value: 'direct', label: 'Direct — one-on-one message' },
          ]}
        />
        {channelType === 'group' && (
          <Input
            label="Channel Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sales Team, Bejewelled Support"
            surface="light"
          />
        )}
        <Input
          label={channelType === 'direct' ? 'User ID to message *' : 'Add members (User IDs, comma-separated)'}
          value={memberIds}
          onChange={(e) => setMemberIds(e.target.value)}
          placeholder="Paste user UUID(s)"
          surface="light"
          hint="Copy from the staff profile page"
        />
      </div>
    </Modal>
  );
}
