// ── useSessionWatch ───────────────────────────────────────────────────────────
// Proactively detects an expired access token so the app can show a friendly
// "session expired" screen (see components/shared/SessionExpiredOverlay) rather
// than silently rotting into a blank/dark page that only a manual refresh fixes.
//
// Why this is needed: the access token lives 24h (JWT_EXPIRY). React Query is
// configured with refetchOnWindowFocus:false, so when a laptop wakes from sleep
// nothing re-validates the session — the first stale request later trips the
// 401 interceptor, but in the meantime the user is staring at dead UI. We close
// that gap by checking token expiry on tab-focus / visibility changes and on a
// slow interval, and flipping a flag the shell can render against.

import { useEffect, useState } from "react";
import { getToken, clearToken } from "@services/auth";
import { isTokenExpired } from "@lib/jwt";

// How often to re-check while the tab is open and visible.
const CHECK_INTERVAL_MS = 30_000;

export function useSessionWatch(): boolean {
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = () => {
      if (cancelled || expired) return;
      if (isTokenExpired(getToken())) {
        clearToken();
        setExpired(true);
      }
    };

    // Re-check whenever the tab regains visibility / focus — this is the
    // "returned from sleep or a long idle" path.
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    // Check once on mount too, in case we hydrated with an already-stale token.
    check();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [expired]);

  return expired;
}
