"use strict";

// ─────────────────────────────────────────────────────────────
// STAFF REPOSITORY
//
// Covers four tables, all in `shared`:
//   - staff_profiles  the master record (employee_number, bank, NIN, etc.)
//   - staff_contracts versioned compensation history
//   - staff_assets    company property (laptop, phone, keys, etc.)
//   - users           login credentials (one-to-one with staff_profiles)
//   - user_roles      role assignments per business
// ─────────────────────────────────────────────────────────────

// ── STAFF PROFILES ───────────────────────────────────────────

async function listProfiles(
  client,
  { search, business, department, isActive, contactId, limit, offset },
) {
  const { rows } = await client.query(
    `SELECT sp.profile_id, sp.contact_id, sp.employee_number, sp.business,
            sp.department, sp.job_title, sp.employment_type,
            sp.start_date, sp.end_date, sp.reports_to, sp.base_salary,
            sp.is_deleted, sp.created_at, sp.updated_at,
            c.display_name, c.first_name, c.last_name,
            c.primary_phone, c.email,
            u.user_id, u.is_active AS user_is_active, u.last_login_at
     FROM shared.staff_profiles sp
     JOIN shared.contacts c ON c.contact_id = sp.contact_id
     LEFT JOIN shared.users u ON u.staff_profile_id = sp.profile_id
     WHERE sp.is_deleted = false
       AND ($1::TEXT IS NULL OR
            c.display_name ILIKE $1 OR
            sp.employee_number ILIKE $1 OR
            c.email ILIKE $1)
       AND ($2::TEXT IS NULL OR sp.business = $2)
       AND ($3::TEXT IS NULL OR sp.department = $3)
       AND ($4::BOOLEAN IS NULL OR (sp.end_date IS NULL) = $4)
       AND ($5::UUID IS NULL OR sp.contact_id = $5)
     ORDER BY c.display_name ASC
     LIMIT $6 OFFSET $7`,
    [
      search ? `%${search}%` : null,
      business || null,
      department || null,
      isActive,
      contactId || null,
      limit,
      offset,
    ],
  );
  return rows;
}

async function countProfiles(
  client,
  { search, business, department, isActive },
) {
  const {
    rows: [{ count }],
  } = await client.query(
    `SELECT COUNT(*)::int
     FROM shared.staff_profiles sp
     JOIN shared.contacts c ON c.contact_id = sp.contact_id
     WHERE sp.is_deleted = false
       AND ($1::TEXT IS NULL OR
            c.display_name ILIKE $1 OR
            sp.employee_number ILIKE $1 OR
            c.email ILIKE $1)
       AND ($2::TEXT IS NULL OR sp.business = $2)
       AND ($3::TEXT IS NULL OR sp.department = $3)
       AND ($4::BOOLEAN IS NULL OR (sp.end_date IS NULL) = $4)`,
    [
      search ? `%${search}%` : null,
      business || null,
      department || null,
      isActive,
    ],
  );
  return parseInt(count, 10);
}

async function findProfileById(client, profileId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT sp.*,
            c.display_name, c.first_name, c.last_name,
            c.primary_phone, c.whatsapp_number, c.email,
            c.gender, c.date_of_birth, c.addresses,
            u.user_id, u.is_active AS user_is_active,
            u.last_login_at, u.permitted_businesses, u.default_business,
            reports_to_contact.display_name AS reports_to_name
     FROM shared.staff_profiles sp
     JOIN shared.contacts c ON c.contact_id = sp.contact_id
     LEFT JOIN shared.users u ON u.staff_profile_id = sp.profile_id
     LEFT JOIN shared.staff_profiles reports_to_sp
       ON reports_to_sp.profile_id = sp.reports_to
     LEFT JOIN shared.contacts reports_to_contact
       ON reports_to_contact.contact_id = reports_to_sp.contact_id
     WHERE sp.profile_id = $1 AND sp.is_deleted = false`,
    [profileId],
  );
  return row || null;
}

async function findProfileByEmployeeNumber(client, employeeNumber) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM shared.staff_profiles
     WHERE employee_number = $1 AND is_deleted = false`,
    [employeeNumber],
  );
  return row || null;
}

