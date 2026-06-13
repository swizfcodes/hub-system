// ── lib/jwt.ts ────────────────────────────────────────────────────────────────
// Tiny, dependency-free helpers for reading the (untrusted) payload of the
// access token on the client. We NEVER trust these values for security — the
// backend re-verifies the signature on every request. We only use `exp` to
// proactively surface a friendly "session expired" screen instead of letting
// an expired token rot into a blank page (see hooks/useSessionWatch.ts).

interface JwtPayload {
  exp?: number; // seconds since epoch
  [k: string]: unknown;
}

/** Decode the JWT payload without verifying the signature. Returns null on any malformed input. */
export function decodeJwt(token: string | null | undefined): JwtPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * True when the token is present but its `exp` has passed (with a small skew
 * buffer). A missing/malformed token is treated as NOT-expired here so callers
 * can distinguish "logged out" (no token at all) from "session timed out"
 * (had a token, it expired). Tokens with no `exp` claim never report expired.
 */
export function isTokenExpired(token: string | null | undefined, skewSeconds = 10): boolean {
  const payload = decodeJwt(token);
  if (!payload || typeof payload.exp !== "number") return false;
  const nowSeconds = Date.now() / 1000;
  return payload.exp <= nowSeconds - skewSeconds;
}
