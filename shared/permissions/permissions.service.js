"use strict";

const { withSharedContext } = require("../../config/db");
const { invalidatePermissionCache } = require("../../config/redis");
const businesses = require("../../config/businesses");
const auditService = require("../audit/audit.service");
const logger = require("../../config/logger");
const repo = require("./permissions.repository");

// ─────────────────────────────────────────────────────────────
// shared/permissions/permissions.service
//
// The business logic for the permission management API. Three
// responsibilities the repository layer can't take on:
//
//   1. CACHE INVALIDATION — the auth middleware caches permissions
//      per role_id in Redis for 5 minutes. Every grant/revoke MUST
//      flush the cache for that role, otherwise existing user
//      sessions keep reading stale permissions until TTL expiry.
//      Every mutation in this file ends with invalidatePermissionCache.
//
//   2. SYSTEM ROLE PROTECTION — the seven seeded roles (owner,
//      manager, accountant, sales, stock_manager, logistics, staff)
//      have is_system=true. We allow editing their permissions but
//      block destructive bulk-replace on owner specifically — an
//      admin should never be able to lock the owner out of settings.
//
//   3. SELF-LOCKOUT GUARDRAILS — if the acting user is editing
//      their OWN role's settings permissions, we refuse the
//      operation. They'd lock themselves out of this very screen.
//
// All endpoints require settings.approve (set in routes).
// ─────────────────────────────────────────────────────────────

// Looked up by role_name = 'owner' on first call and cached for the
// life of the process. Doing it this way means the owner role can be
// reseeded with a fresh UUID (see migration 000035) without code
// edits, and a corrupted DB where the row is missing fails loudly
// rather than silently using a wrong literal.
let _ownerRoleId = null;
async function getOwnerRoleId() {
  if (_ownerRoleId) return _ownerRoleId;
  return withSharedContext(async (client) => {
    const { rows } = await client.query(
      `SELECT role_id FROM shared.roles
        WHERE role_name = 'owner' AND business IS NULL
        LIMIT 1`,
    );
    if (!rows.length) {
      throw new Error(
        "System role 'owner' not found in shared.roles — " +
          "run migration 000022 (seed) and 000035 (reseed) first.",
      );
    }
    _ownerRoleId = rows[0].role_id;
    return _ownerRoleId;
  });
}

const VALID_ACTIONS = ["view", "create", "edit", "delete", "approve", "export"];
const VALID_SCOPES = ["all", "own", "team"];

// ── READ ENDPOINTS ───────────────────────────────────────────

async function getCatalogue() {
  return withSharedContext(async (client) => {
    const modules = await repo.listModuleCatalogue(client);
    return {
      modules,
      valid_actions: VALID_ACTIONS,
      valid_scopes: VALID_SCOPES,
    };
  });
}

async function listRoles({ business = null } = {}) {
  return withSharedContext(async (client) => {
    const data = await repo.listRoles(client, { business });
    return { data };
  });
}

async function getRoleWithPermissions(roleId) {
  return withSharedContext(async (client) => {
    const role = await repo.findRoleById(client, roleId);
    if (!role) {
      throw Object.assign(new Error("Role not found"), { status: 404 });
    }
    const permissions = await repo.listPermissionsForRole(client, roleId);
    return { ...role, permissions };
  });
}

// ── ROLE CRUD ────────────────────────────────────────────────

/**
 * Create a custom role. Optionally per-business (so the same install
 * can have "Manager" (global system role), "Jewelry Senior Manager"
 * (jewelry-only), and "Faitlynhair Sales Lead" (faitlynhair-only) as
 * distinct rows.
 *
 * cloneFromRoleId — if provided, copies every permission row from
 * that template role into the new role in the same transaction. Use
 * case: "Create Brand-A Manager from the system Manager template,
 * then customise from there." Saves the frontend from issuing dozens
 * of grant calls one at a time.
 */
