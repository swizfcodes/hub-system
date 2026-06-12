/**
 * ChatNotificationManager — invisible. Mounted once in AppShell so chat
 * alerts work on EVERY page of the hub, not just /messaging:
 *   - plays the pop + shows a browser notification on personalised
 *     message:new events (skipping own messages, muted conversations and
 *     the conversation currently on screen)
 *   - mirrors the unread total onto the tab title + favicon badge
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@stores/useAuthStore";
import { useSocketEvent } from "@hooks/useMessaging";
import { useUnreadTotal } from "@hooks/useUnreadTotal";
import {
  type ChatMessageEvent,
  applyTabBadge,
  isChannelActive,
  isChatSoundEnabled,
  playChatPop,
  shouldPlayPop,
  showChatNotification,
} from "@lib/notifications/chatAlerts";
import {
  registerServiceWorker,
  ensurePushSubscription,
} from "@lib/notifications/push";

export function ChatNotificationManager() {
  const navigate = useNavigate();
  const myUserId = useAuthStore((s) => s.user?.user_id);
  const unreadTotal = useUnreadTotal();

  // Register the service worker (installability) and, when notification
  // permission is already granted, make sure this device holds a live
  // push subscription. Both no-op cleanly where unsupported.
  useEffect(() => {
    void registerServiceWorker().then(() => ensurePushSubscription());
  }, []);

  useEffect(() => {
    void applyTabBadge(unreadTotal);
  }, [unreadTotal]);

  // Restore the clean title/favicon when signing out unmounts the shell.
  useEffect(() => () => void applyTabBadge(0), []);

  useSocketEvent(["message:new"], (_type, detail) => {
    const d = detail as ChatMessageEvent | undefined;
    // No recipient block → generic business-room copy → cache refresh only.
    if (!d?.channelId || !d.recipient) return;
    if (!myUserId || d.senderUserId === myUserId) return;
    if (d.recipient.muted) return;
    // Looking right at it — the thread itself is the notification.
    if (isChannelActive(d.channelId) && document.visibilityState === "visible")
      return;

    if (isChatSoundEnabled() && shouldPlayPop(d.channelId)) playChatPop();
    showChatNotification(d, (channelId) =>
      navigate(`/messaging?channel=${channelId}`),
    );
  });

  return null;
}
