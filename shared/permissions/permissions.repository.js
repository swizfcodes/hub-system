"use strict";

// ─────────────────────────────────────────────────────────────
// shared/permissions/permissions.repository
//
// SQL layer for the permission management API. All queries hit
// shared.permissions and shared.roles. Per the repository pattern,
// nothing here contains business logic — just reads and writes.
//
// The companion service layer (permissions.service.js) is where:
//   - cache invalidation happens
//   - system-role protection is enforced
//   - bulk operations are wrapped in transactions
// ─────────────────────────────────────────────────────────────

// ── ROLES ────────────────────────────────────────────────────

/**
 * List roles. Without a business filter: returns every role.
 * With a business filter: returns roles for THAT business plus
 * the global roles (business IS NULL). This is the right set for
 * the "roles available at jewelry" dropdown — system roles like
 * 'owner' and 'manager' are reusable templates plus whatever
 * brand-specific roles ("Brand-A Sales Lead") have been
 * created just for that brand.
 */
async function listRoles(client, { business = null } = {}) {
  if (business === null) {
    const { rows } = await client.query(
      `SELECT role_id, role_name, business, is_system, description, default_nav, created_at
       FROM shared.roles
       ORDER BY is_system DESC, business NULLS FIRST, role_name ASC`,
    );
    return rows;
  }
  const { rows } = await client.query(
    `SELECT role_id, role_name, business, is_system, description, default_nav, created_at
     FROM shared.roles
     WHERE business IS NULL OR business = $1
     ORDER BY is_system DESC, business NULLS FIRST, role_name ASC`,
    [business],
  );
  return rows;
}

async function findRoleById(client, roleId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT role_id, role_name, business, is_system, description, default_nav, created_at
     FROM shared.roles
     WHERE role_id = $1`,
    [roleId],
  );
  return row || null;
}

async function findRoleByName(client, roleName, business = null) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT role_id, role_name, business, is_system, description, default_nav, created_at
     FROM shared.roles
     WHERE role_name = $1 AND business IS NOT DISTINCT FROM $2
     LIMIT 1`,
    [roleName, business],
  );
  return row || null;
}

async function insertRole(client, { roleName, business, description, defaultNav }) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.roles (role_name, business, is_system, description, default_nav)
     VALUES ($1, $2, false, $3, $4)
     RETURNING role_id, role_name, business, is_system, description, default_nav, created_at`,
    [roleName, business || null, description || null, defaultNav || null],
  );
  return row;
}

async function updateRole(client, roleId, { roleName, description }) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.roles
     SET role_name   = COALESCE($2, role_name),
         description = COALESCE($3, description)
     WHERE role_id = $1 AND is_system = false
     RETURNING role_id, role_name, business, is_system, description, default_nav, created_at`,
    [roleId, roleName ?? null, description ?? null],
  );
  return row || null;
}

// default_nav may be set on ANY role, including system roles —
// it's a navigation preference, not a privilege change.
async function setRoleDefaultNav(client, roleId, defaultNav) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.roles
     SET default_nav = $2
     WHERE role_id = $1
     RETURNING role_id, role_name, business, is_system, description, default_nav, created_at`,
    [roleId, defaultNav],
  );
  return row || null;
}

async function deleteRole(client, roleId) {
  // The shared.user_roles FK has ON DELETE CASCADE so this also
  // removes any user-to-role assignments for this role.
  // shared.permissions has ON DELETE CASCADE too — all permission
  // rows for this role disappear automatically.
  const { rowCount } = await client.query(
    `DELETE FROM shared.roles WHERE role_id = $1 AND is_system = false`,
    [roleId],
  );
  return rowCount > 0;
}

/**
 * Used by users-of-this-role check before delete — refuse to delete
 * a role that's currently assigned to anyone.
 */
async function countUsersForRole(client, roleId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT COUNT(*)::int AS n FROM shared.user_roles WHERE role_id = $1`,
    [roleId],
  );
  return row.n;
}

// ── USER ACCESS ──────────────────────────────────────────────
// Manages a user's three pieces of access state:
//   1. shared.users.permitted_businesses — array of business keys
//      they can ever access (enforced by businessContext middleware)
//   2. shared.users.default_business — which business they land in
//      after login
//   3. shared.user_roles — which role they hold AT each business

async function findUserById(client, userId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT user_id, email, default_business, permitted_businesses,
            is_active, staff_profile_id
     FROM shared.users
     WHERE user_id = $1`,
    [userId],
  );
  return row || null;
}

async function listUserRolesByUserId(client, userId) {
  const { rows } = await client.query(
    `SELECT r.role_id, r.role_name, r.is_system, r.business AS role_business,
            ur.business, ur.granted_by, ur.granted_at, ur.expires_at
     FROM shared.user_roles ur
     JOIN shared.roles r ON r.role_id = ur.role_id
     WHERE ur.user_id = $1
     ORDER BY ur.business, r.role_name`,
    [userId],
  );
  return rows;
}

async function setPermittedBusinesses(client, userId, permittedBusinesses) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.users
     SET permitted_businesses = $2
     WHERE user_id = $1
     RETURNING user_id, default_business, permitted_businesses`,
    [userId, permittedBusinesses],
  );
  return row || null;
}

