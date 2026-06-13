// ── lib/passwordPolicy.ts ─────────────────────────────────────────────────────
// Single source of truth for the client-side password rules. Mirrors the
// backend policy in shared/auth/auth.routes.js (passwordPolicy): minimum 8
// characters, at least one uppercase letter and one number. The server is still
// the authority — this just gives instant inline feedback.

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULES_TEXT =
  "At least 8 characters, with an uppercase letter and a number";

export interface PasswordCheck {
  ok: boolean;
  /** Individual requirement results, handy for a checklist UI. */
  hasLength: boolean;
  hasUpper: boolean;
  hasNumber: boolean;
  /** First failing requirement as a human-readable message, or null when ok. */
  error: string | null;
}

export function checkPassword(pw: string): PasswordCheck {
  const hasLength = pw.length >= PASSWORD_MIN_LENGTH;
  const hasUpper = /[A-Z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);

  let error: string | null = null;
  if (!hasLength) error = `Must be at least ${PASSWORD_MIN_LENGTH} characters`;
  else if (!hasUpper) error = "Must contain an uppercase letter";
  else if (!hasNumber) error = "Must contain a number";

  return { ok: hasLength && hasUpper && hasNumber, hasLength, hasUpper, hasNumber, error };
}

export function isValidPassword(pw: string): boolean {
  return checkPassword(pw).ok;
}
