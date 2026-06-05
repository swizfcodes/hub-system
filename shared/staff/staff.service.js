"use strict";

const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { withSharedContext } = require("../../config/db");
const contactsService = require("../contacts/contacts.service");
const auditService = require("../audit/audit.service");
const notifService = require("../notifications/notifications.service");
const repo = require("./staff.repository");
const { getActiveBusinesses } = require("../../config/businesses");

// ─────────────────────────────────────────────────────────────
// STAFF SERVICE
//
// Two distinct things this module manages:
//
//   1. The HR record (staff_profiles): job title, salary, bank,
//      Nigerian-specific IDs (NIN, BVN, pension PIN, NHF, TIN),
//      contracts, company assets they hold.
//
//   2. The login record (users): the credential row that lets a
//      staff member sign into the platform. One-to-one with staff
//      profile via users.staff_profile_id.
//
// Creating a staff member can be one or both:
//   - "Add HR record only" — no login (warehouse hand who'll never
//     sign in).
//   - "Add HR record + create login" — most common case; provisions
//     a temporary password and force-reset flag.
//
// Personal data (NIN, BVN, bank account) is sensitive — every read
// of these fields by anyone other than the staff member themselves
// or HR is audit-logged.
// ─────────────────────────────────────────────────────────────

const BCRYPT_COST = 12;

// ─────────────────────────────────────────────────────────────
// PROFILE CRUD
// ─────────────────────────────────────────────────────────────

async function listStaff(query) {
  return withSharedContext(async (client) => {
    const page = parseInt(query.page) || 1;
    const limit = Math.min(parseInt(query.limit) || 50, 200);
    const offset = (page - 1) * limit;
    const filters = {
      search: query.search,
      business: query.business,
      department: query.department,
      isActive:
        query.is_active === "true"
          ? true
          : query.is_active === "false"
            ? false
            : null,
    };
    const [data, total] = await Promise.all([
      repo.listProfiles(client, { ...filters, limit, offset }),
      repo.countProfiles(client, filters),
    ]);
    return { data, pagination: { page, limit, total } };
  });
}

async function getStaff(profileId, requestingUser) {
  return withSharedContext(async (client) => {
    const profile = await repo.findProfileById(client, profileId);
    if (!profile) {
      throw Object.assign(new Error("Staff member not found"), { status: 404 });
    }

    // Mask sensitive fields if the requester is not the staff member
    // themselves, not HR, and not a manager.
    const isSelf = requestingUser.staff_profile_id === profileId;
    const isPrivileged = userHasAnyRole(requestingUser, [
      "owner",
      "manager",
      "hr_manager",
    ]);

    if (!isSelf && !isPrivileged) {
      profile.bank_account_number = maskField(profile.bank_account_number);
      profile.nin = maskField(profile.nin);
      profile.bvn = maskField(profile.bvn);
      profile.base_salary = null;
      profile.pension_pin = maskField(profile.pension_pin);
    } else if (isPrivileged && !isSelf) {
      // Privileged read of someone else — log it.
      await auditService.log(client, {
        userId: requestingUser.user_id,
        userName: requestingUser.display_name,
        module: "staff",
        action: "view_sensitive",
        table: "shared.staff_profiles",
        recordId: profileId,
        metadata: { sensitive: true, reason: "privileged read" },
      });
    }

    return profile;
  });
}

/**
 * Onboard a new staff member.
 *
 * Three operations in one transaction:
 *   1. Create/reuse the underlying contact record.
 *   2. Create the staff_profile.
 *   3. (Optional) Provision a user/login row with a temporary password.
 *      Returns the temp password to the caller (display once, never
 *      stored in plaintext) so HR can pass it to the new hire securely.
 */
