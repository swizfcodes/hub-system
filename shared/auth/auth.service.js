"use strict";

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const config = require("../../config/config");
const { withSharedContext } = require("../../config/db");
const {
  invalidatePermissionCache,
  getCachedPermissions,
  cachePermissions,
} = require("../../config/redis");
const auditService = require("../../shared/audit/audit.service");
const repo = require("./auth.repository");

async function login(email, password, ip = "") {
  return withSharedContext(async (client) => {
    const user = await repo.findUserByEmail(client, email);
    if (!user)
      throw Object.assign(new Error("Invalid credentials"), { status: 401 });

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw Object.assign(
        new Error(
          `Account locked until ${new Date(user.locked_until).toISOString()}`,
        ),
        { status: 423 },
      );
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const attempts = user.failed_login_attempts + 1;
      const lockUntil =
        attempts >= 10
          ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
          : null;
      await repo.incrementFailedLogins(client, {
        userId: user.user_id,
        attempts,
        lockUntil,
      });
      throw Object.assign(new Error("Invalid credentials"), { status: 401 });
    }

    if (!user.is_active)
      throw Object.assign(new Error("Account suspended"), { status: 403 });

    await repo.resetFailedLogins(client, { userId: user.user_id, ip });
    return buildSession(client, user);
  });
}

// PIN is low-entropy (6 digits), so it locks faster and for a fixed cooldown.
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MS = 15 * 60 * 1000;

// 24h × 3650 ≈ 10 years — a cost factor of 12 makes an offline brute force of a
// 6-digit space (1e6 guesses) take days even if the hash leaks; same cost we
// use for passwords.
const HASH_COST = 12;

/**
 * Log in with a 6-digit quick-login PIN instead of the password.
 * Verification mirrors password login but counts against a SEPARATE lockout so
 * a mistyped PIN never locks the account out of password login. All failure
 * paths return the same generic 401 so PIN-set state can't be probed.
 */
async function loginWithPin(email, pin, ip = "") {
  return withSharedContext(async (client) => {
    const user = await repo.findUserByEmail(client, email);
    const invalid = () =>
      Object.assign(new Error("Invalid credentials"), { status: 401 });

    if (!user || !user.pin_hash) throw invalid();

    if (user.pin_locked_until && new Date(user.pin_locked_until) > new Date()) {
      throw Object.assign(
        new Error("PIN temporarily locked. Sign in with your password."),
        { status: 423 },
      );
    }

    const valid = await bcrypt.compare(pin, user.pin_hash);
    if (!valid) {
      const attempts = (user.failed_pin_attempts || 0) + 1;
      const lockUntil =
        attempts >= PIN_MAX_ATTEMPTS
          ? new Date(Date.now() + PIN_LOCK_MS).toISOString()
          : null;
      await repo.incrementFailedPin(client, {
        userId: user.user_id,
        attempts,
        lockUntil,
      });
      if (lockUntil)
        throw Object.assign(
          new Error("Too many incorrect PINs. Sign in with your password."),
          { status: 423 },
        );
      throw invalid();
    }

    if (!user.is_active)
      throw Object.assign(new Error("Account suspended"), { status: 403 });

    await repo.resetFailedPin(client, user.user_id);
    await repo.resetFailedLogins(client, { userId: user.user_id, ip });
    return buildSession(client, user);
  });
}

/** Issue tokens + the standard user payload. Shared by password and PIN login. */
async function buildSession(client, user) {
  const { accessToken, refreshToken } = await issueTokens(client, user);
  return {
    accessToken,
    refreshToken,
    user: {
      user_id: user.user_id,
      role_id: user.role_id,
      email: user.email,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      current_business: user.default_business,
      permitted_businesses: user.permitted_businesses,
      default_business: user.default_business,
      force_password_reset: user.force_password_reset,
      role: user.role_name,
    },
  };
}

/**
 * Set or replace the quick-login PIN. Requires the current password — this is a
 * sensitive credential change, so a hijacked but unprivileged session can't add
 * a backdoor PIN. `pin` must be exactly 6 digits (also enforced at the route).
 */
async function setPin(userId, currentPassword, pin) {
  if (!/^\d{6}$/.test(String(pin || "")))
    throw Object.assign(new Error("PIN must be 6 digits"), { status: 400 });

  return withSharedContext(async (client) => {
    const row = await repo.findPasswordHash(client, userId);
    if (!row) throw Object.assign(new Error("User not found"), { status: 404 });

    const valid = await bcrypt.compare(currentPassword, row.password_hash);
    if (!valid)
      throw Object.assign(new Error("Current password incorrect"), {
        status: 400,
      });

    const hash = await bcrypt.hash(pin, HASH_COST);
    await repo.setPinHash(client, { userId, hash });
    return { pinSet: true };
  });
}

