"use strict";

const { withSharedContext } = require("../config/db");
const { getCachedPermissions, cachePermissions } = require("../config/redis");

// ── loadPermissions(roleId) ───────────────────────────────
// Shared helper: returns the full permission list for a role,
// hitting Redis first then falling back to the DB.
async function loadPermissions(roleId) {
  let permissions = await getCachedPermissions(roleId);
  if (!permissions) {
    await withSharedContext(async (client) => {
      const result = await client.query(
        `SELECT module, action, record_scope, hidden_fields
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

// ── Hidden-field enforcement ──────────────────────────────
// A role permission can carry hidden_fields (e.g. ['cost_price',
// 'salary']). Until now these were stored and displayed in the role
// editor but never enforced. This wraps res.json once per request
// and deep-strips any matching keys from the response payload, so
// the rule applies uniformly across every module without per-route
// code.
function stripHiddenFields(value, hidden) {
  if (Array.isArray(value)) {
    for (const item of value) stripHiddenFields(item, hidden);
  } else if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (hidden.has(key)) {
        delete value[key];
      } else {
        stripHiddenFields(value[key], hidden);
      }
    }
  }
  return value;
}

function applyHiddenFieldFilter(req, res) {
  const fields = req.hiddenFields;
  if (!fields || fields.length === 0) return;
  if (res._hiddenFieldFilterApplied) return;
  res._hiddenFieldFilterApplied = true;
  const hidden = new Set(fields);
  const originalJson = res.json.bind(res);
  res.json = (body) => originalJson(stripHiddenFields(body, hidden));
}

// ── can(module, action) ───────────────────────────────────
// Passes if the user has exactly this module + action.
// Usage:  router.post('/invoices', verifyToken, businessContext, can('invoicing','create'), handler)
function can(module, action) {
  return async (req, res, next) => {
    try {
      const permissions = await loadPermissions(req.user.role_id);
      const perm = permissions.find(
        (p) => p.module === module && p.action === action,
      );
      if (!perm) {
        return res.status(403).json({
          message: `You do not have permission to ${action} in ${module}`,
        });
      }
      req.permissionScope = perm.record_scope;
      req.hiddenFields = perm.hidden_fields || [];
      applyHiddenFieldFilter(req, res);
      next();
    } catch (err) {
      next(err);
    }
  };
}

// ── canAny(checks) ────────────────────────────────────────
// Passes if the user has ANY of the listed {module, action} pairs.
// Useful for endpoints that aggregate data from multiple modules
// (e.g. the sales dashboard is unlocked by sales:view OR pos:view OR invoicing:view).
// Usage:  router.get('/sales', canAny([{module:'sales',action:'view'},{module:'pos',action:'view'}]), handler)
function canAny(checks) {
  return async (req, res, next) => {
    try {
      const permissions = await loadPermissions(req.user.role_id);
      const matched = checks.find(({ module, action }) =>
        permissions.some((p) => p.module === module && p.action === action),
      );
      if (!matched) {
        return res.status(403).json({
          message: "You do not have permission to access this resource",
        });
      }
      // Attach scope/hidden fields from the first matching permission
      const perm = permissions.find(
        (p) => p.module === matched.module && p.action === matched.action,
      );
      req.permissionScope = perm.record_scope;
      req.hiddenFields = perm.hidden_fields || [];
      applyHiddenFieldFilter(req, res);
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { can, canAny, loadPermissions };