async function createStaff(data, user) {
  return withSharedContext(async (client) => {
    if (
      !["full_time", "part_time", "contract"].includes(data.employment_type)
    ) {
      throw Object.assign(new Error("Invalid employment_type"), {
        status: 400,
      });
    }

    // Either reuse a provided contact_id, or create a new contact.
    let contactId = data.contact_id;
    if (!contactId) {
      if (!data.first_name || !data.last_name || !data.primary_phone) {
        throw Object.assign(
          new Error(
            "first_name, last_name, primary_phone required when contact_id not given",
          ),
          { status: 400 },
        );
      }
      const contact = await contactsService.create(
        {
          contact_type: ["staff"],
          display_name: `${data.first_name} ${data.last_name}`,
          first_name: data.first_name,
          last_name: data.last_name,
          primary_phone: data.primary_phone,
          whatsapp_number: data.whatsapp_number,
          email: data.email,
          gender: data.gender,
          date_of_birth: data.date_of_birth,
          visible_to: data.visible_to || getActiveBusinesses(),
        },
        user,
      );
      contactId = contact.contact_id;
    }

    // Uniqueness check on employee_number.
    const existing = await repo.findProfileByEmployeeNumber(
      client,
      data.employee_number,
    );
    if (existing) {
      throw Object.assign(new Error("employee_number already in use"), {
        status: 409,
      });
    }

    const profile = await repo.insertProfile(client, {
      contact_id: contactId,
      employee_number: data.employee_number,
      business: data.business,
      department: data.department,
      job_title: data.job_title,
      employment_type: data.employment_type,
      start_date: data.start_date,
      reports_to: data.reports_to,
      bank_name: data.bank_name,
      bank_account_number: data.bank_account_number,
      bank_sort_code: data.bank_sort_code,
      nin: data.nin,
      bvn: data.bvn,
      base_salary: data.base_salary,
      pension_pin: data.pension_pin,
      nhf_number: data.nhf_number,
      tax_id: data.tax_id,
    });

    // Optional initial contract.
    if (data.base_salary && data.start_date) {
      await repo.insertContract(client, {
        profile_id: profile.profile_id,
        contract_type: data.employment_type,
        effective_from: data.start_date,
        gross_salary: data.base_salary,
        notes: "Initial contract on hire",
        created_by: user.user_id,
      });
    }

    // Optional login provisioning.
    let credentials = null;
    if (data.create_login) {
      if (!data.email) {
        throw Object.assign(
          new Error("email required when create_login is true"),
          { status: 400 },
        );
      }
      const existingUser = await repo.findUserByEmail(client, data.email);
      if (existingUser) {
        throw Object.assign(new Error("email already has a user account"), {
          status: 409,
        });
      }
      const tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_COST);
      const newUser = await repo.insertUser(client, {
        staff_profile_id: profile.profile_id,
        email: data.email,
        password_hash: passwordHash,
        default_business: data.business,
        permitted_businesses: data.permitted_businesses || [data.business],
      });
      credentials = {
        user_id: newUser.user_id,
        email: newUser.email,
        temp_password: tempPassword, // shown ONCE; HR shares securely
        force_password_reset: true,
      };
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: data.business,
      module: "staff",
      action: "create",
      table: "shared.staff_profiles",
      recordId: profile.profile_id,
      after: { ...profile, base_salary: "[redacted]" },
      metadata: { onboarded_login: !!credentials },
    });

    return { profile, credentials };
  });
}

async function updateStaff(profileId, fields, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findProfileById(client, profileId);
    if (!before) {
      throw Object.assign(new Error("Staff member not found"), { status: 404 });
    }

    if (
      fields.employment_type &&
      !["full_time", "part_time", "contract"].includes(fields.employment_type)
    ) {
      throw Object.assign(new Error("Invalid employment_type"), {
        status: 400,
      });
    }

    const after = await repo.updateProfile(client, profileId, fields);

    // If salary changed, create a new contract row to preserve history.
    if (
      fields.base_salary !== undefined &&
      parseFloat(fields.base_salary) !== parseFloat(before.base_salary)
    ) {
      await repo.insertContract(client, {
        profile_id: profileId,
        contract_type: "amendment",
        effective_from:
          fields.effective_from || new Date().toISOString().slice(0, 10),
        gross_salary: fields.base_salary,
        notes: fields.contract_notes || "Salary amendment",
        created_by: user.user_id,
      });
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: before.business,
      module: "staff",
      action: "update",
      table: "shared.staff_profiles",
      recordId: profileId,
      before: { ...before, base_salary: "[redacted]" },
      after: { ...after, base_salary: "[redacted]" },
      metadata: fields.base_salary
        ? { sensitive: true, reason: "salary change" }
        : {},
    });

    return after;
  });
}

