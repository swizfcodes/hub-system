/**
 * IosInstallHint — dismissible one-liner shown on iPhone/iPad Safari when
 * Hub is NOT installed: iOS only delivers web push to apps added to the
 * Home Screen, so this walks people to the install.
 */
import { useState } from "react";
import { Share, X } from "lucide-react";

const DISMISS_KEY = "orika_ios_install_hint_dismissed";

function isIos(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS reports as Mac but is touch-capable
    (ua.includes("Mac") && "ontouchend" in document)
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function IosInstallHint() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return true;
    }
  });

  if (dismissed || !isIos() || isStandalone()) return null;

  return (
    <div className="flex items-center gap-2 border-b border-brand-accent/20 bg-brand-accent/10 px-4 py-2">
      <Share className="h-3.5 w-3.5 shrink-0 text-brand-accent" />
      <p className="flex-1 text-[11px] leading-snug text-brand-cloud">
        Get message alerts on this iPhone: tap{" "}
        <span className="font-semibold text-brand-cream">Share</span> →{" "}
        <span className="font-semibold text-brand-cream">
          Add to Home Screen
        </span>
        , then open Hub from the new icon.
      </p>
      <button
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* private mode */
          }
          setDismissed(true);
        }}
        className="text-brand-smoke transition-colors hover:text-brand-cream"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