async function removePin(userId) {
  return withSharedContext(async (client) => {
    await repo.clearPin(client, userId);
    return { pinSet: false };
  });
}

async function getPinStatus(userId) {
  return withSharedContext(async (client) => {
    const row = await repo.findPinStatus(client, userId);
    return { pinSet: !!row?.pin_set, pinSetAt: row?.pin_set_at || null };
  });
}

async function issueTokens(client, user) {
  const jti = crypto.randomUUID();
  const accessToken = jwt.sign(
    {
      user_id: user.user_id,
      role_id: user.role_id,
      current_business: user.default_business,
      jti,
    },
    config.app.jwtSecret,
    { expiresIn: config.app.jwtExpiry },
  );

  const rawRefresh = crypto.randomBytes(64).toString("hex");
  const hashRefresh = crypto
    .createHash("sha256")
    .update(rawRefresh)
    .digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await repo.insertRefreshToken(client, {
    userId: user.user_id,
    tokenHash: hashRefresh,
    expiresAt,
  });
  return { accessToken, refreshToken: rawRefresh };
}

async function refresh(rawRefreshToken) {
  return withSharedContext(async (client) => {
    const hash = crypto
      .createHash("sha256")
      .update(rawRefreshToken)
      .digest("hex");
    const token = await repo.findRefreshToken(client, hash);

    if (!token || token.revoked_at || new Date(token.expires_at) < new Date()) {
      throw Object.assign(new Error("Invalid or expired refresh token"), {
        status: 401,
      });
    }

    await repo.revokeRefreshToken(client, token.token_id);
    return issueTokens(client, {
      user_id: token.user_id,
      role_id: token.role_id,
      default_business: token.default_business,
    });
  });
}

async function logout(userId, rawRefreshToken) {
  return withSharedContext(async (client) => {
    if (rawRefreshToken) {
      const hash = crypto
        .createHash("sha256")
        .update(rawRefreshToken)
        .digest("hex");
      await repo.revokeRefreshTokenByHash(client, { hash, userId });
    }
    await repo.deleteUserSessions(client, userId);
  });
}

async function switchBusiness(userId, business) {
  if (!require("../../config/businesses").isValidBusiness(business))
    throw Object.assign(new Error(`Invalid business: ${business}`), {
      status: 400,
    });

  return withSharedContext(async (client) => {
    const user = await repo.findUserPermissions(client, userId);
    if (!user || !user.permitted_businesses.includes(business))
      throw Object.assign(new Error("Not permitted for this business"), {
        status: 403,
      });

    const jti = crypto.randomUUID();
    const roleRow = await repo.findRoleForBusiness(client, {
      userId,
      business,
    });
    const accessToken = jwt.sign(
      {
        user_id: userId,
        role_id: roleRow?.role_id,
        current_business: business,
        jti,
      },
      config.app.jwtSecret,
      { expiresIn: config.app.jwtExpiry },
    );
    return { accessToken, current_business: business };
  });
}

async function getMe(userId) {
  return withSharedContext(async (client) => {
    const profile = await repo.findUserProfile(client, userId);
    if (!profile)
      throw Object.assign(new Error("User not found"), { status: 404 });
    return profile;
  });
}

async function updateMyProfile(userId, { display_name }) {
  const name = typeof display_name === "string" ? display_name.trim() : "";
  if (!name)
    throw Object.assign(new Error("Display name is required"), { status: 400 });
  if (name.length > 120)
    throw Object.assign(new Error("Display name is too long"), { status: 400 });

  return withSharedContext(async (client) => {
    const updated = await repo.updateMyDisplayName(client, {
      userId,
      displayName: name,
    });
    if (!updated)
      throw Object.assign(new Error("No profile linked to this account"), {
        status: 404,
      });
    return repo.findUserProfile(client, userId);
  });
}

// ── Navigation preferences ────────────────────────────────