/**
 * Off-board a staff member. Soft delete + deactivate any login.
 * Refuses if there are direct reports who still report to them
 * (would orphan the org chart).
 */
async function offboardStaff(profileId, { reason, last_day }, user) {
  return withSharedContext(async (client) => {
    const profile = await repo.findProfileById(client, profileId);
    if (!profile) {
      throw Object.assign(new Error("Staff member not found"), { status: 404 });
    }

    const reports = await repo.findDirectReports(client, profileId);
    if (reports.length > 0) {
      throw Object.assign(
        new Error(
          `Cannot offboard — ${reports.length} staff member(s) report to this person. Reassign reports first.`,
        ),
        { status: 409 },
      );
    }

    // Refuse if assets haven't been returned.
    const outstandingAssets = await repo.listAssets(client, profileId, {
      includeReturned: false,
    });
    if (outstandingAssets.length > 0 && !user.override_asset_check) {
      throw Object.assign(
        new Error(
          `Cannot offboard — ${outstandingAssets.length} company asset(s) still issued. Mark them returned first.`,
        ),
        { status: 409 },
      );
    }

    if (last_day) {
      await repo.updateProfile(client, profileId, { end_date: last_day });
    }
    await repo.softDeleteProfile(client, profileId);

    // Deactivate login if one exists.
    const u = await repo.findUserByProfileId(client, profileId);
    if (u) {
      await repo.updateUser(client, u.user_id, { is_active: false });
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: profile.business,
      module: "staff",
      action: "offboard",
      table: "shared.staff_profiles",
      recordId: profileId,
      before: { ...profile, base_salary: "[redacted]" },
      metadata: { reason, last_day, sensitive: true },
    });

    return { profile_id: profileId, offboarded: true };
  });
}

// ─────────────────────────────────────────────────────────────
// ORG CHART
// ─────────────────────────────────────────────────────────────

async function getDirectReports(profileId) {
  return withSharedContext((client) =>
    repo.findDirectReports(client, profileId),
  );
}

async function getOrgChart(query) {
  return withSharedContext((client) =>
    repo.getOrgChart(client, {
      business: query.business,
      rootProfileId: query.root,
    }),
  );
}

// ─────────────────────────────────────────────────────────────
// CONTRACTS (versioned salary history)
// ─────────────────────────────────────────────────────────────

async function listContracts(profileId, requestingUser) {
  return withSharedContext(async (client) => {
    const isSelf = requestingUser.staff_profile_id === profileId;
    const isPrivileged = userHasAnyRole(requestingUser, [
      "owner",
      "manager",
      "hr_manager",
    ]);
    if (!isSelf && !isPrivileged) {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    }
    return repo.listContracts(client, profileId);
  });
}

async function addContract(profileId, data, user) {
  return withSharedContext(async (client) => {
    if (
      !["full_time", "part_time", "contract", "amendment"].includes(
        data.contract_type,
      )
    ) {
      throw Object.assign(new Error("Invalid contract_type"), { status: 400 });
    }
    const profile = await repo.findProfileById(client, profileId);
    if (!profile) {
      throw Object.assign(new Error("Staff member not found"), { status: 404 });
    }

    const contract = await repo.insertContract(client, {
      profile_id: profileId,
      contract_type: data.contract_type,
      effective_from: data.effective_from,
      effective_to: data.effective_to,
      gross_salary: data.gross_salary,
      document_id: data.document_id,
      notes: data.notes,
      created_by: user.user_id,
    });

    // Update the profile's base_salary to the latest contract.
    await repo.updateProfile(client, profileId, {
      base_salary: data.gross_salary,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: profile.business,
      module: "staff",
      action: "add_contract",
      table: "shared.staff_contracts",
      recordId: contract.contract_id,
      metadata: { sensitive: true, reason: "compensation change" },
    });

    return contract;
  });
}

