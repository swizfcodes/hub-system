/**
 * MessagingPage — in-house team chat (SmartComm), WhatsApp-style.
 * Two-pane layout on desktop, single-pane navigation on mobile:
 *   Left:   ChannelList (tabs: All / Unread / Groups / Emails, search)
 *   Center: MessageThread, or the EmailLogPanel when the Emails tab
 *           is active
 *
 * EXTERNAL-COMMS-DISABLED: the Customer-360 sidebar still renders for
 * old customer threads opened via deep link, but no new external
 * conversations arrive while the Meta bridge is off.
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
import { IosInstallHint } from "@components/messaging/IosInstallHint";
import { MessageThread } from "@components/messaging/MessageThread";
import { CustomerSidebar } from "@components/messaging/CustomerSidebar";
import { EmailLogPanel } from "@components/messaging/EmailLogPanel";
import { getChannel, createChannel } from "@services/messaging";
import { StaffSearchCombobox } from "@components/messaging/StaffSearchCombobox";
import type { StaffOption } from "@components/messaging/StaffSearchCombobox";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { useAuthStore } from "@stores/useAuthStore";
import type { InboxTabKey } from "@lib/constants/messagingConstants";
import { cn } from "@lib/cn";
import type { Channel } from "@typedefs/messaging";
import { Topbar } from "@/components/shell/Topbar";

export default function MessagingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { active: business } = useActiveBusiness();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [activeTab, setActiveTab] = useState<InboxTabKey>("all");
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState<"list" | "thread">(
    "list",
  );

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
  }, [linkedChannel]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelectChannel(channel: Channel) {
    setActiveChannel(channel);
    setSearchParams({ channel: channel.channel_id });
    setMobilePanelOpen("thread");
  }

  function handleTabChange(tab: InboxTabKey) {
    setActiveTab(tab);
    if (tab === "emails") {
      setActiveChannel(null);
      setSearchParams({});
      setMobilePanelOpen("thread");
    }
  }

  function handleBackToList() {
    setActiveChannel(null);
    setSearchParams({});
    setMobilePanelOpen("list");
  }

  const isCustomerThread = activeChannel?.channel_type === "customer_thread";
  const showEmails = activeTab === "emails";

  return (
    <>
      <Topbar title="Messaging" subtitle="Team chat · In-house" />
      <IosInstallHint />
      <div className="flex h-screen overflow-hidden">
        {/* Column 1: Channel list */}
        <div
          className={cn(
            "w-full shrink-0 transition-all duration-200 lg:w-80",
            "lg:flex lg:flex-col",
            mobilePanelOpen === "list" ? "flex flex-col" : "hidden",
          )}
        >
          <ChannelList
            activeChannelId={activeChannel?.channel_id ?? null}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onSelect={handleSelectChannel}
            onNewChannel={() => setShowNewChannel(true)}
            userId={user?.user_id}
          />
        </div>

        {/* Column 2: Thread / email log */}
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            mobilePanelOpen === "thread" ? "flex" : "hidden lg:flex",
          )}
        >
          {showEmails ? (
            <EmailLogPanel />
          ) : activeChannel ? (
            <MessageThread
              channel={activeChannel}
              userId={user?.user_id}
              onBack={handleBackToList}
              onResolve={(ch) => {
                setActiveChannel(ch as Channel);
                qc.invalidateQueries({ queryKey: ["channels"] });
              }}
            />
          ) : (
            <EmptyState onNew={() => setShowNewChannel(true)} />
          )}
        </div>

        {/* Column 3: Customer 360 sidebar — legacy customer threads only */}
        {activeChannel && isCustomerThread && (
          <div className="hidden w-64 shrink-0 xl:block">
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
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-brand-black">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-charcoal">
        <MessageSquare className="h-8 w-8 text-brand-smoke/40" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-brand-cream">SmartComm</p>
        <p className="mt-1 text-xs text-brand-smoke">
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
  const [description, setDescription] = useState("");
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
        description:
          channelType === "group" && description.trim()
            ? description.trim()
            : undefined,
        business,
        member_user_ids: validMembers.map((m) => m.user_id as string),
      }),
    onSuccess: (ch) => {
      onCreated(ch);
      setName("");
      setDescription("");
      setMembers([]);
      setChannelType("direct");
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Conversation"
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
          <>
            <Input
              label="Group name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sales Team, Jewellery Support"
              surface="light"
            />
            <Input
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this group about? (optional)"
              surface="light"
            />
          </>
        )}

        <div>
          <label className="mb-1.5 block text-xs font-medium text-brand-black/70">
            {channelType === "direct" ? "Message" : "Add members"}
            <span className="ml-0.5 text-red-500">*</span>
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
          <p className="mt-1.5 text-[11px] text-brand-smoke/60">
            Only active staff with a login account can receive internal
            messages.
          </p>
        </div>
      </div>
    </Modal>
  );
}
