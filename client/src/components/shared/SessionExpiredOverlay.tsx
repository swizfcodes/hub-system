// ── SessionExpiredOverlay ─────────────────────────────────────────────────────
// Shown when the access token has expired (e.g. the laptop was asleep or the
// tab sat idle past the 24h token life). Replaces what used to be a bare,
// unrecoverable dark screen with a clear "you were signed out" message and a
// link back to the login page. Driven by hooks/useSessionWatch.ts.

import { LockKeyhole } from "lucide-react";
import { Button } from "@components/ui/Button";

export function SessionExpiredOverlay() {
  const goToLogin = () => {
    // Hard navigation so all in-memory React Query / store state is dropped and
    // the user starts from a clean slate on the login page.
    window.location.href = "/login";
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-brand-black/90 backdrop-blur-sm p-6"
    >
      <div className="w-full max-w-sm rounded-2xl border border-brand-graphite bg-brand-charcoal p-8 text-center shadow-card">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand-accent/15 text-brand-accent">
          <LockKeyhole className="h-6 w-6" />
        </div>
        <h2
          id="session-expired-title"
          className="font-display text-2xl text-brand-cream"
        >
          Session expired
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-brand-cloud">
          You were signed out after a period of inactivity. Please log in again
          to pick up where you left off.
        </p>
        <Button
          variant="gold"
          fullWidth
          className="mt-6"
          onClick={goToLogin}
        >
          Log in again
        </Button>
      </div>
    </div>
  );
}