// ─────────────────────────────────────────────────────────────
// ASSETS
// ─────────────────────────────────────────────────────────────

async function listAssets(profileId, query) {
  return withSharedContext((client) =>
    repo.listAssets(client, profileId, {
      includeReturned: query.include_returned === "true",
    }),
  );
}

async function issueAsset(profileId, data, user) {
  return withSharedContext(async (client) => {
    const profile = await repo.findProfileById(client, profileId);
    if (!profile) {
      throw Object.assign(new Error("Staff member not found"), { status: 404 });
    }
    const asset = await repo.insertAsset(client, {
      profile_id: profileId,
      asset_type: data.asset_type,
      description: data.description,
      serial_number: data.serial_number,
      issued_date: data.issued_date || new Date().toISOString().slice(0, 10),
      condition_on_issue: data.condition_on_issue,
      notes: data.notes,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: profile.business,
      module: "staff",
      action: "issue_asset",
      table: "shared.staff_assets",
      recordId: asset.asset_id,
      after: asset,
    });
    return asset;
  });
}

async function returnAsset(assetId, data, user) {
  return withSharedContext(async (client) => {
    const asset = await repo.returnAsset(client, assetId, {
      returnedDate: data.returned_date,
      conditionOnReturn: data.condition_on_return,
      notes: data.notes,
    });
    if (!asset) {
      throw Object.assign(new Error("Asset not found or already returned"), {
        status: 404,
      });
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      module: "staff",
      action: "return_asset",
      table: "shared.staff_assets",
      recordId: assetId,
      after: asset,
    });
    return asset;
  });
}

// ─────────────────────────────────────────────────────────────
// USER ACCOUNT MANAGEMENT (for an existing staff member)
// ─────────────────────────────────────────────────────────────

async function provisionLogin(profileId, data, user) {
  return withSharedContext(async (client) => {
    const profile = await repo.findProfileById(client, profileId);
    if (!profile) {
      throw Object.assign(new Error("Staff member not found"), { status: 404 });
    }
    const existing = await repo.findUserByProfileId(client, profileId);
    if (existing) {
      throw Object.assign(new Error("Staff member already has a login"), {
        status: 409,
      });
    }
    if (!profile.email && !data.email) {
      throw Object.assign(
        new Error("email required either on contact or in this request"),
        { status: 400 },
      );
    }
    const email = data.email || profile.email;
    const dup = await repo.findUserByEmail(client, email);
    if (dup) {
      throw Object.assign(new Error("email already in use"), { status: 409 });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_COST);

    const newUser = await repo.insertUser(client, {
      staff_profile_id: profileId,
      email,
      password_hash: passwordHash,
      default_business: data.default_business || profile.business,
      permitted_businesses: data.permitted_businesses || [profile.business],
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: profile.business,
      module: "staff",
      action: "provision_login",
      table: "shared.users",
      recordId: newUser.user_id,
      metadata: { sensitive: true, reason: "new login credential" },
    });

    return {
      user_id: newUser.user_id,
      email: newUser.email,
      temp_password: tempPassword,
      force_password_reset: true,
    };
  });
}

async function deactivateLogin(profileId, user) {
  return withSharedContext(async (client) => {
    const u = await repo.findUserByProfileId(client, profileId);
    if (!u) {
      throw Object.assign(new Error("Login not found"), { status: 404 });
    }
    await repo.updateUser(client, u.user_id, { is_active: false });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      module: "staff",
      action: "deactivate_login",
      table: "shared.users",
      recordId: u.user_id,
      metadata: { sensitive: true },
    });
    return { user_id: u.user_id, is_active: false };
  });
}