async function insertProfile(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.staff_profiles
       (contact_id, employee_number, business, department, job_title,
        employment_type, start_date, reports_to,
        bank_name, bank_account_number, bank_sort_code,
        nin, bvn, base_salary, pension_pin, nhf_number, tax_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      data.contact_id,
      data.employee_number,
      data.business,
      data.department || null,
      data.job_title,
      data.employment_type,
      data.start_date,
      data.reports_to || null,
      data.bank_name || null,
      data.bank_account_number || null,
      data.bank_sort_code || null,
      data.nin || null,
      data.bvn || null,
      data.base_salary || 0,
      data.pension_pin || null,
      data.nhf_number || null,
      data.tax_id || null,
    ],
  );
  return row;
}

async function updateProfile(client, profileId, fields) {
  const allowed = [
    "department",
    "job_title",
    "employment_type",
    "start_date",
    "end_date",
    "reports_to",
    "bank_name",
    "bank_account_number",
    "bank_sort_code",
    "nin",
    "bvn",
    "base_salary",
    "pension_pin",
    "nhf_number",
    "tax_id",
  ];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] === undefined) continue;
    sets.push(`${key} = $${i++}`);
    values.push(fields[key]);
  }
  if (!sets.length) return findProfileById(client, profileId);
  sets.push(`updated_at = now()`);
  values.push(profileId);
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.staff_profiles
     SET ${sets.join(", ")}
     WHERE profile_id = $${i} AND is_deleted = false
     RETURNING *`,
    values,
  );
  return row || null;
}

async function softDeleteProfile(client, profileId) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.staff_profiles
     SET is_deleted = true, deleted_at = now(),
         end_date = COALESCE(end_date, CURRENT_DATE),
         updated_at = now()
     WHERE profile_id = $1
     RETURNING profile_id, is_deleted, end_date`,
    [profileId],
  );
  return row || null;
}

// ── ORG CHART ────────────────────────────────────────────────

/**
 * Direct reports for one staff member (one level deep).
 * For the full tree, the API caller walks this recursively.
 */
async function findDirectReports(client, profileId) {
  const { rows } = await client.query(
    `SELECT sp.profile_id, sp.employee_number, sp.job_title, sp.department,
            c.display_name, c.email
     FROM shared.staff_profiles sp
     JOIN shared.contacts c ON c.contact_id = sp.contact_id
     WHERE sp.reports_to = $1 AND sp.is_deleted = false
     ORDER BY c.display_name ASC`,
    [profileId],
  );
  return rows;
}

/**
 * Recursive org chart from the top — uses a recursive CTE so we
 * never hit N+1 round trips for a large org.
 */
async function getOrgChart(client, { business, rootProfileId } = {}) {
  const { rows } = await client.query(
    `WITH RECURSIVE chart AS (
       SELECT sp.profile_id, sp.reports_to, sp.job_title, sp.department,
              c.display_name, 0 AS depth
       FROM shared.staff_profiles sp
       JOIN shared.contacts c ON c.contact_id = sp.contact_id
       WHERE sp.is_deleted = false
         AND ($1::UUID IS NULL OR sp.profile_id = $1)
         AND ($1::UUID IS NOT NULL OR sp.reports_to IS NULL)
         AND ($2::TEXT IS NULL OR sp.business = $2)
       UNION ALL
       SELECT sp.profile_id, sp.reports_to, sp.job_title, sp.department,
              c.display_name, chart.depth + 1
       FROM shared.staff_profiles sp
       JOIN shared.contacts c ON c.contact_id = sp.contact_id
       JOIN chart ON chart.profile_id = sp.reports_to
       WHERE sp.is_deleted = false
     )
     SELECT * FROM chart ORDER BY depth ASC, display_name ASC`,
    [rootProfileId || null, business || null],
  );
  return rows;
}

// ── STAFF CONTRACTS ──────────────────────────────────────────

