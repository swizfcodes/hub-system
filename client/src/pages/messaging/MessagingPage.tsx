/**
 * MessagingPage — SmartComm unified inbox
 * Three-column layout (on wide screens):
 *   Left:   ChannelList (platform tabs, search, channel rows)
 *   Center: MessageThread (active conversation + composer)
 *   Right:  CustomerSidebar (customer 360: contact, orders, invoices, deliveries)
 *
 * Route: /messaging
 */
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Users, MessageSquare } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { Input } from "@components/ui/Input";
import { Select } from "@components/ui/Select";
import { ChannelList } from "@components/messaging/ChannelList";
import { MessageThread } from "@components/messaging/MessageThread";
import { CustomerSidebar } from "@components/messaging/CustomerSidebar";
import { getChannel, createChannel } from "@services/messaging";
import { StaffSearchCombobox } from "@components/messaging/StaffSearchCombobox";
import type { StaffOption } from "@components/messaging/StaffSearchCombobox";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { cn } from "@lib/cn";
import type { Channel } from "@typedefs/messaging";
import { Topbar } from "@/components/shell/Topbar";
export default function MessagingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { active: business } = useActiveBusiness();
  const qc = useQueryClient();

  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState<
    "list" | "thread" | "sidebar"
  >("list");

  // Support deep-link via ?channel=UUID
  const channelParam = searchParams.get("channel");
  const { data: linkedChannel } = useQuery({
    queryKey: ["channel", channelParam],
    queryFn: () => getChannel(channelParam!),
    enabled: !!channelParam && !activeChannel,
  });

  useEffect(() => {
    if (linkedChannel && !activeChannel) {
      setActiveChannel(linkedChannel);
      setMobilePanelOpen("thread");
    }
  }, [linkedChannel]);

  function handleSelectChannel(channel: Channel) {
    setActiveChannel(channel);
    setSearchParams({ channel: channel.channel_id });
    setMobilePanelOpen("thread");
  }

  const isCustomerThread = activeChannel?.channel_type === "customer_thread";

  return (
    <>
      <Topbar title="Messaging" subtitle="Inbox · Conversations" />
      <div className="flex h-screen overflow-hidden">
        {/* Column 1: Channel list */}
        <div
          className={cn(
            "w-72 shrink-0 transition-all duration-200",
            // Mobile: show/hide based on panel state
            "hidden lg:flex lg:flex-col",
            mobilePanelOpen === "list" && "flex flex-col lg:flex",
          )}
        >
          <ChannelList
            activeChannelId={activeChannel?.channel_id ?? null}
            onSelect={handleSelectChannel}
            onNewChannel={() => setShowNewChannel(true)}
          />
        </div>

        {/* Column 2: Message thread */}
        <div
          className={cn(
            "flex-1 flex flex-col min-w-0",
            !activeChannel && "hidden lg:flex",
            mobilePanelOpen === "thread" ? "flex" : "hidden lg:flex",
          )}
        >
          {activeChannel ? (
            <MessageThread
              channel={activeChannel}
              onResolve={(ch) => {
                setActiveChannel(ch as Channel);
                qc.invalidateQueries({ queryKey: ["channels"] });
              }}
            />
          ) : (
            <EmptyState onNew={() => setShowNewChannel(true)} />
          )}
        </div>

        {/* Column 3: Customer 360 sidebar (only for customer threads) */}
        {activeChannel && isCustomerThread && (
          <div
            className={cn(
              "w-64 shrink-0",
              "hidden xl:block",
              mobilePanelOpen === "sidebar" && "block xl:block",
            )}
          >
            <CustomerSidebar channel={activeChannel} />
          </div>
        )}

        {/* New channel modal */}
        <NewChannelModal
          open={showNewChannel}
          onClose={() => setShowNewChannel(false)}
          business={business ?? ""}
          onCreated={(ch) => {
            qc.invalidateQueries({ queryKey: ["channels"] });
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

function NewChannelModal({
  open,
  onClose,
  business,
  onCreated,
  preselected,
}: {
  open: boolean;
  onClose: () => void;
  business: string;
  onCreated: (ch: Channel) => void;
  /** Pre-fill a staff member (e.g. when opening from a contact page) */
  preselected?: StaffOption;
}) {
  const [channelType, setChannelType] = useState<"group" | "direct">("direct");
  const [name, setName] = useState("");
  const [members, setMembers] = useState<StaffOption[]>(
    preselected ? [preselected] : [],
  );

  // When preselected changes (modal reopened from a different contact), sync it
  useState(() => {
    if (preselected) {
      setMembers([preselected]);
      setChannelType("direct");
    }
  });

  const validMembers = members.filter((m) => !!m.user_id);
  const canCreate =
    validMembers.length > 0 && (channelType === "direct" || name.trim());

  const mutation = useMutation({
    mutationFn: () =>
      createChannel({
        channel_type: channelType,
        name: channelType === "group" ? name : undefined,
        business,
        member_user_ids: validMembers.map((m) => m.user_id as string),
      }),
    onSuccess: (ch) => {
      onCreated(ch);
      setName("");
      setMembers([]);
      setChannelType("direct");
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
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!canCreate}
          >
            <Users className="h-4 w-4" />
            {channelType === "direct" ? "Message" : "Create group"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Select
          label="Type"
          surface="light"
          value={channelType}
          onChange={(e) => {
            setChannelType(e.target.value as "group" | "direct");
            if (e.target.value === "direct" && members.length > 1)
              setMembers([members[0]]);
          }}
          options={[
            {
              value: "direct",
              label: "Direct -- one-on-one with a team member",
            },
            { value: "group", label: "Group -- multiple team members" },
          ]}
        />

        {channelType === "group" && (
          <Input
            label="Channel name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sales Team, Jewellery Support"
            surface="light"
          />
        )}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-orika-black/70">
            {channelType === "direct" ? "Message" : "Add members"}
            <span className="text-red-500 ml-0.5">*</span>
          </label>
          <StaffSearchCombobox
            selected={members}
            onChange={setMembers}
            max={channelType === "direct" ? 1 : undefined}
            placeholder={
              channelType === "direct"
                ? "Search team members by name..."
                : "Add team members..."
            }
            surface="light"
          />
          <p className="mt-1.5 text-[11px] text-orika-smoke/60">
            Only active staff with a login account can receive internal
            messages.
          </p>
        </div>
      </div>
    </Modal>
  );
}
