// ── hooks/useMessaging.ts ───────────────────────────────────────────────────
// Socket-event → react-query refresh bridge for the SmartComm Messaging
// module. The server emits `message:new` and `channel:created` events on
// the business socket room. Wherever you initialise socket.io (typically
// at AppLayout root), call `dispatchSocketEvent('message:new', payload)`
// for each incoming event so these hooks can pick them up.
//
// This keeps components decoupled from socket.io — they just listen on
// `window` CustomEvents and invalidate the relevant react-query keys.

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const NEW_MESSAGE_EVENT     = 'orika:message:new';
const NEW_CHANNEL_EVENT     = 'orika:channel:created';

/** Helper for the socket-bootstrap layer to publish events. */
export function dispatchSocketEvent(
  type: 'message:new' | 'channel:created',
  detail: unknown,
) {
  const eventName = type === 'message:new' ? NEW_MESSAGE_EVENT : NEW_CHANNEL_EVENT;
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

/**
 * Refresh the channel list (and unread count) when any new message arrives
 * or a new channel is created for the active business.
 */
export function useChannelListUpdates(_business: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    const onAny = () => {
      qc.invalidateQueries({ queryKey: ['channels'] });
      qc.invalidateQueries({ queryKey: ['unread-count'] });
    };
    window.addEventListener(NEW_MESSAGE_EVENT, onAny);
    window.addEventListener(NEW_CHANNEL_EVENT, onAny);
    return () => {
      window.removeEventListener(NEW_MESSAGE_EVENT, onAny);
      window.removeEventListener(NEW_CHANNEL_EVENT, onAny);
    };
  }, [qc]);
}

/**
 * Refresh a single channel's message list when a message:new event
 * targets this channel.
 */
export function useChannelMessages(channelId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!channelId) return;
    const onMessage = (e: Event) => {
      const ev = e as CustomEvent<{ channelId?: string }>;
      if (!ev.detail || ev.detail.channelId === channelId) {
        qc.invalidateQueries({ queryKey: ['messages', channelId] });
      }
    };
    window.addEventListener(NEW_MESSAGE_EVENT, onMessage);
    return () => window.removeEventListener(NEW_MESSAGE_EVENT, onMessage);
  }, [channelId, qc]);
}
