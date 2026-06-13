// ── lib/notifications/push.ts ─────────────────────────────────────────────
// Service worker registration + Web Push subscription. ensurePushSubscription
// runs on app start and right after notification permission is granted; it
// no-ops cleanly when the server has no VAPID keys yet, the browser lacks
// push support (iOS Safari outside an installed PWA), or permission isn't
// granted — so it can be called freely.

import { api } from "@services/api";

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

export async function ensurePushSubscription(): Promise<boolean> {
  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  )
    return false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return false;
  try {
    const reg =
      (await navigator.serviceWorker.getRegistration()) ??
      (await registerServiceWorker());
    if (!reg) return false;

    const res = await api.get<{ public_key?: string }>("/push/public-key", {
      validateStatus: (s) => s === 200 || s === 204,
    });
    const publicKey = res.status === 200 ? res.data?.public_key : undefined;
    if (!publicKey) return false; // server not configured for push yet

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // Browsers accept the base64url VAPID key directly.
        applicationServerKey: publicKey,
      });
    }
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
    await api.post("/push/subscribe", {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
    return true;
  } catch {
    return false;
  }
}
