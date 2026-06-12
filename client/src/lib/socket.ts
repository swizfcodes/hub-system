// ── lib/socket.ts ─────────────────────────────────────────────────────────────
// Socket.io bootstrap. Connects once per authenticated session and bridges
// server events to window CustomEvents (see hooks/useMessaging.ts) so
// components stay decoupled from the socket instance.
//
// Server rooms (config/sockets.js): `user:{id}`, `business:{key}` and
// `channel:{id}` (joined on demand for typing indicators).

import { io, type Socket } from "socket.io-client";
import { getToken } from "@services/auth";
import { dispatchSocketEvent } from "@hooks/useMessaging";

let socket: Socket | null = null;

/** Server events forwarded 1:1 to window CustomEvents. */
const FORWARDED_EVENTS = [
  "message:new",
  "message:updated",
  "message:deleted",
  "message:read",
  "channel:created",
  "channel:updated",
  "typing",
  "presence:online",
  "presence:offline",
  "notification:new",
  "branding:updated",
] as const;

/** Online user ids, kept fresh from presence events. */
const onlineUsers = new Set<string>();

export function connectSocket(): Socket | null {
  if (socket?.connected) return socket;
  const token = getToken();
  if (!token) return null;

  socket = io({ auth: { token }, transports: ["polling"] });

  for (const event of FORWARDED_EVENTS) {
    socket.on(event, (detail: unknown) => dispatchSocketEvent(event, detail));
  }

  socket.on("presence:online", (d: { userId?: string }) => {
    if (d?.userId) onlineUsers.add(d.userId);
  });
  socket.on("presence:offline", (d: { userId?: string }) => {
    if (d?.userId) onlineUsers.delete(d.userId);
  });

  socket.on("connect", () => {
    // Hydrate the online list on every (re)connect.
    socket?.emit("presence:list", (ids: string[]) => {
      onlineUsers.clear();
      for (const id of ids ?? []) onlineUsers.add(id);
      dispatchSocketEvent("presence:online", { userId: null });
    });
  });

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  onlineUsers.clear();
}

export function getSocket(): Socket | null {
  return socket;
}

export function isUserOnline(userId?: string | null): boolean {
  return !!userId && onlineUsers.has(userId);
}

// ── Messaging-specific emits ──────────────────────────────────────────────

export function joinChannelRoom(channelId: string) {
  socket?.emit("channel:join", channelId);
}

export function leaveChannelRoom(channelId: string) {
  socket?.emit("channel:leave", channelId);
}

export function emitTyping(channelId: string) {
  socket?.emit("typing", { channelId });
}

export function emitSwitchBusiness(business: string) {
  socket?.emit("switch_business", business);
}
