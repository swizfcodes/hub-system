/**
 * useInstallPrompt — surfaces "Add to Home Screen" on every platform.
 *
 * Android / desktop Chromium fire a `beforeinstallprompt` event we can defer
 * and replay from our own button (the browser no longer shows an automatic
 * banner on Android). Safari fires nothing — installing there is always manual:
 * iOS/iPadOS use Share → "Add to Home Screen", macOS (Sonoma / Safari 17+) uses
 * File → "Add to Dock". We detect each and show the matching instructions.
 *
 * The raw event can fire before React mounts, so main.tsx captures it onto
 * `window.__hubInstallPrompt` and dispatches `hub:can-install`; this hook
 * reads that cache and stays in sync.
 */
import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function getCachedPrompt(): BeforeInstallPromptEvent | null {
  return (
    (window as unknown as { __hubInstallPrompt?: BeforeInstallPromptEvent })
      .__hubInstallPrompt ?? null
  );
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS reports as Mac but is touch-capable.
    (ua.includes("Mac") && "ontouchend" in document)
  );
}

/**
 * Desktop Safari on macOS. It installs web apps via File → "Add to Dock"
 * (macOS Sonoma / Safari 17+) and never fires `beforeinstallprompt`, so the
 * only thing we can do is detect it and show the manual steps. Chrome/Edge on
 * Mac also send "Safari/" in their UA but never "Version/" — that token is the
 * reliable discriminator. iPadOS (Mac UA + touch) is excluded; it's handled by
 * isIosDevice as the Share → Add to Home Screen flow instead.
 */
export function isMacSafari(): boolean {
  if (typeof navigator === "undefined" || typeof document === "undefined")
    return false;
  const ua = navigator.userAgent;
  const isMac = ua.includes("Macintosh") || ua.includes("Mac OS X");
  const isSafari =
    /Safari\//.test(ua) &&
    /Version\//.test(ua) &&
    !/Chrome|Chromium|CriOS|Edg|OPR|FxiOS|Firefox|Android/.test(ua);
  const isTouch = "ontouchend" in document; // iPadOS — already covered as iOS
  return isMac && isSafari && !isTouch;
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    () => getCachedPrompt(),
  );
  const [installed, setInstalled] = useState(isStandalonePwa());

  useEffect(() => {
    const onCanInstall = () => setDeferred(getCachedPrompt());
    const onInstalled = () => {
      setDeferred(null);
      setInstalled(true);
    };
    window.addEventListener("hub:can-install", onCanInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("hub:can-install", onCanInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const evt = deferred ?? getCachedPrompt();
    if (!evt) return false;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    (window as unknown as { __hubInstallPrompt?: unknown }).__hubInstallPrompt =
      undefined;
    setDeferred(null);
    return outcome === "accepted";
  }, [deferred]);

  return {
    /** Android / desktop Chromium: a real install prompt is ready to replay. */
    canPrompt: !!deferred && !installed,
    /** Already launched as an installed app — nothing to offer. */
    installed,
    /** iOS/iPadOS Safari: manual Share → Add to Home Screen flow. */
    isIos: isIosDevice(),
    /** macOS Safari: manual File → Add to Dock flow (Sonoma / Safari 17+). */
    isMacSafari: isMacSafari(),
    promptInstall,
  };
}