async function activateLogin(profileId, user) {
  return withSharedContext(async (client) => {
    const u = await repo.findUserByProfileId(client, profileId);
    if (!u) {
      throw Object.assign(new Error("Login not found"), { status: 404 });
    }
    if (u.is_active) {
      throw Object.assign(new Error("Login is already active"), { status: 400 });
    }
    await repo.updateUser(client, u.user_id, { is_active: true });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      module: "staff",
      action: "activate_login",
      table: "shared.users",
      recordId: u.user_id,
      metadata: { sensitive: true },
    });
    return { user_id: u.user_id, is_active: true };
  });
}

async function resetPassword(profileId, user) {
  return withSharedContext(async (client) => {
    const u = await repo.findUserByProfileId(client, profileId);
    if (!u) {
      throw Object.assign(new Error("Login not found"), { status: 404 });
    }
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_COST);
    await repo.setUserPassword(client, u.user_id, passwordHash);

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      module: "staff",
      action: "reset_password",
      table: "shared.users",
      recordId: u.user_id,
      metadata: { sensitive: true, reason: "admin password reset" },
    });

    // Notify the user that their password was reset.
    await notifService.create(client, {
      userId: u.user_id,
      type: "security",
      title: "Your password was reset",
      body: "An administrator has reset your password. You will be required to set a new one on next login.",
    });

    return {
      user_id: u.user_id,
      temp_password: tempPassword,
      force_password_reset: true,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// ROLES
// ─────────────────────────────────────────────────────────────

async function listRoles() {
  return withSharedContext((client) => repo.listRoles(client));
}

async function listUserRoles(profileId) {
  return withSharedContext(async (client) => {
    const u = await repo.findUserByProfileId(client, profileId);
    if (!u) return [];
    return repo.listUserRoles(client, u.user_id);
  });
}

async function grantRole(profileId, { role_name, business, expires_at }, user) {
  return withSharedContext(async (client) => {
    const u = await repo.findUserByProfileId(client, profileId);
    if (!u) {
      throw Object.assign(new Error("Login not found for this staff member"), {
        status: 404,
      });
    }
    const role = await repo.findRoleByName(client, role_name);
    if (!role) {
      throw Object.assign(new Error("Role not found"), { status: 404 });
    }
    await repo.grantRole(client, {
      userId: u.user_id,
      roleId: role.role_id,
      business,
      grantedBy: user.user_id,
      expiresAt: expires_at,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "staff",
      action: "grant_role",
      table: "shared.user_roles",
      recordId: u.user_id,
      metadata: { sensitive: true, role_name, target_user: u.user_id },
    });
    return { granted: true, role_name, business };
  });
}

async function revokeRole(profileId, { role_name, business }, user) {
  return withSharedContext(async (client) => {
    const u = await repo.findUserByProfileId(client, profileId);
    if (!u) {
      throw Object.assign(new Error("Login not found"), { status: 404 });
    }
    const role = await repo.findRoleByName(client, role_name);
    if (!role) {
      throw Object.assign(new Error("Role not found"), { status: 404 });
    }
    const revoked = await repo.revokeRole(client, {
      userId: u.user_id,
      roleId: role.role_id,
      business,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business,
      module: "staff",
      action: "revoke_role",
      table: "shared.user_roles",
      recordId: u.user_id,
      metadata: { sensitive: true, role_name, target_user: u.user_id },
    });
    return { revoked };
  });
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function userHasAnyRole(user, roleNames) {
  if (!user || !Array.isArray(user.roles)) return false;
  return user.roles.some((r) => roleNames.includes(r));
}

function maskField(value) {
  if (!value) return null;
  const s = String(value);
  if (s.length <= 4) return "****";
  return `****${s.slice(-4)}`;
}

function generateTempPassword() {
  // 14 chars, mix of upper/lower/digits. Unguessable but readable
  // enough for HR to write down once.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  const bytes = crypto.randomBytes(14);
  for (let i = 0; i < 14; i++) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// LEAVE REQUESTS
//
// Workflow: staff submit (pending) → manager approves or rejects.
// Approved 'unpaid' leave is read by the payroll calculator to
// deduct absent days, so this is not just an HR nicety — it feeds
// the payslip math.
//
// Leave lives in the shared schema (shared.leave_requests) because
// staff are shared across businesses. All functions use
// withSharedContext like the rest of the staff module.
// ─────────────────────────────────────────────────────────────

const LEAVE_TYPES = [
  "annual",
  "sick",
  "maternity",
  "paternity",
  "compassionate",
  "unpaid",
];

/**
 * Count calendar days inclusive of both endpoints. Kept simple —
 * does NOT exclude weekends/holidays. If the business wants working-
 * day counts only, the caller can pass days_requested explicitly and
 * this is skipped (see submitLeave).
 */
function inclusiveDayCount(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const ms = end.getTime() - start.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

async function listLeave(query = {}) {
  return withSharedContext(async (client) => {
    const data = await repo.listLeaveRequests(client, {
      profileId: query.profile_id,
      status: query.status,
      fromDate: query.from_date,
      toDate: query.to_date,
      limit: query.limit ? parseInt(query.limit) : 100,
      offset: query.page
        ? (parseInt(query.page) - 1) * (parseInt(query.limit) || 100)
        : 0,
    });
    return { data };
  });
}

async function getLeave(leaveId) {
  return withSharedContext(async (client) => {
    const row = await repo.findLeaveRequestById(client, leaveId);
    if (!row) {
      throw Object.assign(new Error("Leave request not found"), {
        status: 404,
      });
    }
    return row;
  });
}

/**
 * Submit a leave request. If the caller is a staff member submitting
 * their own leave, profileId is resolved from their user account.
 * Managers may submit on behalf of another staff member by passing
 * profile_id explicitly.
 */
async function submitLeave(data, user, { onBehalf = false } = {}) {
  if (!LEAVE_TYPES.includes(data.leave_type)) {
    throw Object.assign(
      new Error(`leave_type must be one of: ${LEAVE_TYPES.join(", ")}`),
      { status: 400 },
    );
  }
  if (!data.start_date || !data.end_date) {
    throw Object.assign(new Error("start_date and end_date are required"), {
      status: 400,
    });
  }
  if (new Date(data.end_date) < new Date(data.start_date)) {
    throw Object.assign(new Error("end_date cannot be before start_date"), {
      status: 400,
    });
  }

  return withSharedContext(async (client) => {
    // Resolve whose leave this is.
    let profileId = data.profile_id;
    if (!onBehalf || !profileId) {
      profileId = await repo.resolveProfileIdForUser(client, user.user_id);
      if (!profileId) {
        throw Object.assign(
          new Error(
            "Your user account is not linked to a staff profile — " +
              "cannot submit leave. Ask an admin to link your profile.",
          ),
          { status: 400 },
        );
      }
    }

    // Reject overlapping requests so a staff member can't double-book.
    const overlaps = await repo.findOverlappingLeave(client, {
      profileId,
      startDate: data.start_date,
      endDate: data.end_date,
    });
    if (overlaps.length > 0) {
      throw Object.assign(
        new Error(
          `This overlaps an existing ${overlaps[0].status} leave request ` +
            `(${overlaps[0].start_date} to ${overlaps[0].end_date})`,
        ),
        { status: 409 },
      );
    }

    // days_requested: trust an explicit value (working-day count from
    // the UI) if provided, else fall back to inclusive calendar days.
    const daysRequested =
      data.days_requested != null
        ? parseInt(data.days_requested)
        : inclusiveDayCount(data.start_date, data.end_date);
    if (daysRequested <= 0) {
      throw Object.assign(new Error("days_requested must be positive"), {
        status: 400,
      });
    }

    const row = await repo.insertLeaveRequest(client, {
      profileId,
      leaveType: data.leave_type,
      startDate: data.start_date,
      endDate: data.end_date,
      daysRequested,
      reason: data.reason,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business: "*",
      module: "staff",
      action: "create",
      table: "shared.leave_requests",
      recordId: row.leave_id,
      after: row,
    });

    // Notify the staff member's manager that a request awaits approval.
    // Best-effort — a notification failure must not fail the submission.
    try {
      const {
        rows: [mgr],
      } = await client.query(
        `SELECT u.user_id
         FROM shared.staff_profiles sp
         JOIN shared.staff_profiles mgr ON mgr.profile_id = sp.manager_profile_id
         JOIN shared.users u ON u.staff_profile_id = mgr.profile_id
         WHERE sp.profile_id = $1`,
        [profileId],
      );
      if (mgr) {
        await notifService.create(client, {
          userId: mgr.user_id,
          business: "*",
          type: "system",
          title: "Leave request awaiting approval",
          body: `${row.staff_name || "A staff member"} requested ${daysRequested} day(s) of ${data.leave_type} leave.`,
          referenceType: "leave_request",
          referenceId: row.leave_id,
        });
      }
    } catch (err) {
      logger.warn(`[staff] leave manager-notify failed: ${err.message}`);
    }

    return row;
  });
}

async function updateLeave(leaveId, data, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findLeaveRequestById(client, leaveId);
    if (!before) {
      throw Object.assign(new Error("Leave request not found"), {
        status: 404,
      });
    }
    if (before.status !== "pending") {
      throw Object.assign(
        new Error(
          `Cannot edit a ${before.status} leave request — only pending ` +
            `requests can be changed.`,
        ),
        { status: 400 },
      );
    }
    if (data.leave_type && !LEAVE_TYPES.includes(data.leave_type)) {
      throw Object.assign(
        new Error(`leave_type must be one of: ${LEAVE_TYPES.join(", ")}`),
        { status: 400 },
      );
    }

    const startDate = data.start_date || before.start_date;
    const endDate = data.end_date || before.end_date;
    if (new Date(endDate) < new Date(startDate)) {
      throw Object.assign(new Error("end_date cannot be before start_date"), {
        status: 400,
      });
    }

    // Re-check overlap if the dates changed.
    if (data.start_date || data.end_date) {
      const overlaps = await repo.findOverlappingLeave(client, {
        profileId: before.profile_id,
        startDate,
        endDate,
        excludeLeaveId: leaveId,
      });
      if (overlaps.length > 0) {
        throw Object.assign(
          new Error("Updated dates overlap another leave request"),
          { status: 409 },
        );
      }
    }

    const daysRequested =
      data.days_requested != null
        ? parseInt(data.days_requested)
        : data.start_date || data.end_date
          ? inclusiveDayCount(startDate, endDate)
          : null;

    const row = await repo.updateLeaveRequest(client, leaveId, {
      leaveType: data.leave_type,
      startDate: data.start_date,
      endDate: data.end_date,
      daysRequested,
      reason: data.reason,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business: "*",
      module: "staff",
      action: "edit",
      table: "shared.leave_requests",
      recordId: leaveId,
      before,
      after: row,
    });

    return row;
  });
}

async function approveLeave(leaveId, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findLeaveRequestById(client, leaveId);
    if (!before) {
      throw Object.assign(new Error("Leave request not found"), {
        status: 404,
      });
    }
    if (before.status !== "pending") {
      throw Object.assign(
        new Error(`Leave request is already ${before.status}`),
        { status: 400 },
      );
    }
    const row = await repo.setLeaveStatus(client, leaveId, {
      status: "approved",
      approvedBy: user.user_id,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "manager",
      business: "*",
      module: "staff",
      action: "approve",
      table: "shared.leave_requests",
      recordId: leaveId,
      before,
      after: row,
    });

    // Tell the staff member their leave was approved.
    try {
      const {
        rows: [u],
      } = await client.query(
        `SELECT user_id FROM shared.users WHERE staff_profile_id = $1`,
        [before.profile_id],
      );
      if (u) {
        await notifService.create(client, {
          userId: u.user_id,
          business: "*",
          type: "system",
          title: "Leave request approved",
          body: `Your ${before.leave_type} leave (${before.start_date} to ${before.end_date}) was approved.`,
          referenceType: "leave_request",
          referenceId: leaveId,
        });
      }
    } catch (err) {
      logger.warn(`[staff] leave approve-notify failed: ${err.message}`);
    }

    return row;
  });
}