async function setDefaultBusiness(client, userId, defaultBusiness) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.users
     SET default_business = $2
     WHERE user_id = $1
     RETURNING user_id, default_business, permitted_businesses`,
    [userId, defaultBusiness],
  );
  return row || null;
}

/**
 * Atomically replace the user's role at a specific business. Deletes
 * any existing user_roles row for (userId, *, business) and inserts
 * the new one in a single transaction. The composite PK is
 * (user_id, role_id, business), so multiple roles at the same business
 * are theoretically possible — but in practice a user holds ONE role
 * per business at a time. This function enforces that 1-to-1 model.
 *
 * Caller MUST wrap in withSharedContext + BEGIN/COMMIT — this function
 * issues two queries that need to be transactional together.
 */
async function setUserRoleAtBusiness(
  client,
  { userId, roleId, business, grantedBy, expiresAt },
) {
  await client.query(
    `DELETE FROM shared.user_roles WHERE user_id = $1 AND business = $2`,
    [userId, business],
  );
  await client.query(
    `INSERT INTO shared.user_roles
        (user_id, role_id, business, granted_by, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, roleId, business, grantedBy, expiresAt || null],
  );
}

async function removeUserRoleAtBusiness(client, userId, business) {
  const { rowCount } = await client.query(
    `DELETE FROM shared.user_roles WHERE user_id = $1 AND business = $2`,
    [userId, business],
  );
  return rowCount;
}

// ── PERMISSIONS — READS ──────────────────────────────────────

async function listPermissionsForRole(client, roleId) {
  const { rows } = await client.query(
    `SELECT permission_id, module, action, record_scope, hidden_fields, created_at
     FROM shared.permissions
     WHERE role_id = $1
     ORDER BY module, action`,
    [roleId],
  );
  return rows;
}

/**
 * Catalogue of every (module, action) pair that exists in the system.
 * Discovered dynamically from the permissions table — every distinct
 * (module, action) seeded for any role surfaces here. This means the
 * frontend's permission matrix is always in sync with reality without
 * a hardcoded module list anywhere.
 *
 * Returns:
 *   [{ module: 'crm', actions: ['view','create','edit',...] }, ...]
 */
async function listModuleCatalogue(client) {
  const { rows } = await client.query(
    `SELECT module, ARRAY_AGG(DISTINCT action ORDER BY action) AS actions
     FROM shared.permissions
     GROUP BY module
     ORDER BY module`,
  );
  return rows;
}

/**
 * Find one specific (role, module, action) row. Used to check whether
 * a grant would be an insert or a no-op.
 */
async function findPermission(client, roleId, module, action) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT permission_id, role_id, module, action, record_scope, hidden_fields
     FROM shared.permissions
     WHERE role_id = $1 AND module = $2 AND action = $3`,
    [roleId, module, action],
  );
  return row || null;
}

// ── PERMISSIONS — WRITES ─────────────────────────────────────

/**
 * Grant a permission. If the (role, module, action) already exists,
 * update record_scope and hidden_fields to the new values. This makes
 * grant idempotent and also allows the same endpoint to be used for
 * "change scope" operations.
 */
async function grantPermission(
  client,
  { roleId, module, action, recordScope = "all", hiddenFields = [] },
) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.permissions (role_id, module, action, record_scope, hidden_fields)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (role_id, module, action)
     DO UPDATE SET record_scope = EXCLUDED.record_scope,
                   hidden_fields = EXCLUDED.hidden_fields
     RETURNING permission_id, module, action, record_scope, hidden_fields, created_at`,
    [roleId, module, action, recordScope, hiddenFields],
  );
  return row;
}

async function revokePermission(client, roleId, module, action) {
  const { rowCount } = await client.query(
    `DELETE FROM shared.permissions
     WHERE role_id = $1 AND module = $2 AND action = $3`,
    [roleId, module, action],
  );
  return rowCount > 0;
}

/**
 * Wipe every permission for a role. Used by the bulk-replace endpoint
 * — caller wraps this and the subsequent inserts in a transaction.
 */
async function deleteAllPermissionsForRole(client, roleId) {
  const { rowCount } = await client.query(
    `DELETE FROM shared.permissions WHERE role_id = $1`,
    [roleId],
  );
  return rowCount;
}

module.exports = {
  listRoles,
  findRoleById,
  findRoleByName,
  insertRole,
  updateRole,
  setRoleDefaultNav,
  deleteRole,
  countUsersForRole,
  listPermissionsForRole,
  listModuleCatalogue,
  findPermission,
  grantPermission,
  revokePermission,
  deleteAllPermissionsForRole,
  // user access management
  findUserById,
  listUserRolesByUserId,
  setPermittedBusinesses,
  setDefaultBusiness,
  setUserRoleAtBusiness,
  removeUserRoleAtBusiness,
};
