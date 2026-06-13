// ── hooks/useMessaging.ts ───────────────────────────────────────────────────
// Socket-event → react-query refresh bridge for the SmartComm Messaging
// module. lib/socket.ts forwards server socket events to window
// CustomEvents; these hooks listen and invalidate the relevant
// react-query keys, keeping components decoupled from socket.io.

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export type MessagingSocketEvent =
  | "message:new"
  | "message:updated"
  | "message:deleted"
  | "message:read"
  | "channel:created"
  | "channel:updated"
  | "typing"
  | "presence:online"
  | "presence:offline"
  | "notification:new"
  | "branding:updated";

const eventName = (type: MessagingSocketEvent) => `orika:${type}`;

/** Helper for the socket-bootstrap layer to publish events. */
export function dispatchSocketEvent(
  type: MessagingSocketEvent,
  detail: unknown,
) {
  window.dispatchEvent(new CustomEvent(eventName(type), { detail }));
}

export function useSocketEvent(
  types: MessagingSocketEvent[],
  handler: (type: MessagingSocketEvent, detail: unknown) => void,
) {  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  // Key the effect on the (stable) list of event names, not the array
  // identity, so callers can pass inline arrays.
  const key = types.join(",");
  useEffect(() => {
    const names = key.split(",") as MessagingSocketEvent[];
    const listeners = names.map((type) => {
      const fn = (e: Event) =>
        handlerRef.current(type, (e as CustomEvent).detail);
      window.addEventListener(eventName(type), fn);
      return { type, fn };
    });
    return () => {
      for (const { type, fn } of listeners) {
        window.removeEventListener(eventName(type), fn);
      }
    };
  }, [key]);
}

/**
 * Refresh the channel list (and unread count) on any messaging activity.
 */
export function useChannelListUpdates(_business: string | null) {
  const qc = useQueryClient();
  useSocketEvent(
    [
      "message:new",
      "message:deleted",
      "channel:created",
      "channel:updated",
      "message:read",
    ],
    () => {
      qc.invalidateQueries({ queryKey: ["channels"] });
      qc.invalidateQueries({ queryKey: ["unread-count"] });
    },
  );
}

/**
 * Refresh a single channel's message list when a message event targets
 * this channel.
 */
export function useChannelMessages(channelId: string | null) {
  const qc = useQueryClient();
  useSocketEvent(
    ["message:new", "message:updated", "message:deleted", "message:read"],
    (_type, detail) => {
      if (!channelId) return;
      const d = detail as { channelId?: string } | undefined;
      if (!d || !d.channelId || d.channelId === channelId) {
        qc.invalidateQueries({ queryKey: ["messages", channelId] });
      }
    },
  );
}

/**
 * "Olu is typing…" — returns the set of user ids currently typing in the
 * channel. Entries expire 3 s after the last typing ping.
 */
export function useTypingIndicator(
  channelId: string | null,
  selfUserId?: string,
): string[] {
  const [typing, setTyping] = useState<Record<string, number>>({});

  useSocketEvent(["typing"], (_type, detail) => {
    const d = detail as { channelId?: string; userId?: string } | undefined;
    if (!channelId || !d?.userId || d.channelId !== channelId) return;
    if (d.userId === selfUserId) return;
    setTyping((prev) => ({ ...prev, [d.userId as string]: Date.now() }));
  });

  // Sweep out stale entries.
  useEffect(() => {
    const interval = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        const next: Record<string, number> = {};
        let changed = false;
        for (const [uid, ts] of Object.entries(prev)) {
          if (now - ts < 3000) next[uid] = ts;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return Object.keys(typing);
}

/**
 * Re-render on presence changes so online dots / "last seen" stay fresh.
 * Returns a counter — callers just need the re-render plus
 * isUserOnline() from lib/socket.
 */
export function usePresence(): number {
  const [version, setVersion] = useState(0);
  useSocketEvent(["presence:online", "presence:offline"], () =>
    setVersion((v) => v + 1),
  );
  return version;
}
