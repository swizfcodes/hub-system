"use strict";

const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { withSharedContext } = require("../../config/db");
const smtp = require("../../integrations/messaging/adapters/smtp");
const { renderEmail } = require("../../lib/email/render");
const auditService = require("../../shared/audit/audit.service");
const config = require("../../config/config");
const logger = require("../../config/logger");

const BCRYPT_COST = 12;

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function createInvite(
  user,
  { email, role_id, businesses, display_name, job_title },
) {
  return withSharedContext(async (client) => {
    // Clear any prior pending invite for this email.
    await client.query(
      `DELETE FROM shared.invite_tokens
       WHERE email = $1 AND used_at IS NULL AND expires_at > now()`,
      [email],
    );

    const rawToken = crypto.randomBytes(48).toString("hex");
    const hash = hashToken(rawToken);

    await client.query(
      `INSERT INTO shared.invite_tokens
         (token_hash, email, role_id, businesses, invited_by, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        hash,
        email,
        role_id,
        businesses,
        user.user_id,
        JSON.stringify({ display_name, job_title: job_title || null }),
      ],
    );

    const inviteUrl = `${config.app.hubBaseUrl}/invite/${rawToken}`;
    const { subject, html } = renderEmail("invite", businesses[0], {
      display_name,
      invited_by: user.display_name || "the admin",
      invite_url: inviteUrl,
    });

    try {
      await smtp.sendChannelMessage({
        to: email,
        subject,
        html,
        business: businesses[0],
      });
    } catch (err) {
      logger.error(`[invite] email send failed for ${email}`, err);
      // Don't fail the whole request if SMTP is down — the token is created;
      // the admin can resend. Surface a soft warning in the response instead.
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "admin",
      business: businesses[0],
      module: "security",
      action: "invite_sent",
      table: "shared.invite_tokens",
      metadata: { email, role_id, businesses },
    });

    logger.info(`[invite] token created for ${email} by ${user.email}`);
    return { message: `Invite sent to ${email}`, expires_in: "1 hour" };
  });
}

async function verifyInvite(rawToken) {
  const hash = hashToken(rawToken);
  return withSharedContext(async (client) => {
    const {
      rows: [row],
    } = await client.query(
      `SELECT it.token_id, it.email, it.expires_at, it.used_at, it.businesses, it.metadata,
              r.role_name
       FROM shared.invite_tokens it
       JOIN shared.roles r ON r.role_id = it.role_id
       WHERE it.token_hash = $1`,
      [hash],
    );

    if (!row)
      throw Object.assign(new Error("Invite link is invalid"), { status: 404 });
    if (row.used_at)
      throw Object.assign(new Error("This invite link has already been used"), {
        status: 410,
      });
    if (new Date(row.expires_at) < new Date())
      throw Object.assign(new Error("This invite link has expired"), {
        status: 410,
      });

    return {
      email: row.email,
      role_name: row.role_name,
      businesses: row.businesses,
      display_name: row.metadata?.display_name || "",
      expires_at: row.expires_at,
    };
  });
}

async function acceptInvite(rawToken, { password, display_name }) {
  const hash = hashToken(rawToken);
  return withSharedContext(async (client) => {
    const {
      rows: [row],
    } = await client.query(
      `SELECT * FROM shared.invite_tokens WHERE token_hash = $1 FOR UPDATE`,
      [hash],
    );
    if (!row || row.used_at || new Date(row.expires_at) < new Date())
      throw Object.assign(new Error("Invite link is invalid or expired"), {
        status: 410,
      });

    const {
      rows: [existing],
    } = await client.query(
      `SELECT user_id FROM shared.users WHERE email = $1`,
      [row.email],
    );
    if (existing)
      throw Object.assign(
        new Error("An account with this email already exists"),
        { status: 409 },
      );

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    // Create the user.
    const {
      rows: [newUser],
    } = await client.query(
      `INSERT INTO shared.users
         (email, password_hash, default_business, permitted_businesses, force_password_reset)
       VALUES ($1,$2,$3,$4,false)
       RETURNING user_id`,
      [row.email, passwordHash, row.businesses[0], row.businesses],
    );

    // Assign the invited role at each business.
    for (const biz of row.businesses) {
      await client.query(
        `INSERT INTO shared.user_roles (user_id, role_id, business, granted_by)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [newUser.user_id, row.role_id, biz, row.invited_by],
      );
    }

    // Create a staff contact. contacts.primary_phone is NOT NULL, so seed a
    // placeholder the user can edit later; email lives in the email column.
    const {
      rows: [contact],
    } = await client.query(
      `INSERT INTO shared.contacts
         (display_name, email, primary_phone, contact_type, visible_to)
       VALUES ($1,$2,$3,ARRAY['staff']::text[],$4)
       RETURNING contact_id`,
      [display_name, row.email, "", row.businesses],
    );

    // Link contact to the user.
    await client.query(
      `UPDATE shared.users SET staff_profile_id = $2 WHERE user_id = $1`,
      [newUser.user_id, contact.contact_id],
    );

    // Mark the token used.
    await client.query(
      `UPDATE shared.invite_tokens SET used_at = now() WHERE token_id = $1`,
      [row.token_id],
    );

    await auditService.log(client, {
      userId: newUser.user_id,
      userName: display_name,
      business: row.businesses[0],
      module: "security",
      action: "account_created",
      table: "shared.users",
      recordId: newUser.user_id,
      metadata: { via: "invite_token" },
    });

    logger.info(
      `[invite] accepted by ${row.email}, user_id=${newUser.user_id}`,
    );
    return {
      message: "Account created. You can now log in.",
      email: row.email,
    };
  });
}

module.exports = { createInvite, verifyInvite, acceptInvite };
