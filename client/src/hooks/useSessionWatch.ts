// ── useSessionWatch ───────────────────────────────────────────────────────────
// Proactively ends the session in two cases so the app can show a friendly
// "session expired" screen (see components/shared/SessionExpiredOverlay) rather
// than silently rotting into a blank/dark page that only a manual refresh fixes:
//
//   1. Token expiry — the access token's `exp` has passed (24h hard cap).
//   2. Inactivity   — no user interaction for IDLE_LIMIT_MS (2 hours).
//
// Why this is needed: React Query is configured with refetchOnWindowFocus:false,
// so when a laptop wakes from sleep nothing re-validates the session. We close
// that gap by checking on tab-focus / visibility changes and on a slow interval.
//
// The "last activity" timestamp lives in localStorage, which is the key to the
// sleep case: sleeping fires no events, but on wake we compare wall-clock time
// against the persisted timestamp, so a 2h+ nap correctly logs the user out.

import { useEffect, useRef, useState } from "react";
import { getToken, clearToken } from "@services/auth";
import { isTokenExpired } from "@lib/jwt";

// How often to re-check while the tab is open and visible.
const CHECK_INTERVAL_MS = 30_000;
// Log out after this much inactivity.
const IDLE_LIMIT_MS = 2 * 60 * 60 * 1000; // 2 hours
// Throttle persisted activity writes so we don't hit localStorage on every move.
const ACTIVITY_WRITE_THROTTLE_MS = 30_000;
const LAST_ACTIVITY_KEY = "orika_last_activity";

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
] as const;

function now(): number {
  return Date.now();
}

function readLastActivity(): number {
  const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : 0;
}

export function useSessionWatch(): boolean {
  const [expired, setExpired] = useState(false);
  const lastWriteRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    // Seed activity on mount so a freshly-loaded tab isn't instantly "idle".
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now()));
    lastWriteRef.current = now();

    const expire = () => {
      clearToken();
      setExpired(true);
    };

    const check = () => {
      if (cancelled || expired) return;
      if (isTokenExpired(getToken())) return expire();
      const last = readLastActivity();
      if (last && now() - last > IDLE_LIMIT_MS) return expire();
    };

    // Record activity (throttled) — resets the idle clock.
    const onActivity = () => {
      if (cancelled || expired) return;
      const t = now();
      if (t - lastWriteRef.current < ACTIVITY_WRITE_THROTTLE_MS) return;
      lastWriteRef.current = t;
      localStorage.setItem(LAST_ACTIVITY_KEY, String(t));
    };

    // Re-check whenever the tab regains visibility / focus — the "returned from
    // sleep or a long idle" path.
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    for (const evt of ACTIVITY_EVENTS)
      window.addEventListener(evt, onActivity, { passive: true });

    // Check once on mount too, in case we hydrated with an already-stale token.
    check();

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      for (const evt of ACTIVITY_EVENTS)
        window.removeEventListener(evt, onActivity);
    };
  }, [expired]);

  return expired;
}
