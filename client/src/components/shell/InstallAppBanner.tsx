/**
 * InstallAppBanner — a slim, dismissible "add to home screen" prompt.
 *
 * Android / desktop Chromium get a real [Install] button (we replay the
 * captured beforeinstallprompt). iOS Safari has no programmatic install, so we
 * show the Share → "Add to Home Screen" instructions instead. Hidden once the
 * app is installed (standalone) or the user dismisses it.
 */
import { useState } from "react";
import { Download, Share, X } from "lucide-react";
import { useInstallPrompt } from "@hooks/useInstallPrompt";
import { useBranding } from "@/providers/ThemeProvider";

const DISMISS_KEY = "orika_install_banner_dismissed";

export function InstallAppBanner() {
  const { canPrompt, installed, isIos, promptInstall } = useInstallPrompt();
  const { platform } = useBranding();
  const name = platform.product_name || "Hub";

  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Nothing to offer: already installed, dismissed, or a browser with neither
  // a deferred prompt nor the iOS manual path.
  if (installed || dismissed || (!canPrompt && !isIos)) return null;

  const close = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode — banner just reappears next session */
    }
    setDismissed(true);
  };

  return (
    <div className="flex items-center gap-3 border-b border-brand-accent/20 bg-brand-accent/10 px-4 py-2.5">
      {canPrompt ? (
        <Download className="h-4 w-4 shrink-0 text-brand-accent" />
      ) : (
        <Share className="h-4 w-4 shrink-0 text-brand-accent" />
      )}
      <p className="flex-1 text-[11px] leading-snug text-brand-cloud sm:text-xs">
        {canPrompt ? (
          <>
            Install {name} for a faster, full-screen experience with alerts.
          </>
        ) : (
          <>
            Install {name} on your iPhone: tap{" "}
            <span className="font-semibold text-brand-cream">Share</span> →{" "}
            <span className="font-semibold text-brand-cream">
              Add to Home Screen
            </span>
            .
          </>
        )}
      </p>
      {canPrompt && (
        <button
          onClick={() => {
            void promptInstall();
          }}
          className="shrink-0 rounded-lg bg-brand-accent px-3 py-1.5 text-[11px] font-semibold text-brand-black transition-all hover:brightness-110"
        >
          Install
        </button>
      )}
      <button
        onClick={close}
        className="shrink-0 text-brand-smoke transition-colors hover:text-brand-cream"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