async function createRole(
  user,
  { role_name, business, description, clone_from_role_id },
) {
  if (!role_name || typeof role_name !== "string") {
    throw Object.assign(new Error("role_name is required"), { status: 400 });
  }
  if (business && !businesses.isValidBusiness(business)) {
    throw Object.assign(new Error(`Unknown business: ${business}`), {
      status: 400,
    });
  }

  return withSharedContext(async (client) => {
    // Reject duplicates: same role_name + same business scope
    const existing = await repo.findRoleByName(
      client,
      role_name,
      business || null,
    );
    if (existing) {
      throw Object.assign(
        new Error(
          `Role "${role_name}" already exists${business ? ` for ${business}` : " globally"}`,
        ),
        { status: 409 },
      );
    }

    // Validate template if cloning
    let template = null;
    if (clone_from_role_id) {
      template = await repo.findRoleById(client, clone_from_role_id);
      if (!template) {
        throw Object.assign(
          new Error(`Template role ${clone_from_role_id} not found`),
          { status: 400 },
        );
      }
    }

    await client.query("BEGIN");
    try {
      const role = await repo.insertRole(client, {
        roleName: role_name,
        business,
        description,
      });

      // Clone permissions from template if requested
      let permissions = [];
      if (template) {
        const sourcePerms = await repo.listPermissionsForRole(
          client,
          clone_from_role_id,
        );
        for (const p of sourcePerms) {
          const row = await repo.grantPermission(client, {
            roleId: role.role_id,
            module: p.module,
            action: p.action,
            recordScope: p.record_scope,
            hiddenFields: p.hidden_fields,
          });
          permissions.push(row);
        }
      }

      await client.query("COMMIT");

      await auditService.log(client, {
        userId: user.user_id,
        userName: user.display_name || "admin",
        business: business || "*",
        module: "settings",
        action: "create",
        table: "shared.roles",
        recordId: role.role_id,
        after: {
          ...role,
          cloned_from: template?.role_name,
          permission_count: permissions.length,
        },
        metadata: { sensitive: true },
      });

      logger.info(
        `[permissions] created role ${role.role_name}` +
          `${business ? ` (business: ${business})` : ""}` +
          `${template ? ` cloned from ${template.role_name}` : ""}`,
      );

      return { ...role, permissions };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

async function updateRole(user, roleId, { role_name, description }) {
  return withSharedContext(async (client) => {
    const existing = await repo.findRoleById(client, roleId);
    if (!existing) {
      throw Object.assign(new Error("Role not found"), { status: 404 });
    }
    if (existing.is_system) {
      throw Object.assign(
        new Error(
          "System roles cannot be renamed. Create a custom role with " +
            "different attributes instead.",
        ),
        { status: 400 },
      );
    }

    // If renaming, check for collision in the same business scope
    if (role_name && role_name !== existing.role_name) {
      const collision = await repo.findRoleByName(
        client,
        role_name,
        existing.business,
      );
      if (collision) {
        throw Object.assign(
          new Error(
            `Role "${role_name}" already exists` +
              `${existing.business ? ` for ${existing.business}` : " globally"}`,
          ),
          { status: 409 },
        );
      }
    }

    const updated = await repo.updateRole(client, roleId, {
      roleName: role_name,
      description,
    });
    if (!updated) {
      throw Object.assign(new Error("Role update failed"), { status: 500 });
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "admin",
      business: existing.business || "*",
      module: "settings",
      action: "edit",
      table: "shared.roles",
      recordId: roleId,
      before: existing,
      after: updated,
      metadata: { sensitive: true },
    });

    // Cache flush — role name appears in some derived contexts; safe
    // to flush even though permissions aren't directly affected.
    await invalidatePermissionCache(roleId);

    return updated;
  });
}

async function deleteRole(user, roleId) {
  return withSharedContext(async (client) => {
    const existing = await repo.findRoleById(client, roleId);
    if (!existing) {
      throw Object.assign(new Error("Role not found"), { status: 404 });
    }
    if (existing.is_system) {
      throw Object.assign(new Error("System roles cannot be deleted"), {
        status: 400,
      });
    }

    // Refuse if the role is currently assigned to anyone — forcing
    // the admin to reassign affected users first is much safer than
    // silently revoking their access.
    const userCount = await repo.countUsersForRole(client, roleId);
    if (userCount > 0) {
      throw Object.assign(
        new Error(
          `Cannot delete role "${existing.role_name}" — it is currently ` +
            `assigned to ${userCount} user(s). Reassign them first.`,
        ),
        { status: 400 },
      );
    }

    const ok = await repo.deleteRole(client, roleId);
    if (!ok) {
      throw Object.assign(new Error("Role delete failed"), { status: 500 });
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "admin",
      business: existing.business || "*",
      module: "settings",
      action: "delete",
      table: "shared.roles",
      recordId: roleId,
      before: existing,
      metadata: { sensitive: true },
    });

    await invalidatePermissionCache(roleId);

    return { deleted: true };
  });
}

// ── VALIDATION HELPERS ───────────────────────────────────────

function assertValidAction(action) {
  if (!VALID_ACTIONS.includes(action)) {
    throw Object.assign(
      new Error(
        `Invalid action '${action}'. Allowed: ${VALID_ACTIONS.join(", ")}`,
      ),
      { status: 400 },
    );
  }
}

function assertValidScope(scope) {
  if (!VALID_SCOPES.includes(scope)) {
    throw Object.assign(
      new Error(
        `Invalid record_scope '${scope}'. Allowed: ${VALID_SCOPES.join(", ")}`,
      ),
      { status: 400 },
    );
  }
}

/**
 * Block the acting user from editing settings permissions on their
 * own role. They'd revoke their own access to this very endpoint and
 * be unable to undo it without going to the database directly.
 *
 * Owners (is_system=true on the owner role) get special treatment:
 * even when acting on themselves, owner can still grant/revoke on
 * their own role — there's no way to recover from a locked-out
 * owner besides direct DB access anyway, and over-restricting them
 * causes operational pain. The actual brake is in assertOwnerSafe:
 * we never let anyone revoke owner.settings.approve specifically.
 */
async function assertNotSelfLockout(user, targetRoleId, module, action) {
  if (module !== "settings") return;
  if (action !== "approve" && action !== "edit") return;
  // The auth middleware puts role_id (singular) on req.user.
  // If the acting user IS a member of this role, the operation
  // would affect their own access on the next request.
  const actingOnSelf = user.role_id === targetRoleId;
  if (!actingOnSelf) return;
  // Owner is allowed — see comment above.
  if (targetRoleId === (await getOwnerRoleId())) return;

  throw Object.assign(
    new Error(
      `Refusing to ${action === "approve" ? "remove approval rights" : "edit"} ` +
        `on your own role — this would lock you out of this screen. ` +
        `Have another admin make this change.`,
    ),
    { status: 400 },
  );
}

/**
 * Owner role must always retain settings.approve so the install can
 * always recover from a permissions mistake. If we let anyone revoke
 * this permission, a misclick could brick the system.
 */
async function assertOwnerSafe(roleId, module, action) {
  if (roleId !== (await getOwnerRoleId())) return;
  if (module === "settings" && action === "approve") {
    throw Object.assign(
      new Error(
        "Cannot revoke settings.approve from the owner role — " +
          "the owner is the recovery path for permission mistakes.",
      ),
      { status: 400 },
    );
  }
}

// ── GRANT ────────────────────────────────────────────────────

async function grant(
  user,
  roleId,
  { module, action, record_scope = "all", hidden_fields = [] },
) {
  assertValidAction(action);
  assertValidScope(record_scope);

  return withSharedContext(async (client) => {
    const role = await repo.findRoleById(client, roleId);
    if (!role) {
      throw Object.assign(new Error("Role not found"), { status: 404 });
    }

    const before = await repo.findPermission(client, roleId, module, action);
    const row = await repo.grantPermission(client, {
      roleId,
      module,
      action,
      recordScope: record_scope,
      hiddenFields: hidden_fields,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "admin",
      // Permission management isn't business-scoped — these are
      // global role definitions. Use '*' to mark "applies to all
      // businesses" in the audit feed.
      business: "*",
      module: "settings",
      action: before ? "edit" : "create",
      table: "shared.permissions",
      recordId: row.permission_id,
      before,
      after: row,
      metadata: { sensitive: true },
    });

    // CRITICAL — flush the role's cached permissions in Redis so the
    // new grant is visible on the next request rather than after the
    // 5-minute TTL.
    await invalidatePermissionCache(roleId);
    logger.info(
      `[permissions] ${before ? "updated" : "granted"} ${role.role_name} → ${module}.${action}`,
    );

    return row;
  });
}

// ── REVOKE ───────────────────────────────────────────────────

async function revoke(user, roleId, { module, action }) {
  assertValidAction(action);
  await assertOwnerSafe(roleId, module, action);
  await assertNotSelfLockout(user, roleId, module, action);

  return withSharedContext(async (client) => {
    const role = await repo.findRoleById(client, roleId);
    if (!role) {
      throw Object.assign(new Error("Role not found"), { status: 404 });
    }

    const before = await repo.findPermission(client, roleId, module, action);
    if (!before) {
      // Idempotent: revoking something that doesn't exist is a no-op
      // success, not an error. Avoids race-condition 404s if two
      // admins click revoke at the same time.
      return { revoked: false, message: "Permission was not granted" };
    }

    const ok = await repo.revokePermission(client, roleId, module, action);
    if (!ok) {
      throw Object.assign(new Error("Revoke failed"), { status: 500 });
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "admin",
      business: "*",
      module: "settings",
      action: "delete",
      table: "shared.permissions",
      recordId: before.permission_id,
      before,
      metadata: { sensitive: true },
    });

    await invalidatePermissionCache(roleId);
    logger.info(
      `[permissions] revoked ${role.role_name} → ${module}.${action}`,
    );

    return { revoked: true };
  });
}

// ── BULK REPLACE ─────────────────────────────────────────────

/**
 * Atomic replace of the entire permission set for a role. The frontend
 * sends the desired final state; we DELETE the existing rows and
 * INSERT the new ones inside a single transaction. If the transaction
 * rolls back (e.g. one of the actions is invalid), the role's
 * permissions are unchanged.
 *
 * Refused for the owner role — owner permissions are seeded and any
 * surgical edits should go through grant/revoke so the protection
 * checks (assertOwnerSafe) apply per row.
 */
async function bulkReplace(user, roleId, permissions) {
  if (!Array.isArray(permissions)) {
    throw Object.assign(new Error("permissions must be an array"), {
      status: 400,
    });
  }
  if (roleId === (await getOwnerRoleId())) {
    throw Object.assign(
      new Error(
        "Bulk replace is disabled for the owner role. " +
          "Use grant/revoke endpoints for targeted changes.",
      ),
      { status: 400 },
    );
  }

  // Validate every row before we touch the database.
  for (const p of permissions) {
    if (!p.module || !p.action) {
      throw Object.assign(
        new Error("Every permission must include module and action"),
        { status: 400 },
      );
    }
    assertValidAction(p.action);
    if (p.record_scope) assertValidScope(p.record_scope);
  }

  // Pre-flight: refuse if the acting user is bulk-replacing their own
  // role in a way that drops settings.approve.
  const actingOnSelf = user.role_id === roleId;
  if (actingOnSelf) {
    const stillHasSettingsApprove = permissions.some(
      (p) => p.module === "settings" && p.action === "approve",
    );
    if (!stillHasSettingsApprove) {
      throw Object.assign(
        new Error(
          "Refusing bulk replace — the new permission set would remove " +
            "your own settings.approve and lock you out of this screen.",
        ),
        { status: 400 },
      );
    }
  }

  return withSharedContext(async (client) => {
    const role = await repo.findRoleById(client, roleId);
    if (!role) {
      throw Object.assign(new Error("Role not found"), { status: 404 });
    }
    const before = await repo.listPermissionsForRole(client, roleId);

    await client.query("BEGIN");
    try {
      await repo.deleteAllPermissionsForRole(client, roleId);
      const inserted = [];
      for (const p of permissions) {
        const row = await repo.grantPermission(client, {
          roleId,
          module: p.module,
          action: p.action,
          recordScope: p.record_scope || "all",
          hiddenFields: p.hidden_fields || [],
        });
        inserted.push(row);
      }
      await client.query("COMMIT");

      await auditService.log(client, {
        userId: user.user_id,
        userName: user.display_name || "admin",
        business: "*",
        module: "settings",
        action: "edit",
        table: "shared.permissions",
        recordId: roleId,
        before: { permissions: before },
        after: { permissions: inserted },
        metadata: { sensitive: true },
      });

      await invalidatePermissionCache(roleId);
      logger.info(
        `[permissions] bulk replace ${role.role_name}: ` +
          `was ${before.length} rows, now ${inserted.length} rows`,
      );

      return { role_id: roleId, permissions: inserted };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

// ─────────────────────────────────────────────────────────────
// USER ACCESS MANAGEMENT
//
// Three concepts to manage per user:
//
//   1. permitted_businesses — array on shared.users. The businessContext
//      middleware blocks access to any business not in this list. Must
//      be set BEFORE any role grant for that business is useful.
//
//   2. default_business — single column on shared.users. The business
//      the user lands in after login. Must be a member of
//      permitted_businesses.
//
//   3. user_roles — composite-key rows (user_id, role_id, business).
//      One row per (user, business) pair gives them their role THERE.
//      Same user can be 'manager' at jewelry and 'accountant' at
//      diffusers via two separate rows.
//
// The setUserRoleAtBusiness function below ENFORCES one role per
// business — atomic delete-and-insert so there's no race window where
// the user is roleless during an update.
// ─────────────────────────────────────────────────────────────

/**
 * Read-only summary: everything about one user's access in one call.
 * Drives the "Permissions" admin screen for a user.
 */
async function getUserAccess(userId) {
  return withSharedContext(async (client) => {
    const user = await repo.findUserById(client, userId);
    if (!user) {
      throw Object.assign(new Error("User not found"), { status: 404 });
    }
    const roles = await repo.listUserRolesByUserId(client, userId);
    return {
      user_id: user.user_id,
      email: user.email,
      is_active: user.is_active,
      default_business: user.default_business,
      permitted_businesses: user.permitted_businesses || [],
      roles_by_business: roles,
    };
  });
}

async function updatePermittedBusinesses(user, userId, businessesList) {
  if (!Array.isArray(businessesList)) {
    throw Object.assign(new Error("permitted_businesses must be an array"), {
      status: 400,
    });
  }
  // Validate every entry against the dynamic business registry. '*'
  // is the wildcard for "all businesses, including future ones" and
  // is reserved for system-level owners only.
  for (const b of businessesList) {
    if (b === "*") continue;
    if (!businesses.isValidBusiness(b)) {
      throw Object.assign(new Error(`Unknown business: ${b}`), { status: 400 });
    }
  }

  return withSharedContext(async (client) => {
    const before = await repo.findUserById(client, userId);
    if (!before) {
      throw Object.assign(new Error("User not found"), { status: 404 });
    }

    // Self-lockout: a user removing all their own businesses would
    // be unable to log back in. Refuse — let another admin do it.
    if (user.user_id === userId && businessesList.length === 0) {
      throw Object.assign(
        new Error(
          "Refusing to remove all your own business access — " +
            "have another admin make this change.",
        ),
        { status: 400 },
      );
    }

    // If default_business is no longer in the new list, null it out
    // so the next login picks a valid one (the first business they
    // still have access to).
    let after;
    if (
      before.default_business &&
      !businessesList.includes(before.default_business) &&
      !businessesList.includes("*")
    ) {
      await repo.setDefaultBusiness(client, userId, null);
    }
    after = await repo.setPermittedBusinesses(client, userId, businessesList);

    // Cascading cleanup: any user_roles for businesses no longer
    // permitted should also be removed. Otherwise stale role rows
    // accumulate and the user_access view shows orphans.
    if (!businessesList.includes("*")) {
      const currentRoles = await repo.listUserRolesByUserId(client, userId);
      for (const r of currentRoles) {
        if (r.business !== "*" && !businessesList.includes(r.business)) {
          await repo.removeUserRoleAtBusiness(client, userId, r.business);
        }
      }
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "admin",
      business: "*",
      module: "settings",
      action: "edit",
      table: "shared.users",
      recordId: userId,
      before: { permitted_businesses: before.permitted_businesses },
      after: { permitted_businesses: after.permitted_businesses },
      metadata: { sensitive: true, field: "permitted_businesses" },
    });

    logger.info(
      `[permissions] user ${userId} permitted_businesses → ` +
        `[${(businessesList || []).join(", ")}]`,
    );

    return after;
  });
}

async function updateDefaultBusiness(user, userId, defaultBusiness) {
  if (defaultBusiness && !businesses.isValidBusiness(defaultBusiness)) {
    throw Object.assign(new Error(`Unknown business: ${defaultBusiness}`), {
      status: 400,
    });
  }

  return withSharedContext(async (client) => {
    const before = await repo.findUserById(client, userId);
    if (!before) {
      throw Object.assign(new Error("User not found"), { status: 404 });
    }

    // The chosen default must be in permitted_businesses (unless the
    // user has '*' — all-businesses access).
    const permitted = before.permitted_businesses || [];
    if (
      defaultBusiness &&
      !permitted.includes(defaultBusiness) &&
      !permitted.includes("*")
    ) {
      throw Object.assign(
        new Error(
          `default_business must be in the user's permitted_businesses ` +
            `(currently: [${permitted.join(", ")}])`,
        ),
        { status: 400 },
      );
    }

    const after = await repo.setDefaultBusiness(
      client,
      userId,
      defaultBusiness,
    );

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "admin",
      business: defaultBusiness || "*",
      module: "settings",
      action: "edit",
      table: "shared.users",
      recordId: userId,
      before: { default_business: before.default_business },
      after: { default_business: after.default_business },
      metadata: { sensitive: true, field: "default_business" },
    });

    return after;
  });
}

/**
 * Set the user's role at a specific business. Atomic — replaces any
 * existing role for that user at that business in a single transaction.
 * No race window where the user is roleless mid-update.
 */
async function setRoleAtBusiness(
  user,
  userId,
  business,
  { role_id, expires_at },
) {
  if (!businesses.isValidBusiness(business) && business !== "*") {
    throw Object.assign(new Error(`Unknown business: ${business}`), {
      status: 400,
    });
  }

  return withSharedContext(async (client) => {
    const targetUser = await repo.findUserById(client, userId);
    if (!targetUser) {
      throw Object.assign(new Error("User not found"), { status: 404 });
    }
    const role = await repo.findRoleById(client, role_id);
    if (!role) {
      throw Object.assign(new Error("Role not found"), { status: 404 });
    }

    // A brand-specific role can only be granted at its own business.
    // (System roles with role.business=NULL are usable anywhere.)
    if (role.business && role.business !== business) {
      throw Object.assign(
        new Error(
          `Role "${role.role_name}" is scoped to business ${role.business} ` +
            `and cannot be assigned at business ${business}.`,
        ),
        { status: 400 },
      );
    }

    // The target business must be in the user's permitted_businesses
    // (or they must have '*'). Granting a role at a business they
    // can't access is meaningless and confusing.
    const permitted = targetUser.permitted_businesses || [];
    if (
      business !== "*" &&
      !permitted.includes(business) &&
      !permitted.includes("*")
    ) {
      throw Object.assign(
        new Error(
          `User does not have ${business} in their permitted_businesses. ` +
            `Add the business first via PUT /users/:userId/permitted-businesses.`,
        ),
        { status: 400 },
      );
    }

    const beforeRoles = await repo.listUserRolesByUserId(client, userId);
    const previousAtBusiness = beforeRoles.find((r) => r.business === business);

    await client.query("BEGIN");
    try {
      await repo.setUserRoleAtBusiness(client, {
        userId,
        roleId: role_id,
        business,
        grantedBy: user.user_id,
        expiresAt: expires_at,
      });
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "admin",
      business,
      module: "settings",
      action: previousAtBusiness ? "edit" : "create",
      table: "shared.user_roles",
      recordId: userId,
      before: previousAtBusiness && {
        role_name: previousAtBusiness.role_name,
        business,
      },
      after: { role_name: role.role_name, business },
      metadata: { sensitive: true, target_user: userId },
    });

    logger.info(
      `[permissions] user ${userId} role at ${business}: ` +
        `${previousAtBusiness?.role_name || "(none)"} → ${role.role_name}`,
    );

    return { user_id: userId, business, role_id, role_name: role.role_name };
  });
}

async function removeRoleAtBusiness(user, userId, business) {
  return withSharedContext(async (client) => {
    const targetUser = await repo.findUserById(client, userId);
    if (!targetUser) {
      throw Object.assign(new Error("User not found"), { status: 404 });
    }
    const beforeRoles = await repo.listUserRolesByUserId(client, userId);
    const existing = beforeRoles.find((r) => r.business === business);

    const count = await repo.removeUserRoleAtBusiness(client, userId, business);

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "admin",
      business,
      module: "settings",
      action: "delete",
      table: "shared.user_roles",
      recordId: userId,
      before: existing && { role_name: existing.role_name, business },
      metadata: { sensitive: true, target_user: userId },
    });

    return { removed: count > 0 };
  });
}

module.exports = {
  getCatalogue,
  listRoles,
  getRoleWithPermissions,
  createRole,
  updateRole,
  deleteRole,
  grant,
  revoke,
  bulkReplace,
  // user access
  getUserAccess,
  updatePermittedBusinesses,
  updateDefaultBusiness,
  setRoleAtBusiness,
  removeRoleAtBusiness,
};