async function listContracts(client, profileId) {
  const { rows } = await client.query(
    `SELECT contract_id, profile_id, contract_type, effective_from,
            effective_to, gross_salary, document_id, notes, created_at
     FROM shared.staff_contracts
     WHERE profile_id = $1
     ORDER BY effective_from DESC`,
    [profileId],
  );
  return rows;
}

async function findContractById(client, contractId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT contract_id, profile_id, contract_type, effective_from,
            effective_to, gross_salary, document_id, notes, created_at
     FROM shared.staff_contracts
     WHERE contract_id = $1`,
    [contractId],
  );
  return row || null;
}

async function insertContract(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.staff_contracts
       (profile_id, contract_type, effective_from, effective_to,
        gross_salary, document_id, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      data.profile_id,
      data.contract_type,
      data.effective_from,
      data.effective_to || null,
      data.gross_salary,
      data.document_id || null,
      data.notes || null,
      data.created_by,
    ],
  );
  return row;
}

// ── STAFF ASSETS ─────────────────────────────────────────────

async function listAssets(client, profileId, { includeReturned = false } = {}) {
  const { rows } = await client.query(
    `SELECT asset_id, profile_id, asset_type, description, serial_number,
            issued_date, returned_date, condition_on_issue,
            condition_on_return, notes, created_at
     FROM shared.staff_assets
     WHERE profile_id = $1
       AND ($2::BOOLEAN OR returned_date IS NULL)
     ORDER BY issued_date DESC`,
    [profileId, includeReturned],
  );
  return rows;
}

async function insertAsset(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.staff_assets
       (profile_id, asset_type, description, serial_number,
        issued_date, condition_on_issue, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      data.profile_id,
      data.asset_type,
      data.description,
      data.serial_number || null,
      data.issued_date,
      data.condition_on_issue || null,
      data.notes || null,
    ],
  );
  return row;
}

async function returnAsset(
  client,
  assetId,
  { returnedDate, conditionOnReturn, notes },
) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.staff_assets
     SET returned_date = $2,
         condition_on_return = $3,
         notes = COALESCE($4, notes)
     WHERE asset_id = $1 AND returned_date IS NULL
     RETURNING *`,
    [
      assetId,
      returnedDate || new Date().toISOString().slice(0, 10),
      conditionOnReturn || null,
      notes || null,
    ],
  );
  return row || null;
}

// ── USERS (login provisioning) ───────────────────────────────

async function findUserByProfileId(client, profileId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT user_id, staff_profile_id, email, is_active,
            force_password_reset, last_login_at, default_business,
            permitted_businesses, created_at
     FROM shared.users WHERE staff_profile_id = $1`,
    [profileId],
  );
  return row || null;
}

async function findUserByEmail(client, email) {
  const {
    rows: [row],
  } = await client.query(`SELECT user_id FROM shared.users WHERE email = $1`, [
    email,
  ]);
  return row || null;
}

async function insertUser(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.users
       (staff_profile_id, email, password_hash,
        force_password_reset, default_business, permitted_businesses)
     VALUES ($1,$2,$3,true,$4,$5)
     RETURNING user_id, email, default_business, permitted_businesses, is_active`,
    [
      data.staff_profile_id,
      data.email,
      data.password_hash,
      data.default_business,
      data.permitted_businesses,
    ],
  );
  return row;
}

async function updateUser(client, userId, fields) {
  const allowed = [
    "email",
    "is_active",
    "default_business",
    "permitted_businesses",
    "force_password_reset",
  ];
  const sets = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] === undefined) continue;
    sets.push(`${key} = $${i++}`);
    values.push(fields[key]);
  }
  if (!sets.length) return null;
  sets.push(`updated_at = now()`);
  values.push(userId);
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.users
     SET ${sets.join(", ")}
     WHERE user_id = $${i}
     RETURNING user_id, email, is_active, default_business, permitted_businesses`,
    values,
  );
  return row || null;
}

async function setUserPassword(client, userId, passwordHash) {
  await client.query(
    `UPDATE shared.users
     SET password_hash = $2,
         force_password_reset = true,
         updated_at = now()
     WHERE user_id = $1`,
    [userId, passwordHash],
  );
}

// ── ROLES ────────────────────────────────────────────────────

async function listRoles(client) {
  const { rows } = await client.query(
    `SELECT role_id, role_name, business, is_system, description
     FROM shared.roles
     ORDER BY is_system DESC, role_name ASC`,
  );
  return rows;
}

async function findRoleByName(client, roleName) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT role_id, role_name FROM shared.roles WHERE role_name = $1 LIMIT 1`,
    [roleName],
  );
  return row || null;
}