async function rejectLeave(leaveId, rejectionReason, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findLeaveRequestById(client, leaveId);
    if (!before) {
      throw Object.assign(new Error("Leave request not found"), {
        status: 404,
      });
    }
    if (before.status !== "pending") {
      throw Object.assign(
        new Error(`Leave request is already ${before.status}`),
        { status: 400 },
      );
    }
    const row = await repo.setLeaveStatus(client, leaveId, {
      status: "rejected",
      approvedBy: user.user_id,
      rejectionReason: rejectionReason || "No reason given",
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "manager",
      business: "*",
      module: "staff",
      action: "edit",
      table: "shared.leave_requests",
      recordId: leaveId,
      before,
      after: row,
    });

    try {
      const {
        rows: [u],
      } = await client.query(
        `SELECT user_id FROM shared.users WHERE staff_profile_id = $1`,
        [before.profile_id],
      );
      if (u) {
        await notifService.create(client, {
          userId: u.user_id,
          business: "*",
          type: "system",
          title: "Leave request rejected",
          body: `Your ${before.leave_type} leave was rejected: ${row.rejection_reason}`,
          referenceType: "leave_request",
          referenceId: leaveId,
        });
      }
    } catch (err) {
      logger.warn(`[staff] leave reject-notify failed: ${err.message}`);
    }

    return row;
  });
}

