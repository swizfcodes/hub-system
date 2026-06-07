"use strict";

const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./permissions.service");

// ─────────────────────────────────────────────────────────────
// shared/permissions/permissions.routes
//
// Admin API for managing role permissions. Mounted under
// /api/settings/permissions in routes/index.js so it inherits the
// `protect` middleware chain (verifyToken → businessContext).
//
// All write endpoints require settings.approve — the highest-trust
// action in the most sensitive module. Read endpoints accept
// settings.view so role managers can browse the matrix even without
// approve rights.
//
// Endpoints:
//   GET    /catalogue                              — list modules + actions
//   GET    /roles?business=X                       — list roles (optional filter)
//   POST   /roles                                  — create custom role (per-business optional)
//   GET    /roles/:roleId                          — role details + its permissions
//   PATCH  /roles/:roleId                          — rename / update description
//   DELETE /roles/:roleId                          — delete custom role
//   PUT    /roles/:roleId/grant                    — grant one (module, action)
//   PUT    /roles/:roleId/revoke                   — revoke one (module, action)
//   POST   /roles/:roleId/bulk                     — replace whole permission set
//   GET    /users/:userId/access                   — user's permitted businesses + roles
//   PUT    /users/:userId/permitted-businesses     — set permitted business list
//   PUT    /users/:userId/default-business         — set login default business
//   PUT    /users/:userId/roles/:business          — set role at a specific business
//   DELETE /users/:userId/roles/:business          — remove role at a business
// ─────────────────────────────────────────────────────────────

// ── READ ─────────────────────────────────────────────────────

router.get("/catalogue", can("settings", "view"), async (req, res, next) => {
  try {
    res.json(await service.getCatalogue());
  } catch (err) {
    next(err);
  }
});

router.get("/roles", can("settings", "view"), async (req, res, next) => {
  try {
    // Optional ?business=jewelry filter — returns roles for that
    // business plus the global (business IS NULL) roles, which is
    // the right set for any "available roles" dropdown in a
    // business-scoped context.
    res.json(await service.listRoles({ business: req.query.business }));
  } catch (err) {
    next(err);
  }
});

router.get(
  "/roles/:roleId",
  param("roleId").isUUID(),
  validate,
  can("settings", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getRoleWithPermissions(req.params.roleId));
    } catch (err) {
      next(err);
    }
  },
);

// ── CREATE ROLE ──────────────────────────────────────────────

router.post(
  "/roles",
  body("role_name").isString().notEmpty(),
  body("business").optional({ nullable: true }).isString(),
  body("description").optional().isString(),
  body("clone_from_role_id").optional({ checkFalsy: true }).isUUID(),
  validate,
  can("settings", "approve"),
  async (req, res, next) => {
    try {
      res.status(201).json(await service.createRole(req.user, req.body));
    } catch (err) {
      next(err);
    }
  },
);

// ── UPDATE / RENAME ROLE ─────────────────────────────────────

router.patch(
  "/roles/:roleId",
  param("roleId").isUUID(),
  body("role_name").optional().isString(),
  body("description").optional().isString(),
  validate,
  can("settings", "approve"),
  async (req, res, next) => {
    try {
      res.json(await service.updateRole(req.user, req.params.roleId, req.body));
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE ROLE ──────────────────────────────────────────────

router.delete(
  "/roles/:roleId",
  param("roleId").isUUID(),
  validate,
  can("settings", "approve"),
  async (req, res, next) => {
    try {
      res.json(await service.deleteRole(req.user, req.params.roleId));
    } catch (err) {
      next(err);
    }
  },
);

// ── GRANT ────────────────────────────────────────────────────

router.put(
  "/roles/:roleId/grant",
  param("roleId").isUUID(),
  body("module").isString().notEmpty(),
  body("action").isString().notEmpty(),
  body("record_scope").optional().isIn(["all", "own", "team"]),
  body("hidden_fields").optional().isArray(),
  validate,
  can("settings", "approve"),
  async (req, res, next) => {
    try {
      const result = await service.grant(req.user, req.params.roleId, req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ── REVOKE ───────────────────────────────────────────────────

router.put(
  "/roles/:roleId/revoke",
  param("roleId").isUUID(),
  body("module").isString().notEmpty(),
  body("action").isString().notEmpty(),
  validate,
  can("settings", "approve"),
  async (req, res, next) => {
    try {
      const result = await service.revoke(
        req.user,
        req.params.roleId,
        req.body,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ── BULK REPLACE ─────────────────────────────────────────────

router.post(
  "/roles/:roleId/bulk",
  param("roleId").isUUID(),
  body("permissions").isArray(),
  validate,
  can("settings", "approve"),
  async (req, res, next) => {
    try {
      const result = await service.bulkReplace(
        req.user,
        req.params.roleId,
        req.body.permissions,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ── USER ACCESS ──────────────────────────────────────────────
//   GET    /users/:userId/access              — one-shot summary
//   PUT    /users/:userId/permitted-businesses — set the list
//   PUT    /users/:userId/default-business    — set default
//   PUT    /users/:userId/roles/:business     — set role at business
//   DELETE /users/:userId/roles/:business     — remove role at business

router.get(
  "/users/:userId/access",
  param("userId").isUUID(),
  validate,
  can("settings", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getUserAccess(req.params.userId));
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/users/:userId/permitted-businesses",
  param("userId").isUUID(),
  body("permitted_businesses").isArray(),
  validate,
  can("settings", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.updatePermittedBusinesses(
          req.user,
          req.params.userId,
          req.body.permitted_businesses,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/users/:userId/default-business",
  param("userId").isUUID(),
  // Allow null to clear the default.
  body("default_business").optional({ nullable: true }).isString(),
  validate,
  can("settings", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.updateDefaultBusiness(
          req.user,
          req.params.userId,
          req.body.default_business,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  "/users/:userId/roles/:business",
  param("userId").isUUID(),
  param("business").isString().notEmpty(),
  body("role_id").isUUID(),
  body("expires_at").optional().isISO8601(),
  validate,
  can("settings", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.setRoleAtBusiness(
          req.user,
          req.params.userId,
          req.params.business,
          req.body,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/users/:userId/roles/:business",
  param("userId").isUUID(),
  param("business").isString().notEmpty(),
  validate,
  can("settings", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.removeRoleAtBusiness(
          req.user,
          req.params.userId,
          req.params.business,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