async function listUserRoles(client, userId) {
  const { rows } = await client.query(
    `SELECT r.role_id, r.role_name, ur.business, ur.granted_by,
            ur.granted_at, ur.expires_at,
            granted_by_contact.display_name AS granted_by_name
     FROM shared.user_roles ur
     JOIN shared.roles r ON r.role_id = ur.role_id
     LEFT JOIN shared.users granted_by_user
       ON granted_by_user.user_id = ur.granted_by
     LEFT JOIN shared.staff_profiles granted_by_profile
       ON granted_by_profile.profile_id = granted_by_user.staff_profile_id
     LEFT JOIN shared.contacts granted_by_contact
       ON granted_by_contact.contact_id = granted_by_profile.contact_id
     WHERE ur.user_id = $1
     ORDER BY ur.granted_at DESC`,
    [userId],
  );
  return rows;
}

async function grantRole(
  client,
  { userId, roleId, business, grantedBy, expiresAt },
) {
  await client.query(
    `INSERT INTO shared.user_roles (user_id, role_id, business, granted_by, expires_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id, role_id, business) DO UPDATE
     SET granted_by = EXCLUDED.granted_by,
         granted_at = now(),
         expires_at = EXCLUDED.expires_at`,
    [userId, roleId, business, grantedBy, expiresAt || null],
  );
}

async function revokeRole(client, { userId, roleId, business }) {
  const result = await client.query(
    `DELETE FROM shared.user_roles
     WHERE user_id = $1 AND role_id = $2 AND business = $3`,
    [userId, roleId, business],
  );
  return result.rowCount > 0;
}

// ── LEAVE REQUESTS ───────────────────────────────────────────
// shared.leave_requests — staff submit, managers approve/reject.
// The payroll calculator reads approved 'unpaid' leave to deduct
// absent days, so the data this module writes feeds payroll.

async function resolveProfileIdForUser(client, userId) {
  // The "my leave" endpoints need to turn the logged-in user into
  // their staff profile_id. shared.users.staff_profile_id is that link.
  const {
    rows: [row],
  } = await client.query(
    `SELECT staff_profile_id FROM shared.users WHERE user_id = $1`,
    [userId],
  );
  return row?.staff_profile_id || null;
}