/**
 * Cancel a leave request. A staff member can cancel their own
 * pending OR approved leave (plans change). Managers can cancel
 * anyone's.
 */
async function cancelLeave(leaveId, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findLeaveRequestById(client, leaveId);
    if (!before) {
      throw Object.assign(new Error("Leave request not found"), {
        status: 404,
      });
    }
    if (before.status === "cancelled" || before.status === "rejected") {
      throw Object.assign(
        new Error(`Leave request is already ${before.status}`),
        { status: 400 },
      );
    }
    const row = await repo.setLeaveStatus(client, leaveId, {
      status: "cancelled",
      approvedBy: before.approved_by,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business: "*",
      module: "staff",
      action: "edit",
      table: "shared.leave_requests",
      recordId: leaveId,
      before,
      after: row,
    });

    return row;
  });
}

async function getLeaveBalance(profileId, year) {
  return withSharedContext(async (client) => {
    const rows = await repo.getLeaveBalanceSummary(
      client,
      profileId,
      year || new Date().getFullYear(),
    );
    return {
      profile_id: profileId,
      year: year || new Date().getFullYear(),
      summary: rows,
    };
  });
}

module.exports = {
  // profile CRUD
  listStaff,
  getStaff,
  createStaff,
  updateStaff,
  offboardStaff,
  // org chart
  getDirectReports,
  getOrgChart,
  // contracts
  listContracts,
  addContract,
  // assets
  listAssets,
  issueAsset,
  returnAsset,
  // login
  provisionLogin,
  deactivateLogin,
  activateLogin,
  resetPassword,
  // roles
  listRoles,
  listUserRoles,
  grantRole,
  revokeRole,
  // leave requests
  listLeave,
  getLeave,
  submitLeave,
  updateLeave,
  approveLeave,
  rejectLeave,
  cancelLeave,
  getLeaveBalance,
};
