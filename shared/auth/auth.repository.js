"use strict";

// ─────────────────────────────────────────────────────────────
// Role resolution: a user's role can be assigned per business
// (e.g. 'diffusers') or globally ('*'). The invite flow assigns
// per-business roles, so login/refresh/profile MUST consider both —
// matching only '*' (the old behaviour) left every invited user with
// no role and therefore zero permissions. Exact business match wins
// over the wildcard.
// ─────────────────────────────────────────────────────────────

async function findUserByEmail(client, email) {
  const { rows } = await client.query(
    `SELECT u.user_id, u.email, u.password_hash, u.is_active, u.failed_login_attempts,
            u.locked_until, u.default_business, u.permitted_businesses,
            u.force_password_reset, u.staff_profile_id,
            r.role_id, r.role_name,
            c.display_name
    FROM shared.users u
    LEFT JOIN LATERAL (
      SELECT x.role_id FROM shared.user_roles x
      WHERE x.user_id = u.user_id
        AND (x.business = u.default_business OR x.business = '*')
      ORDER BY (x.business = '*') ASC
      LIMIT 1
    ) ur ON true
    LEFT JOIN shared.roles r ON r.role_id = ur.role_id
    LEFT JOIN shared.contacts c ON c.contact_id = u.staff_profile_id
    WHERE u.email = $1 LIMIT 1`,
    [email],
  );
  return rows[0] || null;
}

async function incrementFailedLogins(client, { userId, attempts, lockUntil }) {
  await client.query(
    `UPDATE shared.users SET failed_login_attempts = $1, locked_until = $2 WHERE user_id = $3`,
    [attempts, lockUntil, userId],
  );
}

async function resetFailedLogins(client, { userId, ip }) {
  await client.query(
    `UPDATE shared.users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now(), last_login_ip = $2 WHERE user_id = $1`,
    [userId, ip],
  );
}

async function insertRefreshToken(client, { userId, tokenHash, expiresAt }) {
  await client.query(
    `INSERT INTO shared.refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt],
  );
}

async function findRefreshToken(client, hash) {
  const { rows } = await client.query(
    `SELECT rt.token_id, rt.user_id, rt.expires_at, rt.revoked_at,
            u.is_active, u.default_business, u.permitted_businesses,
            ur.role_id
     FROM shared.refresh_tokens rt
     JOIN shared.users u ON u.user_id = rt.user_id
     LEFT JOIN LATERAL (
       SELECT x.role_id FROM shared.user_roles x
       WHERE x.user_id = rt.user_id
         AND (x.business = u.default_business OR x.business = '*')
       ORDER BY (x.business = '*') ASC
       LIMIT 1
     ) ur ON true
     WHERE rt.token_hash = $1`,
    [hash],
  );
  return rows[0] || null;
}

async function revokeRefreshToken(client, tokenId) {
  await client.query(
    `UPDATE shared.refresh_tokens SET revoked_at = now() WHERE token_id = $1`,
    [tokenId],
  );
}

async function revokeRefreshTokenByHash(client, { hash, userId }) {
  await client.query(
    `UPDATE shared.refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND user_id = $2`,
    [hash, userId],
  );
}

async function deleteUserSessions(client, userId) {
  await client.query(`DELETE FROM shared.user_sessions WHERE user_id = $1`, [
    userId,
  ]);
}

async function findUserPermissions(client, userId) {
  const { rows } = await client.query(
    `SELECT permitted_businesses, default_business FROM shared.users WHERE user_id = $1`,
    [userId],
  );
  return rows[0] || null;
}

async function findRoleForBusiness(client, { userId, business }) {
  const { rows } = await client.query(
    `SELECT role_id FROM shared.user_roles
     WHERE user_id = $1 AND (business = $2 OR business = '*')
     ORDER BY (business = '*') ASC
     LIMIT 1`,
    [userId, business],
  );
  return rows[0] || null;
}

async function findUserProfile(client, userId) {
  const { rows } = await client.query(
    `SELECT u.user_id, u.email, u.default_business, u.permitted_businesses,
            sp.profile_id, sp.job_title, sp.department,
            c.display_name, c.primary_phone, c.avatar_url, c.contact_id,
            r.role_name
     FROM shared.users u
     LEFT JOIN shared.staff_profiles sp ON sp.profile_id = u.staff_profile_id
     LEFT JOIN shared.contacts c ON c.contact_id = sp.contact_id
     LEFT JOIN LATERAL (
       SELECT x.role_id FROM shared.user_roles x
       WHERE x.user_id = u.user_id
         AND (x.business = u.default_business OR x.business = '*')
       ORDER BY (x.business = '*') ASC
       LIMIT 1
     ) ur ON true
     LEFT JOIN shared.roles r ON r.role_id = ur.role_id
     WHERE u.user_id = $1`,
    [userId],
  );
  return rows[0] || null;
}

async function findPasswordHash(client, userId) {
  const { rows } = await client.query(
    `SELECT password_hash FROM shared.users WHERE user_id = $1`,
    [userId],
  );
  return rows[0] || null;
}

async function updatePasswordHash(client, { userId, hash }) {
  await client.query(
    `UPDATE shared.users SET password_hash = $1, force_password_reset = false, updated_at = now() WHERE user_id = $2`,
    [hash, userId],
  );
}

async function revokeAllRefreshTokens(client, userId) {
  await client.query(
    `UPDATE shared.refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}

async function findUserRole(client, userId) {
  const { rows } = await client.query(
    `SELECT role_id FROM shared.user_roles WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return rows[0] || null;
}

// ── Navigation preferences ────────────────────────────────
// Per-user pinned top-10; role default used as fallback.

async function findNavPrefs(client, userId) {
  const { rows } = await client.query(
    `SELECT pinned FROM shared.user_nav_prefs WHERE user_id = $1`,
    [userId],
  );
  return rows[0] || null;
}

async function upsertNavPrefs(client, { userId, pinned }) {
  await client.query(
    `INSERT INTO shared.user_nav_prefs (user_id, pinned, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET pinned = $2, updated_at = now()`,
    [userId, pinned],
  );
}

async function deleteNavPrefs(client, userId) {
  await client.query(`DELETE FROM shared.user_nav_prefs WHERE user_id = $1`, [
    userId,
  ]);
}

// Role default_nav for the user's role at their default business
// (same role-resolution rule as findUserProfile).
async function findRoleDefaultNav(client, userId) {
  const { rows } = await client.query(
    `SELECT r.default_nav
     FROM shared.users u
     LEFT JOIN LATERAL (
       SELECT x.role_id FROM shared.user_roles x
       WHERE x.user_id = u.user_id
         AND (x.business = u.default_business OR x.business = '*')
       ORDER BY (x.business = '*') ASC
       LIMIT 1
     ) ur ON true
     LEFT JOIN shared.roles r ON r.role_id = ur.role_id
     WHERE u.user_id = $1`,
    [userId],
  );
  return rows[0]?.default_nav || null;
}

module.exports = {
  findUserByEmail,
  incrementFailedLogins,
  resetFailedLogins,
  insertRefreshToken,
  findRefreshToken,
  revokeRefreshToken,
  revokeRefreshTokenByHash,
  deleteUserSessions,
  findUserPermissions,
  findRoleForBusiness,
  findUserProfile,
  findPasswordHash,
  updatePasswordHash,
  revokeAllRefreshTokens,
  findUserRole,
  findNavPrefs,
  upsertNavPrefs,
  deleteNavPrefs,
  findRoleDefaultNav,
};
