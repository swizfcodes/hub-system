/**
 * ForwardModal — pick one or more conversations and forward a message,
 * WhatsApp-style.
 */
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Forward, Check } from "lucide-react";
import { Modal } from "@components/ui/Modal";
import { Button } from "@components/ui/Button";
import { listChannels, forwardMessage } from "@services/messaging";
import {
  getChannelDisplayName,
  getAvatarColour,
  getInitials,
} from "@lib/constants/messagingConstants";
import { showToast } from "@hooks/useToast";
import { cn } from "@lib/cn";
import type { Message } from "@typedefs/messaging";

interface Props {
  message: Message | null;
  onClose: () => void;
  userId?: string;
}

export function ForwardModal({ message, onClose, userId }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: ["channels", "forward-targets"],
    queryFn: () => listChannels({ limit: 50 }),
    enabled: !!message,
  });

  const channels = (data?.data ?? []).filter(
    (ch) => ch.channel_id !== message?.channel_id,
  );

  const mutation = useMutation({
    mutationFn: () => forwardMessage(message!.message_id, [...selected]),
    onSuccess: (res) => {
      showToast.success(
        `Forwarded to ${res.forwarded_count} conversation${res.forwarded_count === 1 ? "" : "s"}`,
      );
      setSelected(new Set());
      onClose();
    },
    onError: () => showToast.error("Could not forward message"),
  });

  function toggle(channelId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) next.delete(channelId);
      else next.add(channelId);
      return next;
    });
  }

  return (
    <Modal
      open={!!message}
      onClose={onClose}
      title="Forward message"
      size="sm"
      surface="light"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={selected.size === 0}
          >
            <Forward className="h-4 w-4" />
            Forward{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
        </div>
      }
    >
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {channels.length === 0 ? (
          <p className="py-6 text-center text-xs text-brand-smoke">
            No other conversations
          </p>
        ) : (
          channels.map((ch) => {
            const name = getChannelDisplayName(ch, userId);
            const isSelected = selected.has(ch.channel_id);
            return (
              <button
                key={ch.channel_id}
                type="button"
                onClick={() => toggle(ch.channel_id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                  isSelected ? "bg-brand-accent/15" : "hover:bg-black/5",
                )}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{ backgroundColor: getAvatarColour(name) }}
                >
                  {getInitials(name)}
                </div>
                <span className="flex-1 truncate text-sm text-brand-black">
                  {name}
                </span>
                {isSelected && (
                  <Check className="h-4 w-4 shrink-0 text-brand-accent" />
                )}
              </button>
            );
          })
        )}
      </div>
    </Modal>
  );
}
