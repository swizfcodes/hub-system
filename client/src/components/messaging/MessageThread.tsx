import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send, Paperclip, Smile, Reply, CheckCheck, CheckCircle2 } from 'lucide-react';
import { Skeleton } from '@components/ui/Skeleton';
import { Badge } from '@components/ui/Badge';
import {
  listMessages, sendMessage, markRead,
  resolveThread, toggleReaction } from '@services/messaging';
import { useChannelMessages } from '@hooks/useMessaging';
import {
  PLATFORM_META, getChannelPlatform, getChannelDisplayName,
  QUICK_REACTIONS, fmtRelativeTime,
} from '@lib/constants/messagingConstants';
import { cn } from '@lib/cn';
import type { Channel, Message } from '@typedefs/messaging';

interface MessageThreadProps {
  channel:   Channel;
  onResolve: (ch: Channel) => void;
  userId?:   string;
}

export function MessageThread({ channel, onResolve, userId }: MessageThreadProps) {
  const qc            = useQueryClient();
  const platform      = getChannelPlatform(channel);
  const platformMeta  = PLATFORM_META[platform];
  const [content, setContent]         = useState('');
  const [replyTo, setReplyTo]         = useState<Message | null>(null);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const bottomRef     = useRef<HTMLDivElement>(null);
  const textareaRef   = useRef<HTMLTextAreaElement>(null);

  useChannelMessages(channel.channel_id);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['messages', channel.channel_id],
    queryFn:  () => listMessages(channel.channel_id, { limit: 50 }),
    refetchOnWindowFocus: false,
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Mark read when channel is opened — errors are logged but never surfaced
  // to the user (a failed mark-read is not worth interrupting the conversation).
  useEffect(() => {
    if (messages.length > 0) {
      const lastId = messages[messages.length - 1]?.message_id;
      markRead(channel.channel_id, lastId)
        .then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))
        .catch((err) => console.warn('[MessageThread] mark-read failed:', err?.message));
    }
    qc.invalidateQueries({ queryKey: ['channels'] });
  }, [channel.channel_id, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendMutation = useMutation({
    mutationFn: (text: string) => sendMessage(channel.channel_id, {
      content:     text,
      message_type: 'text',
      reply_to_id:  replyTo?.message_id,
    }),
    onSuccess: () => {
      setContent('');
      setReplyTo(null);
      qc.invalidateQueries({ queryKey: ['messages', channel.channel_id] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: () => resolveThread(channel.channel_id),
    onSuccess: (ch) => {
      onResolve(ch as unknown as Channel);
      qc.invalidateQueries({ queryKey: ['channels'] });
    },
  });

  function handleSend() {
    const text = content.trim();
    if (!text) return;
    sendMutation.mutate(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Auto-resize textarea
  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }

  const isResolved = channel.status === 'resolved';

  return (
    <div className="flex h-full flex-col">
      {/* Thread header */}
      <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-sm shrink-0"
          style={{ backgroundColor: platformMeta.bg }}
        >
          {platformMeta.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-orika-cream truncate">
            {getChannelDisplayName(channel)}
          </p>
          <p className="text-xs text-orika-smoke">{platformMeta.label}</p>
        </div>
        {isResolved ? (
          <Badge tone="sage" size="xs">Resolved</Badge>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => resolveMutation.mutate()}
              disabled={resolveMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-orika-smoke hover:text-green-400 hover:border-green-400/30 transition-all"
              title="Mark as resolved"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Resolve
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3,4].map((i) => (
              <div key={i} className={cn('flex gap-2', i % 2 === 0 && 'flex-row-reverse')}>
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <Skeleton className="h-12 w-48 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-orika-smoke">No messages yet</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isOwn   = msg.sender_user_id === userId;
            const isSystem = msg.sender_kind === 'system';
            const prevMsg  = messages[i - 1];
            const showName = !isOwn && !isSystem &&
              msg.sender_user_id !== prevMsg?.sender_user_id;

            return (
              <MessageBubble
                key={msg.message_id}
                message={msg}
                isOwn={isOwn}
                showSenderName={showName}
                showReactions={showReactions === msg.message_id}
                onShowReactions={() => setShowReactions(
                  showReactions === msg.message_id ? null : msg.message_id
                )}
                onReply={() => { setReplyTo(msg); textareaRef.current?.focus(); }}
                onReact={(emoji) => {
                  toggleReaction(msg.message_id, emoji).then(() => {
                    qc.invalidateQueries({ queryKey: ['messages', channel.channel_id] });
                  });
                  setShowReactions(null);
                }}
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="mx-4 mb-1 flex items-center gap-2 rounded-xl border border-orika-gold/20 bg-orika-gold/5 px-3 py-2">
          <Reply className="h-3.5 w-3.5 text-orika-gold shrink-0" />
          <p className="flex-1 text-xs text-orika-cloud truncate">
            {replyTo.sender_name}: {replyTo.content}
          </p>
          <button onClick={() => setReplyTo(null)} className="text-orika-smoke hover:text-orika-cream">
            ×
          </button>
        </div>
      )}

      {/* Composer */}
      {!isResolved && (
        <div className="border-t border-white/5 px-4 py-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 rounded-2xl border border-white/10 bg-orika-charcoal">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                rows={1}
                className="w-full resize-none bg-transparent px-4 py-3 text-sm text-orika-cream placeholder-orika-smoke/40 focus:outline-none"
                style={{ maxHeight: 120 }}
              />
              <div className="flex items-center gap-1 border-t border-white/5 px-3 py-1.5">
                <button className="text-orika-smoke/60 hover:text-orika-smoke transition-colors p-1" title="Attach">
                  <Paperclip className="h-4 w-4" />
                </button>
                <button className="text-orika-smoke/60 hover:text-orika-smoke transition-colors p-1" title="Emoji">
                  <Smile className="h-4 w-4" />
                </button>
                <span className="text-[10px] text-orika-smoke/30 ml-1">Use @ to mention someone</span>
              </div>
            </div>
            <button
              onClick={handleSend}
              disabled={!content.trim() || sendMutation.isPending}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orika-gold text-orika-black transition-all hover:bg-orika-gold-glow disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

interface BubbleProps {
  message:        Message;
  isOwn:          boolean;
  showSenderName: boolean;
  showReactions:  boolean;
  onShowReactions:() => void;
  onReply:        () => void;
  onReact:        (emoji: string) => void;
}

function MessageBubble({
  message, isOwn, showSenderName, showReactions, onShowReactions, onReply, onReact,
}: BubbleProps) {
  if (message.sender_kind === 'system') {
    return (
      <div className="flex justify-center py-1">
        <p className="rounded-full bg-orika-graphite/40 px-3 py-1 text-[10px] text-orika-smoke/60 italic">
          {message.content}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('group flex gap-2', isOwn ? 'flex-row-reverse' : '')}>
      {/* Avatar */}
      {!isOwn && (
        <div className="h-7 w-7 shrink-0 rounded-full bg-orika-graphite flex items-center justify-center">
          <span className="text-[10px] font-semibold text-orika-cloud">
            {message.sender_name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}

      <div className={cn('flex flex-col max-w-[70%]', isOwn ? 'items-end' : 'items-start')}>
        {showSenderName && (
          <p className="mb-0.5 text-[10px] font-medium text-orika-smoke px-1">
            {message.sender_name}
          </p>
        )}

        {/* Bubble */}
        <div className="relative">
          <div
            className={cn(
              'rounded-2xl px-3 py-2 text-sm',
              isOwn
                ? 'rounded-tr-sm bg-orika-gold text-orika-black'
                : 'rounded-tl-sm bg-orika-charcoal text-orika-cream border border-white/5',
            )}
          >
            {message.content && (
              <p className="whitespace-pre-wrap break-words leading-relaxed">
                {message.content}
              </p>
            )}
            {message.attachments?.length > 0 && (
              <div className="mt-1.5 space-y-1">
                {message.attachments.map((att) => (
                  <div key={att.attachment_id}
                    className="flex items-center gap-1.5 text-xs opacity-80">
                    <Paperclip className="h-3 w-3" />
                    {att.display_name ?? 'Attachment'}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hover actions */}
          <div className={cn(
            'absolute top-0 hidden group-hover:flex items-center gap-1',
            isOwn ? 'right-full mr-2' : 'left-full ml-2',
          )}>
            <button onClick={onReply}
              className="rounded-lg bg-orika-charcoal border border-white/10 p-1.5 text-orika-smoke hover:text-orika-gold transition-colors"
              title="Reply">
              <Reply className="h-3 w-3" />
            </button>
            <button onClick={onShowReactions}
              className="rounded-lg bg-orika-charcoal border border-white/10 p-1.5 text-orika-smoke hover:text-orika-gold transition-colors"
              title="React">
              <Smile className="h-3 w-3" />
            </button>
          </div>

          {/* Reaction picker */}
          {showReactions && (
            <div className={cn(
              'absolute -top-10 z-10 flex items-center gap-1 rounded-2xl border border-white/10 bg-orika-charcoal px-2 py-1.5 shadow-xl',
              isOwn ? 'right-0' : 'left-0',
            )}>
              {QUICK_REACTIONS.map((emoji) => (
                <button key={emoji} onClick={() => onReact(emoji)}
                  className="text-base transition-transform hover:scale-125">
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Timestamp */}
        <p className="mt-0.5 px-1 text-[9px] text-orika-smoke/40">
          {fmtRelativeTime(message.created_at)}
          {isOwn && <CheckCheck className="ml-0.5 inline h-3 w-3" />}
        </p>
      </div>
    </div>
  );
}
