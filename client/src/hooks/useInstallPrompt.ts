/**
 * useInstallPrompt — surfaces "Add to Home Screen" on every platform.
 *
 * Android / desktop Chromium fire a `beforeinstallprompt` event we can defer
 * and replay from our own button (the browser no longer shows an automatic
 * banner on Android). iOS Safari fires nothing — installing there is a manual
 * Share → "Add to Home Screen", so we just detect it and show instructions.
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
    /** iOS Safari: install is the manual Share → Add to Home Screen flow. */
    isIos: isIosDevice(),
    promptInstall,
  };
}
