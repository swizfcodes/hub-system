/**
 * InstallAppBanner — a prominent, always-on "install this app" prompt.
 *
 * It shows on every visit (by force) and the ONLY things that hide it are:
 *   1. the app is already installed (running standalone), or
 *   2. the user explicitly taps the ✕.
 *
 * Dismissal is per-session (sessionStorage), so re-opening the site brings it
 * back — there is no permanent "never show again" state by design.
 *
 * The call-to-action adapts to the platform, and there is always a path so the
 * banner is never silently absent:
 *   - Android / desktop Chromium → a real [Install] button (replays the
 *     captured beforeinstallprompt).
 *   - iOS / iPadOS Safari → Share → "Add to Home Screen" instructions.
 *   - macOS Safari → File → "Add to Dock" instructions.
 *   - Anything else → generic "use your browser menu" guidance.
 */
import { useState } from "react";
import { Download, Share, X } from "lucide-react";
import { useInstallPrompt } from "@hooks/useInstallPrompt";
import { useBranding } from "@/providers/ThemeProvider";

// Per-session: only the ✕ hides it, and only until the next visit.
const DISMISS_KEY = "orika_install_banner_dismissed";

export function InstallAppBanner() {
  const { canPrompt, installed, isIos, isMacSafari, promptInstall } =
    useInstallPrompt();
  const { platform } = useBranding();
  const name = platform.product_name || "Hub";

  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Already running as an installed app, or dismissed this session — nothing to
  // do. Every other state falls through and renders: the banner is forced on.
  if (installed || dismissed) return null;

  const close = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode — it simply reappears, which is the intent */
    }
    setDismissed(true);
  };

  // iOS uses the Share sheet; everything else points at a download/install.
  const Icon = isIos && !canPrompt ? Share : Download;

  return (
    <div className="flex items-center gap-3 border-b border-brand-accent/30 bg-brand-accent/15 px-4 py-3">
      <Icon className="h-5 w-5 shrink-0 text-brand-accent" />
      <p className="flex-1 text-xs leading-snug text-brand-cream sm:text-sm">
        {canPrompt ? (
          <>Install {name} for a faster, full-screen app with alerts.</>
        ) : isIos ? (
          <>
            Install {name}: tap{" "}
            <span className="font-semibold text-brand-accent">Share</span> →{" "}
            <span className="font-semibold text-brand-accent">
              Add to Home Screen
            </span>
            .
          </>
        ) : isMacSafari ? (
          <>
            Install {name}: open the{" "}
            <span className="font-semibold text-brand-accent">File</span> menu in
            Safari →{" "}
            <span className="font-semibold text-brand-accent">Add to Dock</span>.
          </>
        ) : (
          <>
            Install {name}: open your browser menu and choose{" "}
            <span className="font-semibold text-brand-accent">Install</span> or{" "}
            <span className="font-semibold text-brand-accent">
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
          className="shrink-0 rounded-lg bg-brand-accent px-4 py-1.5 text-xs font-semibold text-brand-black transition-all hover:brightness-110"
        >
          Install
        </button>
      )}
      <button
        onClick={close}
        className="shrink-0 text-brand-smoke transition-colors hover:text-brand-cream"
        aria-label="Dismiss install prompt"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
