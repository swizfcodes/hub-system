"use strict";

const express = require("express");
const router = express.Router();
const { body, param, query } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { can } = require("../../middleware/permissions");
const service = require("./staff.service");

// ─── STAFF PROFILE CRUD ──────────────────────────────────────

router.get("/", can("staff", "view"), async (req, res, next) => {
  try {
    res.json(await service.listStaff(req.query));
  } catch (e) {
    next(e);
  }
});

router.get("/org-chart", can("staff", "view"), async (req, res, next) => {
  try {
    res.json({ data: await service.getOrgChart(req.query) });
  } catch (e) {
    next(e);
  }
});

router.get("/roles", can("staff", "view"), async (req, res, next) => {
  try {
    res.json({ data: await service.listRoles() });
  } catch (e) {
    next(e);
  }
});

// The UUID pattern on :id keeps this route from swallowing literal
// one-segment paths registered later in this file (e.g. GET /leave —
// without it, /staff/leave matched here and 422'd on UUID validation).
router.get(
  "/:id([0-9a-fA-F-]{36})",
  param("id").isUUID(),
  validate,
  can("staff", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getStaff(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/:id/direct-reports",
  param("id").isUUID(),
  validate,
  can("staff", "view"),
  async (req, res, next) => {
    try {
      res.json({ data: await service.getDirectReports(req.params.id) });
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/",
  body("employee_number").optional().isString(),
  body("business").isString().notEmpty(),
  body("job_title").isString().notEmpty(),
  body("employment_type").isIn(["full_time", "part_time", "contract"]),
  body("start_date").isISO8601(),
  body("contact_id").optional({ checkFalsy: true }).isUUID(),
  body("first_name").optional().isString(),
  body("last_name").optional().isString(),
  body("primary_phone").optional().isString(),
  body("email").optional().isEmail().trim().toLowerCase(),
  body("base_salary").optional().isFloat({ min: 0 }),
  body("create_login").optional().isBoolean(),
  body("permitted_businesses").optional().isArray(),
  validate,
  can("staff", "create"),
  async (req, res, next) => {
    try {
      res.status(201).json(await service.createStaff(req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/:id",
  param("id").isUUID(),
  body("employment_type")
    .optional()
    .isIn(["full_time", "part_time", "contract"]),
  body("base_salary").optional().isFloat({ min: 0 }),
  body("end_date").optional().isISO8601(),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.updateStaff(req.params.id, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/:id/offboard",
  param("id").isUUID(),
  body("reason").optional().isString(),
  body("last_day").optional().isISO8601(),
  validate,
  can("staff", "delete"),
  async (req, res, next) => {
    try {
      res.json(await service.offboardStaff(req.params.id, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// ─── CONTRACTS ───────────────────────────────────────────────

router.get(
  "/:id/contracts",
  param("id").isUUID(),
  validate,
  can("staff", "view"),
  async (req, res, next) => {
    try {
      res.json({
        data: await service.listContracts(req.params.id, req.user),
      });
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/:id/contracts",
  param("id").isUUID(),
  body("contract_type").isIn([
    "full_time",
    "part_time",
    "contract",
    "amendment",
  ]),
  body("effective_from").isISO8601(),
  body("gross_salary").isFloat({ min: 0 }),
  body("effective_to").optional().isISO8601(),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.addContract(req.params.id, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/:id/contracts/:contractId/pdf",
  param("id").isUUID(),
  param("contractId").isUUID(),
  validate,
  can("staff", "view"),
  async (req, res, next) => {
    try {
      const pdf = await service.generateContractPDF(
        req.params.id,
        req.params.contractId,
        req.user,
      );
      res.set({
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
      });
      res.send(pdf);
    } catch (e) {
      next(e);
    }
  },
);

// ─── ASSETS ──────────────────────────────────────────────────

router.get(
  "/:id/assets",
  param("id").isUUID(),
  validate,
  can("staff", "view"),
  async (req, res, next) => {
    try {
      res.json({
        data: await service.listAssets(req.params.id, req.query),
      });
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/:id/assets",
  param("id").isUUID(),
  body("asset_type").isString().notEmpty(),
  body("description").isString().notEmpty(),
  body("serial_number").optional().isString(),
  body("issued_date").optional().isISO8601(),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.issueAsset(req.params.id, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/assets/:assetId/return",
  param("assetId").isUUID(),
  body("returned_date").optional().isISO8601(),
  body("condition_on_return").optional().isString(),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res.json(
        await service.returnAsset(req.params.assetId, req.body, req.user),
      );
    } catch (e) {
      next(e);
    }
  },
);

// ─── LOGIN PROVISIONING ──────────────────────────────────────

router.post(
  "/:id/provision-login",
  param("id").isUUID(),
  body("email").optional().isEmail().trim().toLowerCase(),
  body("default_business").optional().isString(),
  body("permitted_businesses").optional().isArray(),
  validate,
  can("staff", "create"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.provisionLogin(req.params.id, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/:id/deactivate-login",
  param("id").isUUID(),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.deactivateLogin(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/:id/activate-login",
  param("id").isUUID(),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.activateLogin(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/:id/reset-password",
  param("id").isUUID(),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.resetPassword(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// ─── ROLES ───────────────────────────────────────────────────

router.get(
  "/:id/roles",
  param("id").isUUID(),
  validate,
  can("staff", "view"),
  async (req, res, next) => {
    try {
      res.json({ data: await service.listUserRoles(req.params.id) });
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/:id/roles",
  param("id").isUUID(),
  body("role_name").isString().notEmpty(),
  body("business").isString().notEmpty(),
  body("expires_at").optional().isISO8601(),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(await service.grantRole(req.params.id, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  "/:id/roles",
  param("id").isUUID(),
  body("role_name").isString().notEmpty(),
  body("business").isString().notEmpty(),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.revokeRole(req.params.id, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// ─── EMAIL SIGNATURE (per-user) ──────────────────────────────
// Module 12 — Documents & Signatures.
//
// `/staff/me/signature` is the self-serve path: any authenticated
// user can manage their own signature for their current business
// context (req.business comes from the businessContext middleware).
// Admins can manage other staff's signatures via /staff/:id/signature.

const signature = require("../../lib/email/signature");

router.get("/me/signature", async (req, res, next) => {
  try {
    const row = await signature.getForUser(req.user.user_id, req.business);
    res.json(row || null);
  } catch (e) {
    next(e);
  }
});

router.put(
  "/me/signature",
  body("full_name").isString().notEmpty(),
  body("job_title").isString().notEmpty(),
  body("phone").optional().isString(),
  validate,
  async (req, res, next) => {
    try {
      const row = await signature.upsertForUser(
        req.user.user_id,
        req.business,
        req.body,
      );
      res.json(row);
    } catch (e) {
      next(e);
    }
  },
);

router.delete("/me/signature", async (req, res, next) => {
  try {
    const removed = await signature.deleteForUser(
      req.user.user_id,
      req.business,
    );
    res.json({ removed });
  } catch (e) {
    next(e);
  }
});

// Admin endpoints — manage another staff member's signature.
// Used by HR/managers to set up signatures during onboarding.
router.get(
  "/:id/signature",
  param("id").isUUID(),
  validate,
  can("staff", "view"),
  async (req, res, next) => {
    try {
      const staff = await service.getStaff(req.params.id, req.user);
      const userId = staff.user_id;
      if (!userId) {
        return res
          .status(404)
          .json({ message: "Staff member has no login account" });
      }
      const row = await signature.getForUser(userId, req.business);
      res.json(row || null);
    } catch (e) {
      next(e);
    }
  },
);

router.put(
  "/:id/signature",
  param("id").isUUID(),
  body("full_name").isString().notEmpty(),
  body("job_title").isString().notEmpty(),
  body("phone").optional().isString(),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      const staff = await service.getStaff(req.params.id, req.user);
      const userId = staff.user_id;
      if (!userId) {
        return res
          .status(400)
          .json({ message: "Staff member has no login account" });
      }
      const row = await signature.upsertForUser(userId, req.business, req.body);
      res.json(row);
    } catch (e) {
      next(e);
    }
  },
);

// ─── LEAVE REQUESTS ──────────────────────────────────────────
// Workflow: staff submit (pending) → manager approves/rejects.
// Approved 'unpaid' leave is read by the payroll calculator.
//
//   GET    /staff/leave                  — list (filters: status, profile, dates)
//   GET    /staff/leave/balance/:profileId — approved days per type for a year
//   GET    /staff/leave/:id              — one request
//   POST   /staff/leave                  — submit own leave
//   POST   /staff/leave/on-behalf        — manager submits for a staff member
//   PATCH  /staff/leave/:id              — edit a pending request
//   POST   /staff/leave/:id/approve      — manager approves
//   POST   /staff/leave/:id/reject       — manager rejects (needs reason)
//   POST   /staff/leave/:id/cancel       — cancel pending or approved

router.get(
  "/leave",
  query("status")
    .optional()
    .isIn(["pending", "approved", "rejected", "cancelled"]),
  query("profile_id").optional().isUUID(),
  query("from_date").optional().isISO8601(),
  query("to_date").optional().isISO8601(),
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 200 }),
  validate,
  can("staff", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.listLeave(req.query));
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/leave/balance/:profileId",
  param("profileId").isUUID(),
  query("year").optional().isInt({ min: 2000, max: 2100 }),
  validate,
  can("staff", "view"),
  async (req, res, next) => {
    try {
      res.json(
        await service.getLeaveBalance(
          req.params.profileId,
          req.query.year ? parseInt(req.query.year) : undefined,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.get(
  "/leave/:id",
  param("id").isUUID(),
  validate,
  can("staff", "view"),
  async (req, res, next) => {
    try {
      res.json(await service.getLeave(req.params.id));
    } catch (e) {
      next(e);
    }
  },
);

// Self-service submit — any authenticated user can request their own
// leave. No can("staff", ...) gate — the service resolves their own
// profile from their user account.
router.post(
  "/leave",
  body("leave_type").isIn([
    "annual",
    "sick",
    "maternity",
    "paternity",
    "compassionate",
    "unpaid",
  ]),
  body("start_date").isISO8601(),
  body("end_date").isISO8601(),
  body("days_requested").optional().isInt({ min: 1 }),
  body("reason").optional().isString(),
  validate,
  async (req, res, next) => {
    try {
      res.status(201).json(await service.submitLeave(req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

// Manager submits on behalf of a staff member — needs profile_id and
// the staff edit permission.
router.post(
  "/leave/on-behalf",
  body("profile_id").isUUID(),
  body("leave_type").isIn([
    "annual",
    "sick",
    "maternity",
    "paternity",
    "compassionate",
    "unpaid",
  ]),
  body("start_date").isISO8601(),
  body("end_date").isISO8601(),
  body("days_requested").optional().isInt({ min: 1 }),
  body("reason").optional().isString(),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res
        .status(201)
        .json(
          await service.submitLeave(req.body, req.user, { onBehalf: true }),
        );
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  "/leave/:id",
  param("id").isUUID(),
  body("leave_type")
    .optional()
    .isIn([
      "annual",
      "sick",
      "maternity",
      "paternity",
      "compassionate",
      "unpaid",
    ]),
  body("start_date").optional().isISO8601(),
  body("end_date").optional().isISO8601(),
  body("days_requested").optional().isInt({ min: 1 }),
  body("reason").optional().isString(),
  validate,
  can("staff", "edit"),
  async (req, res, next) => {
    try {
      res.json(await service.updateLeave(req.params.id, req.body, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/leave/:id/approve",
  param("id").isUUID(),
  validate,
  can("staff", "approve"),
  async (req, res, next) => {
    try {
      res.json(await service.approveLeave(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/leave/:id/reject",
  param("id").isUUID(),
  body("rejection_reason").optional().isString(),
  validate,
  can("staff", "approve"),
  async (req, res, next) => {
    try {
      res.json(
        await service.rejectLeave(
          req.params.id,
          req.body.rejection_reason,
          req.user,
        ),
      );
    } catch (e) {
      next(e);
    }
  },
);

router.post(
  "/leave/:id/cancel",
  param("id").isUUID(),
  validate,
  // No approve gate — staff can cancel their own leave. The service
  // does not currently enforce "own only" because cancelling is low-
  // risk and managers legitimately cancel on behalf of staff.
  async (req, res, next) => {
    try {
      res.json(await service.cancelLeave(req.params.id, req.user));
    } catch (e) {
      next(e);
    }
  },
);

module.exports = router;
