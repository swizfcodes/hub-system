/**
 * MessageBubble — a single WhatsApp-style message:
 *   - own messages right-aligned in gold, others left in charcoal
 *   - quoted reply preview, forwarded label, edited label
 *   - "This message was deleted" placeholder
 *   - attachments (image / voice note / document)
 *   - emoji reaction chips with quick-react hover bar
 *   - clock time + ✓ / ✓✓ ticks (blue when read by everyone)
 */
import {
  Reply,
  Smile,
  Check,
  CheckCheck,
  Star,
  Forward,
  Pencil,
  Trash2,
  Ban,
} from "lucide-react";
import { DropdownMenu } from "@components/ui/DropdownMenu";
import { AttachmentView } from "./AttachmentView";
import {
  QUICK_REACTIONS,
  fmtClockTime,
  getAvatarColour,
  getInitials,
} from "@lib/constants/messagingConstants";
import { cn } from "@lib/cn";
import type { Message, MessageReaction } from "@typedefs/messaging";

export interface BubbleActions {
  onReply: (msg: Message) => void;
  onReact: (msg: Message, emoji: string) => void;
  onEdit: (msg: Message) => void;
  onDelete: (msg: Message) => void;
  onForward: (msg: Message) => void;
  onStar: (msg: Message) => void;
}

interface Props {
  message: Message;
  isOwn: boolean;
  isGroup: boolean;
  showSenderName: boolean;
  showReactionBar: boolean;
  onToggleReactionBar: () => void;
  actions: BubbleActions;
}

