/**
 * MessageThread — WhatsApp-style conversation view:
 *   header   presence (online / last seen), typing indicator, group info,
 *            in-chat search, pin / mute / archive menu
 *   body     day separators, grouped bubbles, deleted placeholders
 *   composer reply & edit modes, emoji picker, attachments (button,
 *            drag-drop, paste), voice notes, Enter-to-send
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Paperclip,
  Smile,
  Reply,
  Pencil,
  Mic,
  Square,
  Search,
  Pin,
  BellOff,
  Archive,
  Users,
  X,
  CheckCircle2,
} from "lucide-react";
import { Skeleton } from "@components/ui/Skeleton";
import { Badge } from "@components/ui/Badge";
import { DropdownMenu } from "@components/ui/DropdownMenu";
import {
  listMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markRead,
  resolveThread,
  toggleReaction,
  toggleStar,
  pinChannel,
  muteChannel,
  archiveChannel,
  searchMessages,
  uploadMessageAttachment,
} from "@services/messaging";
import {
  useChannelMessages,
  useTypingIndicator,
  usePresence,
} from "@hooks/useMessaging";
import {
  joinChannelRoom,
  leaveChannelRoom,
  emitTyping,
  isUserOnline,
} from "@lib/socket";
import {
  getChannelDisplayName,
  getDirectPeer,
  getAvatarColour,
  getInitials,
  fmtDayLabel,
  fmtClockTime,
  fmtLastSeen,
  isSameDay,
} from "@lib/constants/messagingConstants";
import { MessageBubble } from "./MessageBubble";
import { EmojiPicker } from "./EmojiPicker";
import { ForwardModal } from "./ForwardModal";
import { GroupInfoModal } from "./GroupInfoModal";
import { useActiveBusiness } from "@hooks/useActiveBusiness";
import { showToast } from "@hooks/useToast";
import { cn } from "@lib/cn";
import type { Channel, Message, MessageType } from "@typedefs/messaging";

interface MessageThreadProps {
  channel: Channel;
  onResolve: (ch: Channel) => void;
  userId?: string;
  /** Mobile back navigation to the conversation list. */
  onBack?: () => void;
}

