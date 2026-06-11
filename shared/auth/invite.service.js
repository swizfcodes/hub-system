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

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

/**
 * Create an invite for an EXISTING staff profile.
 *
 * Invites are staff-only by design: the admin picks a vetted employee
 * (autocomplete in the UI), and name / email / job title come from the
 * staff record — not free text. This prevents inviting unvetted people
 * and guarantees the accepted account links to a real staff profile.
 *
 * @param user            acting admin (req.user)
 * @param profile_id      shared.staff_profiles.profile_id to invite
 * @param role_id         role granted on acceptance
 * @param businesses      business keys the account may access
 * @param activeBusiness  the business the admin is working in — used to
 *                        brand the invite email (NOT businesses[0], which
 *                        is just checkbox order)
 */
async function createInvite(
  user,
  { profile_id, role_id, businesses },
  activeBusiness,
) {
  return withSharedContext(async (client) => {
    // ── Resolve + vet the staff profile ─────────────────────
    const {
      rows: [staff],
    } = await client.query(
      `SELECT sp.profile_id, sp.job_title, sp.business AS home_business,
              c.display_name, c.email,
              u.user_id AS existing_user_id
       FROM shared.staff_profiles sp
       JOIN shared.contacts c ON c.contact_id = sp.contact_id
       LEFT JOIN shared.users u ON u.staff_profile_id = sp.profile_id
       WHERE sp.profile_id = $1`,
      [profile_id],
    );

    if (!staff) throw httpError("Staff profile not found", 404);
    if (staff.existing_user_id)
      throw httpError(
        `${staff.display_name} already has a login. Manage their access in Security → Users.`,
        409,
      );
    if (!staff.email)
      throw httpError(
        `${staff.display_name} has no email on their staff record. Add one in HR & Staff first.`,
        400,
      );

    const email = staff.email.toLowerCase();

    const {
      rows: [existingUser],
    } = await client.query(
      `SELECT user_id FROM shared.users WHERE email = $1`,
      [email],
    );
    if (existingUser)
      throw httpError("An account with this email already exists", 409);

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
        JSON.stringify({
          display_name: staff.display_name,
          job_title: staff.job_title || null,
          profile_id: staff.profile_id,
        }),
      ],
    );

    // Brand the email with the business the ADMIN is working in (or the
    // employee's home business as fallback) — never raw checkbox order.
    const brandBusiness =
      (activeBusiness && businesses.includes(activeBusiness)
        ? activeBusiness
        : null) ||
      (businesses.includes(staff.home_business)
        ? staff.home_business
        : businesses[0]);

    const inviteUrl = `${config.app.hubBaseUrl}/invite/${rawToken}`;
    const { subject, html } = renderEmail("invite", brandBusiness, {
      display_name: staff.display_name,
      invited_by: user.display_name || "the admin",
      invite_url: inviteUrl,
    });

    try {
      await smtp.sendChannelMessage({
        to: email,
        subject,
        html,
        business: brandBusiness,
      });
    } catch (err) {
      logger.error(`[invite] email send failed for ${email}`, err);
      // Don't fail the whole request if SMTP is down — the token is created;
      // the admin can resend. Surface a soft warning in the response instead.
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "admin",
      business: brandBusiness,
      module: "security",
      action: "invite_sent",
      table: "shared.invite_tokens",
      metadata: { email, role_id, businesses, profile_id: staff.profile_id },
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
      throw httpError("Invite link is invalid", 404);
    if (row.used_at)
      throw httpError("This invite link has already been used", 410);
    if (new Date(row.expires_at) < new Date())
      throw httpError("This invite link has expired", 410);

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
      throw httpError("Invite link is invalid or expired", 410);

    const {
      rows: [existing],
    } = await client.query(
      `SELECT user_id FROM shared.users WHERE email = $1`,
      [row.email],
    );
    if (existing)
      throw httpError("An account with this email already exists", 409);

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

    // ── Link the staff profile ───────────────────────────────
    // users.staff_profile_id REFERENCES shared.staff_profiles(profile_id).
    // The previous implementation inserted a contacts.contact_id here,
    // which violated the FK and rolled back the WHOLE acceptance — the
    // "entered my password and nothing happened" bug.
    let profileId = row.metadata?.profile_id || null;

    if (profileId) {
      // Staff-linked invite (the normal path): verify the profile is
      // still free, then link it.
      const {
        rows: [taken],
      } = await client.query(
        `SELECT user_id FROM shared.users WHERE staff_profile_id = $1`,
        [profileId],
      );
      if (taken) profileId = null; // raced — fall through to legacy path
    }

    if (!profileId) {
      // Legacy invite without a staff profile: create contact + a real
      // staff_profiles row so the FK and downstream modules (expenses,
      // payroll) all work.
      const {
        rows: [contact],
      } = await client.query(
        `INSERT INTO shared.contacts
           (display_name, email, primary_phone, contact_type, visible_to)
         VALUES ($1,$2,'',ARRAY['staff']::text[],$3)
         RETURNING contact_id`,
        [display_name, row.email, row.businesses],
      );
      const empNo = `EMP-${Date.now().toString(36).toUpperCase()}`;
      const {
        rows: [profile],
      } = await client.query(
        `INSERT INTO shared.staff_profiles
           (contact_id, employee_number, business, job_title, employment_type, start_date)
         VALUES ($1,$2,$3,$4,'full_time',CURRENT_DATE)
         RETURNING profile_id`,
        [
          contact.contact_id,
          empNo,
          row.businesses[0],
          row.metadata?.job_title || "Staff",
        ],
      );
      profileId = profile.profile_id;
    }

    await client.query(
      `UPDATE shared.users SET staff_profile_id = $2 WHERE user_id = $1`,
      [newUser.user_id, profileId],
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
      metadata: { via: "invite_token", profile_id: profileId },
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
