"use strict";

const express = require("express");
const router = express.Router();
const { body, param } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { verifyToken } = require("../../middleware/auth");
const { can, canAny } = require("../../middleware/permissions");
const { loginRateLimiter } = require("../../middleware/auth");
const authService = require("./auth.service");
const inviteService = require("./invite.service");

// POST /api/auth/login
router.post(
  "/login",
  loginRateLimiter,
  body("email").isEmail().trim().toLowerCase(),
  body("password").isLength({ min: 8 }),
  validate,
  async (req, res, next) => {
    try {
      const result = await authService.login(
        req.body.email,
        req.body.password,
        req.ip,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/auth/refresh
router.post(
  "/refresh",
  body("refreshToken").notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const result = await authService.refresh(req.body.refreshToken);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/auth/logout
router.post("/logout", verifyToken, async (req, res, next) => {
  try {
    await authService.logout(req.user.user_id, req.body.refreshToken);
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/switch-business
router.post(
  "/switch-business",
  verifyToken,
  body("business").notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const result = await authService.switchBusiness(
        req.user.user_id,
        req.body.business,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/auth/me
router.get("/me", verifyToken, async (req, res, next) => {
  try {
    const user = await authService.getMe(req.user.user_id);
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// ── Navigation preferences ────────────────────────────────
// GET    /api/auth/me/nav — { pinned: string[]|null, role_default: string[]|null }
// PUT    /api/auth/me/nav — body { pinned: string[] } (max 10) → saves user pins
// DELETE /api/auth/me/nav — clears user pins (falls back to role/global default)
router.get("/me/nav", verifyToken, async (req, res, next) => {
  try {
    res.json(await authService.getMyNav(req.user.user_id));
  } catch (err) {
    next(err);
  }
});

router.put("/me/nav", verifyToken, async (req, res, next) => {
  try {
    res.json(await authService.setMyNav(req.user.user_id, req.body?.pinned));
  } catch (err) {
    next(err);
  }
});

router.delete("/me/nav", verifyToken, async (req, res, next) => {
  try {
    res.json(await authService.resetMyNav(req.user.user_id));
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me/permissions — returns the current user's flat permission list
// Reuses the Redis cache already used by the permissions middleware.
router.get("/me/permissions", verifyToken, async (req, res, next) => {
  try {
    const permissions = await authService.getMyPermissions(req.user.role_id);
    res.json({ permissions });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password
router.post(
  "/change-password",
  verifyToken,
  body("currentPassword").notEmpty(),
  body("newPassword").isLength({ min: 12 }),
  validate,
  async (req, res, next) => {
    try {
      await authService.changePassword(
        req.user.user_id,
        req.body.currentPassword,
        req.body.newPassword,
      );
      res.json({ message: "Password changed successfully" });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/auth/invite — generate + email an invite (admin only)
router.post(
  "/invite",
  verifyToken,
  canAny([{ module: "security", action: "approve" }, { module: "settings", action: "approve" }]),
  // Invites are staff-only: the target is an existing staff profile and
  // name / email / job title are read from the staff record server-side.
  body("profile_id").isUUID(),
  body("role_id").isUUID(),
  body("businesses").isArray({ min: 1 }),
  validate,
  async (req, res, next) => {
    try {
      // Brand the invite email with the business the admin is working in.
      const activeBusiness = req.headers["x-business-line"] || null;
      res
        .status(201)
        .json(
          await inviteService.createInvite(req.user, req.body, activeBusiness),
        );
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/auth/invite/:token — verify token (public)
router.get("/invite/:token", async (req, res, next) => {
  try {
    res.json(await inviteService.verifyInvite(req.params.token));
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/invite/:token/accept — accept invite (public)
router.post(
  "/invite/:token/accept",
  loginRateLimiter,
  body("password").isLength({ min: 12 }),
  body("display_name").isString().notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      res.json(await inviteService.acceptInvite(req.params.token, req.body));
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/auth/sessions/:userId — list active sessions (self or admin)
// Self can always view their own sessions.
// Other users' sessions require owner/manager/admin role (role_name set by verifyToken).
router.get(
  "/sessions/:userId",
  verifyToken,
  param("userId").isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const isSelf = req.params.userId === req.user.user_id;
      if (!isSelf) {
        // Check ALL assigned roles, not role_name — role_name is an
        // arbitrary pick when a user holds multiple roles. ("admin" was
        // listed here previously but no such system role exists.)
        const adminRoles = ["owner", "manager"];
        const userRoles = req.user.roles || [req.user.role_name];
        if (!userRoles.some((r) => adminRoles.includes(r))) {
          return res
            .status(403)
            .json({ message: "Not permitted to view other users' sessions" });
        }
      }
      res.json(await authService.listActiveSessions(req.params.userId));
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/auth/sessions/:userId/:tokenId — force-logout one session
router.delete(
  "/sessions/:userId/:tokenId",
  verifyToken,
  canAny([{ module: "security", action: "approve" }, { module: "settings", action: "approve" }]),
  param("userId").isUUID(),
  param("tokenId").isUUID(),
  validate,
  async (req, res, next) => {
    try {
      res.json(
        await authService.revokeSession(
          req.params.userId,
          req.params.tokenId,
          req.user,
        ),
      );
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/auth/sessions/:userId — force-logout ALL sessions
router.delete(
  "/sessions/:userId",
  verifyToken,
  canAny([{ module: "security", action: "approve" }, { module: "settings", action: "approve" }]),
  param("userId").isUUID(),
  validate,
  async (req, res, next) => {
    try {
      res.json(
        await authService.revokeAllSessions(req.params.userId, req.user),
      );
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
