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
  Upload,
  FolderOpen,
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
  registerActiveChannel,
  unregisterActiveChannel,
} from "@lib/notifications/chatAlerts";
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
import { DocumentPickerModal } from "./DocumentPickerModal";
import type { HubDocument } from "@typedefs/documents";
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
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [docPickerOpen, setDocPickerOpen] = useState(false);

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

  // Join the channel's socket room for typing indicators, and register as
  // the on-screen conversation so the alert layer stays quiet for it.
  useEffect(() => {
    joinChannelRoom(channel.channel_id);
    registerActiveChannel(channel.channel_id);
    return () => {
      leaveChannelRoom(channel.channel_id);
      unregisterActiveChannel(channel.channel_id);
    };
  }, [channel.channel_id]);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["messages", channel.channel_id],
    queryFn: () => listMessages(channel.channel_id, { limit: 50 }),
    refetchOnWindowFocus: false,
  });

  // "N unread" divider — anchored once per conversation open, to the
  // oldest message that was unread at that moment. Anchoring to a
  // message_id keeps the line fixed while mark-read fires and new
  // messages arrive underneath it.
  const [unreadDivider, setUnreadDivider] = useState<{
    channelId: string;
    messageId: string;
    count: number;
  } | null>(null);
  useEffect(() => {
    if (isLoading || unreadDivider?.channelId === channel.channel_id) return;
    const count = channel.unread_count ?? 0;
    let anchor: { channelId: string; messageId: string; count: number } = {
      channelId: channel.channel_id,
      messageId: "",
      count: 0,
    };
    let remaining = count;
    if (count > 0) {
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.sender_user_id !== userId && m.sender_kind !== "system") {
          remaining -= 1;
          if (remaining === 0) {
            anchor = {
              channelId: channel.channel_id,
              messageId: m.message_id,
              count,
            };
            break;
          }
        }
      }
    }
    setUnreadDivider(anchor);
  }, [
    isLoading,
    messages,
    channel.channel_id,
    channel.unread_count,
    userId,
    unreadDivider?.channelId,
  ]);

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

  // Share an existing vault document by reference — no re-upload, the
  // message attachment points at the same tamper-proof original.
  function sendDocumentReference(doc: HubDocument) {
    setDocPickerOpen(false);
    sendMutation.mutate({
      message_type: doc.mime_type?.startsWith("image/") ? "image" : "document",
      attachments: [
        {
          document_id: doc.document_id,
          display_name: doc.title || doc.document_number,
        },
      ],
    });
  }

  // ── Voice notes ─────────────────────────────────────────────────────

  // Pick a container/codec the browser will actually produce. Relying on
  // the default mimeType yields empty output on some builds.
  function pickAudioMime(): string | undefined {
    if (typeof MediaRecorder === "undefined") return undefined;
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4", // Safari / iOS
      "audio/ogg;codecs=opus",
    ];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported?.(c)) return c;
    }
    return undefined; // let the browser choose as a last resort
  }

  async function startRecording() {
    // Mic capture needs a secure context (https or localhost) AND the
    // MediaRecorder API. Tell the user exactly which is missing instead
    // of a blanket "unavailable".
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      showToast.error(
        "Voice notes need a secure connection — open Hub over https (or localhost).",
      );
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      showToast.error("This browser can't record audio. Try Chrome or Safari.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickAudioMime();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        showToast.error("Recording failed — please try again");
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        // Safari records audio/mp4, Chrome audio/webm, Firefox audio/ogg —
        // name the file to match so playback works across all of them.
        const mime = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunks, { type: mime });
        // Diagnostic: a few hundred bytes after speaking = container-only
        // (no audio captured); tens of KB = real audio present.
        console.debug(
          `[voice note] captured ${blob.size} bytes in ${chunks.length} chunk(s), mime=${mime}`,
        );
        if (blob.size === 0) {
          showToast.error(
            "No audio was captured — check microphone access and try again.",
          );
          return;
        }
        if (blob.size < 600) return; // genuine accidental tap
        const ext = mime.includes("mp4")
          ? "m4a"
          : mime.includes("ogg")
            ? "ogg"
            : "webm";
        const file = new File([blob], `voice-note-${Date.now()}.${ext}`, {
          type: mime,
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
        } catch (err) {
          console.error("[voice note] send failed:", err);
          showToast.error("Could not send voice note");
        } finally {
          setUploading(false);
        }
      };
      // Timeslice: request data every second so chunks accumulate during
      // recording — without it some browsers emit nothing at stop.
      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      console.error("[voice note] mic/recorder error:", err);
      const name = (err as Error)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        showToast.error(
          "Microphone permission denied — allow it for this site and retry.",
        );
      } else if (name === "NotFoundError") {
        showToast.error("No microphone found on this device.");
      } else {
        showToast.error("Microphone unavailable");
      }
    }
  }

  function stopRecording() {
    try {
      recorderRef.current?.requestData?.();
      recorderRef.current?.stop();
    } catch (err) {
      console.error("[voice note] stop failed:", err);
    }
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
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-brand-accent/60 bg-brand-black/70">
          <p className="text-sm font-medium text-brand-accent">
            Drop to send file
          </p>
        </div>
      )}

      {/* Thread header */}
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3 lg:px-5">
        {onBack && (
          <button
            onClick={onBack}
            className="lg:hidden text-brand-smoke hover:text-brand-cream"
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
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-brand-black bg-green-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-brand-cream">{displayName}</p>
          <p
            className={cn(
              "truncate text-xs",
              typingNames.length ? "text-brand-accent" : "text-brand-smoke",
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
              ? "bg-brand-accent/15 text-brand-accent"
              : "text-brand-smoke hover:text-brand-cream",
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
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-brand-smoke transition-all hover:border-green-400/30 hover:text-green-400"
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
        <div className="border-b border-white/5 bg-brand-charcoal/40 px-4 py-2">
          <input
            autoFocus
            type="text"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Search this conversation…"
            className="w-full rounded-xl border border-white/5 bg-brand-charcoal py-2 px-3 text-xs text-brand-cream placeholder-brand-smoke/40 focus:border-brand-accent/30 focus:outline-none"
          />
          {searchQ.trim().length >= 2 && (
            <div className="mt-1 max-h-44 overflow-y-auto">
              {searchResults.length === 0 ? (
                <p className="py-2 text-center text-[11px] text-brand-smoke">
                  No matches
                </p>
              ) : (
                searchResults.map((r) => (
                  <div
                    key={r.message_id}
                    className="rounded-lg px-2 py-1.5 text-xs hover:bg-white/5"
                  >
                    <span className="text-brand-accent">{r.sender_name}</span>
                    <span className="text-brand-smoke/60">
                      {" "}
                      · {fmtClockTime(r.created_at)}
                    </span>
                    <p className="truncate text-brand-cream">{r.content}</p>
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
            <p className="text-sm text-brand-smoke">
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
                    <span className="rounded-full bg-brand-charcoal px-3 py-1 text-[10px] font-medium text-brand-smoke/70">
                      {fmtDayLabel(msg.created_at)}
                    </span>
                  </div>
                )}
                {unreadDivider?.messageId === msg.message_id && (
                  <div className="flex items-center gap-3 py-2">
                    <div className="h-px flex-1 bg-brand-accent/25" />
                    <span className="rounded-full bg-brand-accent/10 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-brand-accent">
                      {unreadDivider.count} unread
                    </span>
                    <div className="h-px flex-1 bg-brand-accent/25" />
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
        <div className="mx-4 mb-1 flex items-center gap-2 rounded-xl border border-brand-accent/20 bg-brand-accent/5 px-3 py-2">
          {editing ? (
            <Pencil className="h-3.5 w-3.5 shrink-0 text-brand-accent" />
          ) : (
            <Reply className="h-3.5 w-3.5 shrink-0 text-brand-accent" />
          )}
          <p className="flex-1 truncate text-xs text-brand-cloud">
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
            className="text-brand-smoke hover:text-brand-cream"
          >
            ×
          </button>
        </div>
      )}

      {/* Composer */}
      {!isResolved && (
        <div className="border-t border-white/5 px-4 py-3">
          <div className="flex items-end gap-2">
            <div className="relative flex-1 rounded-2xl border border-white/10 bg-brand-charcoal">
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
                className="w-full resize-none bg-transparent px-4 py-3 text-sm text-brand-cream placeholder-brand-smoke/40 focus:outline-none"
                style={{ maxHeight: 120 }}
              />
              <div className="flex items-center gap-1 border-t border-white/5 px-3 py-1.5">
                <div className="relative">
                  {attachMenuOpen && (
                    <>
                      <button
                        type="button"
                        aria-hidden
                        tabIndex={-1}
                        onClick={() => setAttachMenuOpen(false)}
                        className="fixed inset-0 z-10 cursor-default"
                      />
                      <div className="absolute bottom-full left-0 z-20 mb-2 w-44 overflow-hidden rounded-xl border border-white/10 bg-brand-charcoal shadow-xl">
                        <button
                          onClick={() => {
                            setAttachMenuOpen(false);
                            fileInputRef.current?.click();
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-brand-cream transition-colors hover:bg-white/5"
                        >
                          <Upload className="h-3.5 w-3.5 text-brand-smoke" />
                          Upload file
                        </button>
                        <button
                          onClick={() => {
                            setAttachMenuOpen(false);
                            setDocPickerOpen(true);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-brand-cream transition-colors hover:bg-white/5"
                        >
                          <FolderOpen className="h-3.5 w-3.5 text-brand-smoke" />
                          From Documents
                        </button>
                      </div>
                    </>
                  )}
                  <button
                    onClick={() => setAttachMenuOpen((v) => !v)}
                    disabled={uploading}
                    className="p-1 text-brand-smoke/60 transition-colors hover:text-brand-smoke disabled:opacity-40"
                    title="Attach"
                  >
                    <Paperclip
                      className={cn("h-4 w-4", uploading && "animate-pulse")}
                    />
                  </button>
                </div>
                <button
                  onClick={() => setEmojiOpen((v) => !v)}
                  className="p-1 text-brand-smoke/60 transition-colors hover:text-brand-smoke"
                  title="Emoji"
                >
                  <Smile className="h-4 w-4" />
                </button>
                <span className="ml-1 text-[10px] text-brand-smoke/30">
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
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-accent text-brand-black transition-all hover:bg-brand-accent-glow disabled:opacity-40"
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
                    : "bg-brand-accent text-brand-black hover:bg-brand-accent-glow",
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
      <DocumentPickerModal
        open={docPickerOpen}
        onClose={() => setDocPickerOpen(false)}
        onPick={sendDocumentReference}
      />
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
