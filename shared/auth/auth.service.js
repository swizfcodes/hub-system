"use strict";

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const config = require("../../config/config");
const { withSharedContext } = require("../../config/db");
const { invalidatePermissionCache } = require("../../config/redis");
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
    const { accessToken, refreshToken } = await issueTokens(client, user);

    return {
      accessToken,
      refreshToken,
      user: {
        user_id: user.user_id,
        role_id: user.role_id,
        email: user.email,
        display_name: user.display_name,
        current_business: user.default_business,
        permitted_businesses: user.permitted_businesses,
        default_business: user.default_business,
        force_password_reset: user.force_password_reset,
        role: user.role_name,
      },
    };
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

module.exports = {
  login,
  refresh,
  logout,
  switchBusiness,
  getMe,
  changePassword,
};
