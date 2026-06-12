"use strict";

const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { withSharedContext } = require("../../config/db");
const smtp = require("../../integrations/messaging/adapters/smtp");
const { renderEmail } = require("../../lib/email/render");
const auditService = require("../audit/audit.service");
const logger = require("../../config/logger");

// ─────────────────────────────────────────────────────────────
// SELF-SERVICE PASSWORD RESET (OTP by email)
//
// Flow: POST /forgot-password → 6-digit OTP emailed →
//       POST /reset-password {email, otp, newPassword} → done.
//
// Security posture:
//   • Generic responses everywhere — requesting a reset for an unknown
//     email returns the SAME message as a known one (no enumeration).
//   • Only the SHA-256 hash of the OTP is stored; raw code exists only
//     in the email.
//   • 10-minute expiry (DB default), single-use, max 5 verify attempts.
//   • One active OTP per user — a new request invalidates the old code.
//   • On success: ALL refresh tokens revoked (stolen sessions die),
//     failed-login counter cleared, audit logged, notice emailed.
//   • Routes share loginRateLimiter to slow brute force at the edge.
// ─────────────────────────────────────────────────────────────

const BCRYPT_COST = 12;
const MAX_ATTEMPTS = 5;

function hashOtp(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

function generateOtp() {
  // crypto-random 6 digits, never starts with 0 ambiguity issues
  return String(crypto.randomInt(100000, 1000000));
}

const GENERIC_MESSAGE =
  "If an account exists for that email, a reset code has been sent.";

/**
 * Step 1 — request a reset code.
 * ALWAYS resolves with the generic message, regardless of whether the
 * email matches an account, is inactive, or the send fails — callers
 * (and attackers) learn nothing.
 */
async function requestReset(email, ip = "") {
  const normalised = String(email || "").trim().toLowerCase();

  try {
    await withSharedContext(async (client) => {
      const {
        rows: [user],
      } = await client.query(
        `SELECT user_id, email, is_active, default_business
         FROM shared.users WHERE email = $1`,
        [normalised],
      );
      if (!user || !user.is_active) {
        logger.info(
          `[password-reset] request for unknown/inactive email: ${normalised}`,
        );
        return; // generic response — say nothing
      }

      // One active code per user: kill any previous request.
      await client.query(
        `DELETE FROM shared.password_reset_otps
         WHERE user_id = $1 AND used_at IS NULL`,
        [user.user_id],
      );

      const otp = generateOtp();
      await client.query(
        `INSERT INTO shared.password_reset_otps (user_id, otp_hash, request_ip)
         VALUES ($1, $2, $3)`,
        [user.user_id, hashOtp(otp), ip || null],
      );

      const { subject, html } = renderEmail(
        "password_reset_otp",
        user.default_business,
        { otp },
      );
      await smtp.sendChannelMessage({
        to: user.email,
        subject,
        html,
        business: user.default_business,
      });

      logger.info(`[password-reset] OTP sent to ${user.email}`);
    });
  } catch (err) {
    // Even infrastructure errors must not leak account existence.
    logger.error(`[password-reset] request failed for ${normalised}`, err);
  }

  return { message: GENERIC_MESSAGE };
}

/**
 * Step 2 — verify the OTP and set the new password.
 * Errors are deliberately uniform ("Invalid or expired code") so the
 * response never reveals WHICH part failed.
 */
async function resetPassword(email, otp, newPassword, ip = "") {
  const normalised = String(email || "").trim().toLowerCase();
  const invalid = () =>
    Object.assign(new Error("Invalid or expired code"), { status: 400 });

  return withSharedContext(async (client) => {
    const {
      rows: [user],
    } = await client.query(
      `SELECT user_id, email, is_active, default_business
       FROM shared.users WHERE email = $1`,
      [normalised],
    );
    if (!user || !user.is_active) throw invalid();

    // Latest unused code for this user, locked against parallel guesses.
    const {
      rows: [row],
    } = await client.query(
      `SELECT reset_id, otp_hash, attempts, expires_at
       FROM shared.password_reset_otps
       WHERE user_id = $1 AND used_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [user.user_id],
    );
    if (!row) throw invalid();
    if (new Date(row.expires_at) < new Date()) throw invalid();
    if (row.attempts >= MAX_ATTEMPTS) throw invalid();

    if (row.otp_hash !== hashOtp(otp)) {
      await client.query(
        `UPDATE shared.password_reset_otps SET attempts = attempts + 1
         WHERE reset_id = $1`,
        [row.reset_id],
      );
      throw invalid();
    }

    // ── Verified — burn the code, set the password ────────────
    await client.query(
      `UPDATE shared.password_reset_otps SET used_at = now()
       WHERE reset_id = $1`,
      [row.reset_id],
    );

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await client.query(
      `UPDATE shared.users
       SET password_hash = $1,
           force_password_reset = false,
           failed_login_attempts = 0,
           updated_at = now()
       WHERE user_id = $2`,
      [passwordHash, user.user_id],
    );

    // Kill every active session — a reset must evict anyone holding a
    // stolen token, and the legitimate user is about to log in fresh.
    await client.query(
      `UPDATE shared.refresh_tokens SET revoked_at = now()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [user.user_id],
    );

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.email,
      business: user.default_business,
      module: "security",
      action: "password_reset_self_service",
      table: "shared.users",
      recordId: user.user_id,
      metadata: { ip },
    });

    // Best-effort security notice — never block the reset on SMTP.
    try {
      const { subject, html } = renderEmail(
        "password_changed",
        user.default_business,
        { when: new Date().toUTCString() },
      );
      await smtp.sendChannelMessage({
        to: user.email,
        subject,
        html,
        business: user.default_business,
      });
    } catch (err) {
      logger.warn(
        `[password-reset] change-notice email failed for ${user.email}: ${err.message}`,
      );
    }

    logger.info(`[password-reset] password reset for ${user.email}`);
    return { message: "Password reset. You can now sign in." };
  });
}

module.exports = { requestReset, resetPassword };