export function MessageThread({
  channel,
  onResolve,
  userId,
  onBack,
}: MessageThreadProps) {
  const qc = useQueryClient();
  const { active: business } = useActiveBusiness();
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [reactionBarFor, setReactionBarFor] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const lastTypingEmit = useRef(0);

  const isGroup = channel.channel_type === "group";
  const isCustomerThread = channel.channel_type === "customer_thread";
  const peer = getDirectPeer(channel, userId);
  const typingUserIds = useTypingIndicator(channel.channel_id, userId);
  usePresence();
  useChannelMessages(channel.channel_id);

  // Join the channel's socket room for typing indicators.
  useEffect(() => {
    joinChannelRoom(channel.channel_id);
    return () => leaveChannelRoom(channel.channel_id);
  }, [channel.channel_id]);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["messages", channel.channel_id],
    queryFn: () => listMessages(channel.channel_id, { limit: 50 }),
    refetchOnWindowFocus: false,
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Mark read when channel is opened — errors are logged but never surfaced
  // to the user (a failed mark-read is not worth interrupting the conversation).
  useEffect(() => {
    if (messages.length > 0) {
      const lastId = messages[messages.length - 1]?.message_id;
      markRead(channel.channel_id, lastId)
        .then(() => qc.invalidateQueries({ queryKey: ["notifications"] }))
        .catch((err) =>
          console.warn("[MessageThread] mark-read failed:", err?.message),
        );
    }
    qc.invalidateQueries({ queryKey: ["channels"] });
  }, [channel.channel_id, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidateMessages = () =>
    qc.invalidateQueries({ queryKey: ["messages", channel.channel_id] });

  const sendMutation = useMutation({
    mutationFn: (input: {
      content?: string;
      message_type?: MessageType;
      attachments?: Array<{ document_id: string; display_name?: string }>;
    }) =>
      sendMessage(channel.channel_id, {
        ...input,
        reply_to_id: replyTo?.message_id,
      }),
    onSuccess: () => {
      setContent("");
      setReplyTo(null);
      resetTextarea();
      invalidateMessages();
    },
    onError: () => showToast.error("Message not sent — try again"),
  });

  const editMutation = useMutation({
    mutationFn: (input: { messageId: string; content: string }) =>
      editMessage(input.messageId, input.content),
    onSuccess: () => {
      setEditing(null);
      setContent("");
      resetTextarea();
      invalidateMessages();
    },
    onError: () => showToast.error("Could not edit message"),
  });

  const resolveMutation = useMutation({
    mutationFn: () => resolveThread(channel.channel_id),
    onSuccess: (ch) => {
      onResolve(ch as unknown as Channel);
      qc.invalidateQueries({ queryKey: ["channels"] });
    },
  });

  // In-chat search
  const { data: searchResults = [] } = useQuery({
    queryKey: ["message-search", channel.channel_id, searchQ],
    queryFn: () =>
      searchMessages({ q: searchQ, channel_id: channel.channel_id }),
    enabled: searchOpen && searchQ.trim().length >= 2,
  });

  function resetTextarea() {
    const el = textareaRef.current;
    if (el) el.style.height = "auto";
  }

  function handleSend() {
    const text = content.trim();
    if (!text) return;
    if (editing) {
      editMutation.mutate({ messageId: editing.message_id, content: text });
    } else {
      sendMutation.mutate({ content: text, message_type: "text" });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape" && (editing || replyTo)) {
      setEditing(null);
      setReplyTo(null);
      setContent("");
    }
  }

  // Auto-resize textarea + throttled typing pings
  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
    const now = Date.now();
    if (now - lastTypingEmit.current > 1500) {
      lastTypingEmit.current = now;
      emitTyping(channel.channel_id);
    }
  }

  // ── Attachments ─────────────────────────────────────────────────────

  async function sendFiles(files: FileList | File[]) {
    const list = [...files];
    if (!list.length || uploading) return;
    setUploading(true);
    try {
      for (const file of list) {
        const att = await uploadMessageAttachment(
          file,
          channel.business || business || "jewelry",
        );
        const type: MessageType = file.type.startsWith("image/")
          ? "image"
          : "document";
        await sendMessage(channel.channel_id, {
          message_type: type,
          attachments: [att],
          content: content.trim() || undefined,
        });
        setContent("");
      }
      invalidateMessages();
    } catch {
      showToast.error("Could not send attachment");
    } finally {
      setUploading(false);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const files = [...e.clipboardData.files];
    if (files.length) {
      e.preventDefault();
      void sendFiles(files);
    }
  }

  // ── Voice notes ─────────────────────────────────────────────────────

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType });
        if (blob.size < 1000) return; // accidental tap
        const file = new File([blob], `voice-note-${Date.now()}.webm`, {
          type: recorder.mimeType,
        });
        setUploading(true);
        try {
          const att = await uploadMessageAttachment(
            file,
            channel.business || business || "jewelry",
          );
          await sendMessage(channel.channel_id, {
            message_type: "voice_note",
            attachments: [att],
          });
          invalidateMessages();
        } catch {
          showToast.error("Could not send voice note");
        } finally {
          setUploading(false);
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      showToast.error("Microphone unavailable");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  // ── Bubble actions ──────────────────────────────────────────────────

  const bubbleActions = {
    onReply: (msg: Message) => {
      setEditing(null);
      setReplyTo(msg);
      textareaRef.current?.focus();
    },
    onReact: (msg: Message, emoji: string) => {
      setReactionBarFor(null);
      toggleReaction(msg.message_id, emoji).then(invalidateMessages);
    },
    onEdit: (msg: Message) => {
      setReplyTo(null);
      setEditing(msg);
      setContent(msg.content ?? "");
      textareaRef.current?.focus();
    },
    onDelete: (msg: Message) => {
      deleteMessage(msg.message_id).then(invalidateMessages);
    },
    onForward: (msg: Message) => setForwarding(msg),
    onStar: (msg: Message) => {
      toggleStar(msg.message_id).then(invalidateMessages);
    },
  };

  // ── Header bits ─────────────────────────────────────────────────────

  const displayName = getChannelDisplayName(channel, userId);
  const peerOnline = isUserOnline(peer?.user_id);
  const typingNames = useMemo(() => {
    const byId = new Map(
      (channel.members ?? []).map((m) => [m.user_id, m.display_name]),
    );
    return typingUserIds
      .map((id) => (byId.get(id) ?? "Someone")?.split(" ")[0])
      .filter(Boolean);
  }, [typingUserIds, channel.members]);

  const subtitle = typingNames.length
    ? `${typingNames.join(", ")} ${typingNames.length === 1 ? "is" : "are"} typing…`
    : isGroup
      ? `${(channel.members ?? []).length} members`
      : peerOnline
        ? "online"
        : (fmtLastSeen(peer?.last_seen_at) ?? "");

  const isResolved = channel.status === "resolved";

  const headerMenu = [
    ...(isGroup
      ? [
          {
            label: "Group info",
            icon: <Users className="h-3.5 w-3.5" />,
            onClick: () => setGroupInfoOpen(true),
          },
        ]
      : []),
    {
      label: channel.is_pinned ? "Unpin conversation" : "Pin conversation",
      icon: <Pin className="h-3.5 w-3.5" />,
      onClick: () =>
        pinChannel(channel.channel_id, !channel.is_pinned).then(() =>
          qc.invalidateQueries({ queryKey: ["channels"] }),
        ),
    },
    {
      label: channel.is_muted ? "Unmute" : "Mute",
      icon: <BellOff className="h-3.5 w-3.5" />,
      onClick: () =>
        muteChannel(channel.channel_id, !channel.is_muted).then(() =>
          qc.invalidateQueries({ queryKey: ["channels"] }),
        ),
    },
    ...(channel.my_role === "admin" || !isGroup
      ? [
          {
            label: "Archive",
            icon: <Archive className="h-3.5 w-3.5" />,
            destructive: true,
            onClick: () =>
              archiveChannel(channel.channel_id)
                .then(() => {
                  qc.invalidateQueries({ queryKey: ["channels"] });
                  onBack?.();
                })
                .catch(() => showToast.error("Only group admins can archive")),
          },
        ]
      : []),
  ];

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        void sendFiles(e.dataTransfer.files);
      }}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-orika-gold/60 bg-orika-black/70">
          <p className="text-sm font-medium text-orika-gold">
            Drop to send file
          </p>
        </div>
      )}

      {/* Thread header */}
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3 lg:px-5">
        {onBack && (
          <button
            onClick={onBack}
            className="lg:hidden text-orika-smoke hover:text-orika-cream"
            title="Back"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <div className="relative shrink-0">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: getAvatarColour(displayName) }}
          >
            {getInitials(displayName)}
          </div>
          {!isGroup && peerOnline && (
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-orika-black bg-green-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-orika-cream">{displayName}</p>
          <p
            className={cn(
              "truncate text-xs",
              typingNames.length ? "text-orika-gold" : "text-orika-smoke",
            )}
          >
            {subtitle}
          </p>
        </div>
        <button
          onClick={() => {
            setSearchOpen((v) => !v);
            setSearchQ("");
          }}
          className={cn(
            "rounded-lg p-1.5 transition-colors",
            searchOpen
              ? "bg-orika-gold/15 text-orika-gold"
              : "text-orika-smoke hover:text-orika-cream",
          )}
          title="Search in conversation"
        >
          <Search className="h-4 w-4" />
        </button>
        {isCustomerThread &&
          (isResolved ? (
            <Badge tone="sage" size="xs">
              Resolved
            </Badge>
          ) : (
            <button
              onClick={() => resolveMutation.mutate()}
              disabled={resolveMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-orika-smoke transition-all hover:border-green-400/30 hover:text-green-400"
              title="Mark as resolved"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Resolve
            </button>
          ))}
        <DropdownMenu items={headerMenu} />
      </div>

      {/* In-chat search */}
      {searchOpen && (
        <div className="border-b border-white/5 bg-orika-charcoal/40 px-4 py-2">
          <input
            autoFocus
            type="text"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search this conversation…"
            className="w-full rounded-xl border border-white/5 bg-orika-charcoal py-2 px-3 text-xs text-orika-cream placeholder-orika-smoke/40 focus:border-orika-gold/30 focus:outline-none"
          />
          {searchQ.trim().length >= 2 && (
            <div className="mt-1 max-h-44 overflow-y-auto">
              {searchResults.length === 0 ? (
                <p className="py-2 text-center text-[11px] text-orika-smoke">
                  No matches
                </p>
              ) : (
                searchResults.map((r) => (
                  <div
                    key={r.message_id}
                    className="rounded-lg px-2 py-1.5 text-xs hover:bg-white/5"
                  >
                    <span className="text-orika-gold">{r.sender_name}</span>
                    <span className="text-orika-smoke/60">
                      {" "}
                      · {fmtClockTime(r.created_at)}
                    </span>
                    <p className="truncate text-orika-cream">{r.content}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 space-y-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={cn("flex gap-2", i % 2 === 0 && "flex-row-reverse")}
              >
                <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                <Skeleton className="h-12 w-48 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-orika-smoke">
              No messages yet — say hello 👋
            </p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isOwn = msg.sender_user_id === userId;
            const isSystem = msg.sender_kind === "system";
            const prevMsg = messages[i - 1];
            const showName =
              !isOwn &&
              !isSystem &&
              msg.sender_user_id !== prevMsg?.sender_user_id;
            const newDay =
              !prevMsg || !isSameDay(prevMsg.created_at, msg.created_at);

            return (
              <div key={msg.message_id}>
                {newDay && (
                  <div className="flex justify-center py-2">
                    <span className="rounded-full bg-orika-charcoal px-3 py-1 text-[10px] font-medium text-orika-smoke/70">
                      {fmtDayLabel(msg.created_at)}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={msg}
                  isOwn={isOwn}
                  isGroup={isGroup || isCustomerThread}
                  showSenderName={showName}
                  showReactionBar={reactionBarFor === msg.message_id}
                  onToggleReactionBar={() =>
                    setReactionBarFor(
                      reactionBarFor === msg.message_id
                        ? null
                        : msg.message_id,
                    )
                  }
                  actions={bubbleActions}
                />
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply / edit banner */}
      {(replyTo || editing) && (
        <div className="mx-4 mb-1 flex items-center gap-2 rounded-xl border border-orika-gold/20 bg-orika-gold/5 px-3 py-2">
          {editing ? (
            <Pencil className="h-3.5 w-3.5 shrink-0 text-orika-gold" />
          ) : (
            <Reply className="h-3.5 w-3.5 shrink-0 text-orika-gold" />
          )}
          <p className="flex-1 truncate text-xs text-orika-cloud">
            {editing
              ? "Editing message"
              : `${replyTo?.sender_name}: ${replyTo?.content ?? ""}`}
          </p>
          <button
            onClick={() => {
              setReplyTo(null);
              setEditing(null);
              if (editing) setContent("");
            }}
            className="text-orika-smoke hover:text-orika-cream"
          >
            ×
          </button>
        </div>
      )}

      {/* Composer */}
      {!isResolved && (
        <div className="border-t border-white/5 px-4 py-3">
          <div className="flex items-end gap-2">
            <div className="relative flex-1 rounded-2xl border border-white/10 bg-orika-charcoal">
              <EmojiPicker
                open={emojiOpen}
                onClose={() => setEmojiOpen(false)}
                onPick={(emoji) => {
                  setContent((c) => c + emoji);
                  textareaRef.current?.focus();
                }}
                className="bottom-full left-2 mb-2"
              />
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={
                  recording
                    ? "Recording voice note…"
                    : "Type a message… (Enter to send, Shift+Enter for new line)"
                }
                rows={1}
                disabled={recording}
                className="w-full resize-none bg-transparent px-4 py-3 text-sm text-orika-cream placeholder-orika-smoke/40 focus:outline-none"
                style={{ maxHeight: 120 }}
              />
              <div className="flex items-center gap-1 border-t border-white/5 px-3 py-1.5">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="p-1 text-orika-smoke/60 transition-colors hover:text-orika-smoke disabled:opacity-40"
                  title="Attach a file"
                >
                  <Paperclip
                    className={cn("h-4 w-4", uploading && "animate-pulse")}
                  />
                </button>
                <button
                  onClick={() => setEmojiOpen((v) => !v)}
                  className="p-1 text-orika-smoke/60 transition-colors hover:text-orika-smoke"
                  title="Emoji"
                >
                  <Smile className="h-4 w-4" />
                </button>
                <span className="ml-1 text-[10px] text-orika-smoke/30">
                  Use @ to mention someone
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files) void sendFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            {content.trim() || editing ? (
              <button
                onClick={handleSend}
                disabled={
                  !content.trim() ||
                  sendMutation.isPending ||
                  editMutation.isPending
                }
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orika-gold text-orika-black transition-all hover:bg-orika-gold-glow disabled:opacity-40"
                title={editing ? "Save edit" : "Send"}
              >
                <Send className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={recording ? stopRecording : startRecording}
                disabled={uploading}
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition-all disabled:opacity-40",
                  recording
                    ? "animate-pulse bg-red-500 text-white"
                    : "bg-orika-gold text-orika-black hover:bg-orika-gold-glow",
                )}
                title={recording ? "Stop and send" : "Record voice note"}
              >
                {recording ? (
                  <Square className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <ForwardModal
        message={forwarding}
        onClose={() => setForwarding(null)}
        userId={userId}
      />
      <GroupInfoModal
        channel={channel}
        open={groupInfoOpen}
        onClose={() => setGroupInfoOpen(false)}
        userId={userId}
        onLeft={onBack}
      />
    </div>
  );
}