async function listLeaveRequests(
  client,
  { profileId, status, fromDate, toDate, limit = 100, offset = 0 } = {},
) {
  const params = [];
  const where = [];
  if (profileId) {
    params.push(profileId);
    where.push(`lr.profile_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`lr.status = $${params.length}`);
  }
  if (fromDate) {
    params.push(fromDate);
    where.push(`lr.end_date >= $${params.length}`);
  }
  if (toDate) {
    params.push(toDate);
    where.push(`lr.start_date <= $${params.length}`);
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.push(limit, offset);

  const { rows } = await client.query(
    `SELECT lr.leave_id, lr.profile_id, lr.leave_type,
            lr.start_date, lr.end_date, lr.days_requested,
            lr.status, lr.approved_by, lr.approved_at,
            lr.reason, lr.rejection_reason,
            lr.created_at, lr.updated_at,
            c.display_name AS staff_name
     FROM shared.leave_requests lr
     JOIN shared.staff_profiles sp ON sp.profile_id = lr.profile_id
     JOIN shared.contacts c ON c.contact_id = sp.contact_id
     ${whereClause}
     ORDER BY lr.start_date DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

async function findLeaveRequestById(client, leaveId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT lr.*, c.display_name AS staff_name
     FROM shared.leave_requests lr
     JOIN shared.staff_profiles sp ON sp.profile_id = lr.profile_id
     JOIN shared.contacts c ON c.contact_id = sp.contact_id
     WHERE lr.leave_id = $1`,
    [leaveId],
  );
  return row || null;
}

async function findOverlappingLeave(
  client,
  { profileId, startDate, endDate, excludeLeaveId = null },
) {
  // Block a staff member from booking two leave periods that overlap.
  // Cancelled / rejected requests don't count as conflicts.
  const params = [profileId, startDate, endDate];
  let exclude = "";
  if (excludeLeaveId) {
    params.push(excludeLeaveId);
    exclude = `AND leave_id != $${params.length}`;
  }
  const { rows } = await client.query(
    `SELECT leave_id, start_date, end_date, status
     FROM shared.leave_requests
     WHERE profile_id = $1
       AND status IN ('pending', 'approved')
       AND start_date <= $3
       AND end_date >= $2
       ${exclude}`,
    params,
  );
  return rows;
}

async function insertLeaveRequest(
  client,
  { profileId, leaveType, startDate, endDate, daysRequested, reason },
) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.leave_requests
       (profile_id, leave_type, start_date, end_date, days_requested, reason)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [profileId, leaveType, startDate, endDate, daysRequested, reason || null],
  );
  return row;
}

async function updateLeaveRequest(
  client,
  leaveId,
  { leaveType, startDate, endDate, daysRequested, reason },
) {
  // Only the editable fields — status transitions go through the
  // dedicated approve/reject/cancel functions below.
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.leave_requests SET
       leave_type     = COALESCE($2, leave_type),
       start_date     = COALESCE($3, start_date),
       end_date       = COALESCE($4, end_date),
       days_requested = COALESCE($5, days_requested),
       reason         = COALESCE($6, reason),
       updated_at     = now()
     WHERE leave_id = $1 AND status = 'pending'
     RETURNING *`,
    [
      leaveId,
      leaveType ?? null,
      startDate ?? null,
      endDate ?? null,
      daysRequested ?? null,
      reason ?? null,
    ],
  );
  return row || null;
}

async function setLeaveStatus(
  client,
  leaveId,
  { status, approvedBy, rejectionReason },
) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.leave_requests SET
       status           = $2,
       approved_by      = $3,
       approved_at      = CASE WHEN $2 IN ('approved','rejected')
                               THEN now() ELSE approved_at END,
       rejection_reason = $4,
       updated_at       = now()
     WHERE leave_id = $1
     RETURNING *`,
    [leaveId, status, approvedBy || null, rejectionReason || null],
  );
  return row || null;
}

async function getLeaveBalanceSummary(client, profileId, year) {
  // Sum approved days per leave_type for a given year — feeds a
  // simple "how much leave has this person taken" view.
  const { rows } = await client.query(
    `SELECT leave_type,
            COALESCE(SUM(days_requested), 0)::int AS days_taken
     FROM shared.leave_requests
     WHERE profile_id = $1
       AND status = 'approved'
       AND EXTRACT(YEAR FROM start_date) = $2
     GROUP BY leave_type`,
    [profileId, year],
  );
  return rows;
}

module.exports = {
  // profiles
  listProfiles,
  countProfiles,
  findProfileById,
  findProfileByEmployeeNumber,
  insertProfile,
  updateProfile,
  softDeleteProfile,
  // org chart
  findDirectReports,
  getOrgChart,
  // contracts
  listContracts,
  findContractById,
  insertContract,
  // assets
  listAssets,
  insertAsset,
  returnAsset,
  // users
  findUserByProfileId,
  findUserByEmail,
  insertUser,
  updateUser,
  setUserPassword,
  // roles
  listRoles,
  findRoleByName,
  listUserRoles,
  grantRole,
  revokeRole,
  // leave requests
  resolveProfileIdForUser,
  listLeaveRequests,
  findLeaveRequestById,
  findOverlappingLeave,
  insertLeaveRequest,
  updateLeaveRequest,
  setLeaveStatus,
  getLeaveBalanceSummary,
};
