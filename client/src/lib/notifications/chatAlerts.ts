// ── lib/notifications/chatAlerts.ts ──────────────────────────────────────
// The "hard notification" layer for in-house chat while the app is open:
//   - a short two-tone pop (Web Audio, no asset to load) with per-channel
//     and global throttles so rapid-fire messages don't machine-gun beep
//   - browser Notifications (click focuses the conversation)
//   - tab title "(n) Hub" + favicon dot tinted by the unread urgency scale
//   - an active-conversation registry so the thread you're looking at
//     never alerts
//
// Server side, message:new arrives once per member with a personalised
// `recipient` block (own mute flag); copies without it (the business-room
// broadcast) are cache-refresh only and must never alert.

import { unreadTone, UNREAD_TONE_HEX, formatUnread } from "@lib/constants/unread";

export interface ChatMessageEvent {
  channelId: string;
  messageId: string;
  senderUserId?: string | null;
  senderName?: string | null;
  channelName?: string | null;
  channelType?: "group" | "direct" | "customer_thread";
  messageType?: string;
  preview?: string;
  recipient?: { muted?: boolean };
}

// ── Sound preference (per device) ─────────────────────────────────────────

const SOUND_KEY = "orika_chat_sound";

export function isChatSoundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setChatSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* private mode — preference just won't stick */
  }
}

// ── Two-tone pop ──────────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null;

export function playChatPop() {
  try {
    type AudioCtor = typeof AudioContext;
    const Ctor: AudioCtor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioCtor })
        .webkitAudioContext;
    if (!Ctor) return;
    audioCtx ??= new Ctor();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    const t0 = audioCtx.currentTime;
    const notes: Array<[freq: number, start: number, dur: number]> = [
      [880, 0, 0.09],
      [1318.5, 0.09, 0.16],
    ];
    for (const [freq, start, dur] of notes) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + start);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.05);
    }
  } catch {
    /* audio blocked until first user gesture — fine */
  }
}

// Rapid-fire batching: at most one pop per channel each 2.5s, one overall
// per 0.8s.
const lastPopByChannel = new Map<string, number>();
let lastPopGlobal = 0;

export function shouldPlayPop(channelId: string): boolean {
  const now = Date.now();
  if (now - lastPopGlobal < 800) return false;
  if (now - (lastPopByChannel.get(channelId) ?? 0) < 2500) return false;
  lastPopGlobal = now;
  lastPopByChannel.set(channelId, now);
  return true;
}

// ── Active-conversation registry ──────────────────────────────────────────
// MessageThread registers its channel while mounted (full page or dock);
// the manager skips alerts for a conversation the user is looking at.

const activeChannels = new Set<string>();

export function registerActiveChannel(channelId: string) {
  activeChannels.add(channelId);
}

export function unregisterActiveChannel(channelId: string) {
  activeChannels.delete(channelId);
}

export function isChannelActive(channelId: string): boolean {
  return activeChannels.has(channelId);
}

// ── Browser notifications ─────────────────────────────────────────────────

export function chatNotifPermission(): NotificationPermission {
  return typeof Notification === "undefined"
    ? "denied"
    : Notification.permission;
}

export async function requestChatNotifPermission(): Promise<NotificationPermission> {
  if (typeof Notification === "undefined") return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function previewLine(d: ChatMessageEvent): string {
  if (d.preview) return d.preview;
  if (d.messageType === "voice_note") return "🎤 Voice note";
  if (d.messageType === "image") return "📷 Photo";
  return "📎 Attachment";
}

/**
 * OS-level notification for an incoming message. Tagged per channel so a
 * burst collapses into one notification instead of stacking ten. Skipped
 * when the tab is visible AND the user is already on the messaging page —
 * there the pop + badges carry the signal.
 */
export function showChatNotification(
  d: ChatMessageEvent,
  onOpen: (channelId: string) => void,
) {
  if (chatNotifPermission() !== "granted") return;
  if (
    document.visibilityState === "visible" &&
    window.location.pathname.startsWith("/messaging")
  )
    return;
  try {
    const title =
      d.channelType === "group"
        ? `${d.senderName ?? "Someone"} · ${d.channelName ?? "Group"}`
        : (d.senderName ?? "New message");
    const n = new Notification(title, {
      body: previewLine(d),
      icon: "/android-chrome-192x192.png",
      tag: `chat-${d.channelId}`,
    });
    n.onclick = () => {
      window.focus();
      onOpen(d.channelId);
      n.close();
    };
  } catch {
    /* some browsers throw outside a service worker — push covers those */
  }
}

// ── Tab title + favicon badge ─────────────────────────────────────────────

const BASE_TITLE =
  typeof document !== "undefined" && document.title ? document.title : "Hub";
const FAVICON_HREF = "/favicon-32x32.png";

let baseIcon: Promise<HTMLImageElement> | null = null;

function loadBaseIcon(): Promise<HTMLImageElement> {
  baseIcon ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = FAVICON_HREF;
  });
  return baseIcon;
}

function iconLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  return link;
}

/** Reflect the unread total on the tab: "(n) Hub" + tinted favicon dot. */
export async function applyTabBadge(count: number) {
  document.title =
    count > 0 ? `(${formatUnread(count)}) ${BASE_TITLE}` : BASE_TITLE;
  const link = iconLink();
  const tone = unreadTone(count);
  if (!tone) {
    link.href = FAVICON_HREF;
    return;
  }
  try {
    const img = await loadBaseIcon();
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, 32, 32);
    ctx.beginPath();
    ctx.arc(22, 10, 9, 0, Math.PI * 2);
    ctx.fillStyle = UNREAD_TONE_HEX[tone];
    ctx.fill();
    link.href = canvas.toDataURL("image/png");
  } catch {
    /* favicon badge is best-effort — the title still carries the count */
  }
}