export function MessageBubble({
  message,
  isOwn,
  isGroup,
  showSenderName,
  showReactionBar,
  onToggleReactionBar,
  actions,
}: Props) {
  if (message.sender_kind === "system") {
    return (
      <div className="flex justify-center py-1">
        <p className="rounded-full bg-brand-graphite/40 px-3 py-1 text-[10px] italic text-brand-smoke/60">
          {message.content}
        </p>
      </div>
    );
  }

  const deleted = !!message.is_deleted;
  const reactions = groupReactions(message.reactions ?? []);

  return (
    <div className={cn("group flex gap-2", isOwn ? "flex-row-reverse" : "")}>
      {/* Avatar (left side only, groups) */}
      {!isOwn && isGroup && (
        <div className="w-7 shrink-0">
          {showSenderName && (
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              style={{ backgroundColor: getAvatarColour(message.sender_name) }}
            >
              {getInitials(message.sender_name)}
            </div>
          )}
        </div>
      )}

      <div
        className={cn(
          "flex max-w-[75%] flex-col",
          isOwn ? "items-end" : "items-start",
        )}
      >
        {showSenderName && !isOwn && isGroup && (
          <p
            className="mb-0.5 px-1 text-[10px] font-medium"
            style={{ color: getAvatarColour(message.sender_name) }}
          >
            {message.sender_name}
          </p>
        )}

        {/* Bubble */}
        <div className="relative">
          <div
            className={cn(
              "rounded-2xl px-3 py-2 text-sm",
              isOwn
                ? "rounded-tr-sm bg-brand-accent text-brand-black"
                : "rounded-tl-sm border border-white/5 bg-brand-charcoal text-brand-cream",
            )}
          >
            {/* Forwarded label */}
            {message.is_forwarded && !deleted && (
              <p
                className={cn(
                  "mb-1 flex items-center gap-1 text-[10px] italic",
                  isOwn ? "text-brand-black/50" : "text-brand-smoke/60",
                )}
              >
                <Forward className="h-2.5 w-2.5" />
                Forwarded
              </p>
            )}

            {/* Quoted reply */}
            {message.reply_to && !deleted && (
              <div
                className={cn(
                  "mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs",
                  isOwn
                    ? "border-brand-black/30 bg-brand-black/10"
                    : "border-brand-accent/50 bg-white/5",
                )}
              >
                <p
                  className={cn(
                    "text-[10px] font-semibold",
                    isOwn ? "text-brand-black/70" : "text-brand-accent",
                  )}
                >
                  {message.reply_to.sender_name}
                </p>
                <p
                  className={cn(
                    "truncate",
                    isOwn ? "text-brand-black/60" : "text-brand-smoke",
                  )}
                >
                  {message.reply_to.is_deleted
                    ? "This message was deleted"
                    : (message.reply_to.content ??
                      labelForType(message.reply_to.message_type))}
                </p>
              </div>
            )}

            {/* Body */}
            {deleted ? (
              <p
                className={cn(
                  "flex items-center gap-1.5 text-xs italic",
                  isOwn ? "text-brand-black/50" : "text-brand-smoke/60",
                )}
              >
                <Ban className="h-3 w-3" />
                This message was deleted
              </p>
            ) : (
              <>
                {message.content && (
                  <p className="whitespace-pre-wrap break-words leading-relaxed">
                    {message.content}
                  </p>
                )}
                {message.attachments?.length > 0 && (
                  <div className="mt-1.5 space-y-1.5">
                    {message.attachments.map((att) => (
                      <AttachmentView
                        key={att.attachment_id}
                        attachment={att}
                        messageType={message.message_type}
                        isOwn={isOwn}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Hover actions */}
          {!deleted && (
            <div
              className={cn(
                "absolute top-0 hidden items-center gap-1 group-hover:flex",
                isOwn ? "right-full mr-2" : "left-full ml-2",
              )}
            >
              <HoverAction title="Reply" onClick={() => actions.onReply(message)}>
                <Reply className="h-3 w-3" />
              </HoverAction>
              <HoverAction title="React" onClick={onToggleReactionBar}>
                <Smile className="h-3 w-3" />
              </HoverAction>
              <DropdownMenu
                align={isOwn ? "right" : "left"}
                items={[
                  {
                    label: message.is_starred ? "Unstar" : "Star",
                    icon: <Star className="h-3.5 w-3.5" />,
                    onClick: () => actions.onStar(message),
                  },
                  {
                    label: "Forward",
                    icon: <Forward className="h-3.5 w-3.5" />,
                    onClick: () => actions.onForward(message),
                  },
                  ...(isOwn && message.message_type === "text"
                    ? [
                        {
                          label: "Edit",
                          icon: <Pencil className="h-3.5 w-3.5" />,
                          onClick: () => actions.onEdit(message),
                        },
                      ]
                    : []),
                  ...(isOwn
                    ? [
                        {
                          label: "Delete",
                          icon: <Trash2 className="h-3.5 w-3.5" />,
                          destructive: true,
                          onClick: () => actions.onDelete(message),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          )}

          {/* Quick reaction bar */}
          {showReactionBar && (
            <div
              className={cn(
                "absolute -top-10 z-10 flex items-center gap-1 rounded-2xl border border-white/10 bg-brand-charcoal px-2 py-1.5 shadow-xl",
                isOwn ? "right-0" : "left-0",
              )}
            >
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => actions.onReact(message, emoji)}
                  className="text-base transition-transform hover:scale-125"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reaction chips */}
        {reactions.length > 0 && (
          <div
            className={cn(
              "z-[1] -mt-1.5 flex flex-wrap gap-1 px-1",
              isOwn ? "justify-end" : "justify-start",
            )}
          >
            {reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                title={r.names.join(", ")}
                onClick={() => actions.onReact(message, r.emoji)}
                className="flex items-center gap-0.5 rounded-full border border-white/10 bg-brand-charcoal px-1.5 py-px text-[11px] shadow"
              >
                {r.emoji}
                {r.count > 1 && (
                  <span className="text-[9px] text-brand-smoke">{r.count}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Time + edited + ticks */}
        <p className="mt-0.5 flex items-center gap-1 px-1 text-[9px] text-brand-smoke/40">
          {message.edited_at && !deleted && <span>edited ·</span>}
          {fmtClockTime(message.created_at)}
          {isOwn && !deleted && <Ticks message={message} />}
        </p>
      </div>
    </div>
  );
}

// ── Ticks: ✓ sent → ✓✓ grey partially read → ✓✓ blue read by all ───────────

function Ticks({ message }: { message: Message }) {
  const read = message.read_count ?? 0;
  const recipients = message.recipient_count ?? 0;
  if (read > 0 && recipients > 0 && read >= recipients) {
    return <CheckCheck className="inline h-3 w-3 text-sky-400" />;
  }
  if (read > 0) {
    return <CheckCheck className="inline h-3 w-3" />;
  }
  return <Check className="inline h-3 w-3" />;
}

// ── helpers ────────────────────────────────────────────────────────────────

function HoverAction({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-white/10 bg-brand-charcoal p-1.5 text-brand-smoke transition-colors hover:text-brand-accent"
      title={title}
    >
      {children}
    </button>
  );
}

function groupReactions(reactions: MessageReaction[]) {
  const grouped = new Map<string, { count: number; names: string[] }>();
  for (const r of reactions) {
    const entry = grouped.get(r.emoji) ?? { count: 0, names: [] };
    entry.count += 1;
    if (r.user_name) entry.names.push(r.user_name);
    grouped.set(r.emoji, entry);
  }
  return [...grouped.entries()].map(([emoji, v]) => ({ emoji, ...v }));
}

function labelForType(type: string): string {
  if (type === "image") return "📷 Photo";
  if (type === "voice_note") return "🎤 Voice note";
  if (type === "document") return "📄 Document";
  return "Message";
}