// Validate a nav list: array of short string keys, deduped, max 10.
// Module-key existence is enforced client-side against HUB_MODULES;
// unknown keys are harmless (ignored at render) so we only sanity-check.
function sanitizeNavList(list) {
  if (!Array.isArray(list)) {
    throw Object.assign(new Error("pinned must be an array of module keys"), {
      status: 400,
    });
  }
  const cleaned = [
    ...new Set(
      list.filter(
        (k) => typeof k === "string" && k.length > 0 && k.length <= 40,
      ),
    ),
  ];
  if (cleaned.length > 10) {
    throw Object.assign(new Error("pinned cannot exceed 10 modules"), {
      status: 400,
    });
  }
  return cleaned;
}

async function getMyNav(userId) {
  return withSharedContext(async (client) => {
    const [prefs, roleDefault] = await Promise.all([
      repo.findNavPrefs(client, userId),
      repo.findRoleDefaultNav(client, userId),
    ]);
    return {
      pinned: prefs?.pinned ?? null,
      role_default: roleDefault,
    };
  });
}

async function setMyNav(userId, pinned) {
  const cleaned = sanitizeNavList(pinned);
  return withSharedContext(async (client) => {
    await repo.upsertNavPrefs(client, { userId, pinned: cleaned });
    return { pinned: cleaned };
  });
}

async function resetMyNav(userId) {
  return withSharedContext(async (client) => {
    await repo.deleteNavPrefs(client, userId);
    return { pinned: null };
  });
}

async function changePassword(userId, currentPassword, newPassword) {
  return withSharedContext(async (client) => {
    const row = await repo.findPasswordHash(client, userId);
    if (!row) throw Object.assign(new Error("User not found"), { status: 404 });

    const valid = await bcrypt.compare(currentPassword, row.password_hash);
    if (!valid)
      throw Object.assign(new Error("Current password incorrect"), {
        status: 400,
      });

    const hash = await bcrypt.hash(newPassword, 12);
    await repo.updatePasswordHash(client, { userId, hash });
    await repo.revokeAllRefreshTokens(client, userId);

    const roleRow = await repo.findUserRole(client, userId);
    if (roleRow) await invalidatePermissionCache(roleRow.role_id);
  });
}

async function listActiveSessions(userId) {
  return withSharedContext(async (client) => {
    const { rows } = await client.query(
      `SELECT token_id, created_at, expires_at
       FROM shared.refresh_tokens
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC`,
      [userId],
    );
    return { data: rows };
  });
}

async function revokeSession(userId, tokenId, actingUser) {
  return withSharedContext(async (client) => {
    const { rowCount } = await client.query(
      `UPDATE shared.refresh_tokens SET revoked_at = now()
       WHERE token_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [tokenId, userId],
    );
    if (!rowCount)
      throw Object.assign(new Error("Session not found"), { status: 404 });
    await auditService.log(client, {
      userId: actingUser.user_id,
      userName: actingUser.display_name,
      business: actingUser.current_business,
      module: "security",
      action: "session_revoked",
      table: "shared.refresh_tokens",
      metadata: { target_user_id: userId, token_id: tokenId },
    });
    return { revoked: true };
  });
}

async function revokeAllSessions(userId, actingUser) {
  return withSharedContext(async (client) => {
    await repo.revokeAllRefreshTokens(client, userId);
    await repo.deleteUserSessions(client, userId);
    await auditService.log(client, {
      userId: actingUser.user_id,
      userName: actingUser.display_name,
      business: actingUser.current_business,
      module: "security",
      action: "all_sessions_revoked",
      table: "shared.refresh_tokens",
      metadata: { target_user_id: userId },
    });
    return { revoked: true };
  });
}

/**
 * Return the flat permission list for a role_id.
 * Reuses the same Redis cache as the permissions middleware so there's no
 * extra DB hit if the middleware has already warmed the cache.
 */
async function getMyPermissions(roleId) {
  let permissions = await getCachedPermissions(roleId);
  if (!permissions) {
    await withSharedContext(async (client) => {
      const result = await client.query(
        `SELECT module, action, record_scope
         FROM shared.permissions
         WHERE role_id = $1`,
        [roleId],
      );
      permissions = result.rows;
    });
    await cachePermissions(roleId, permissions);
  }
  return permissions;
}

module.exports = {
  login,
  loginWithPin,
  setPin,
  removePin,
  getPinStatus,
  refresh,
  logout,
  switchBusiness,
  getMe,
  updateMyProfile,
  getMyNav,
  setMyNav,
  resetMyNav,
  changePassword,
  listActiveSessions,
  revokeSession,
  revokeAllSessions,
  getMyPermissions,
};
