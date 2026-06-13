"use strict";

// ─────────────────────────────────────────────────────────────
// HR REPOSITORY
//
// Data access for the people-management surface that sits on top of
// the staff directory:
//   - work_locations          office geofences (per business)
//   - staff_profiles.*         the weekly work schedule columns
//   - attendance_records       clock in/out, lateness, justifications
//   - staff_queries            HR → employee explanation requests
//   - performance_reviews      manager review cycles
//   - performance_goals        tracked objectives
//
// Everything lives in the `shared` schema and is reached through
// withSharedContext, exactly like leave_requests.
// ─────────────────────────────────────────────────────────────

// ── WORK LOCATIONS ───────────────────────────────────────────

async function listWorkLocations(client, business) {
  const { rows } = await client.query(
    `SELECT * FROM shared.work_locations
     WHERE ($1::TEXT IS NULL OR business = $1)
     ORDER BY is_active DESC, name ASC`,
    [business || null],
  );
  return rows;
}

async function getWorkLocation(client, locationId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM shared.work_locations WHERE location_id = $1`,
    [locationId],
  );
  return row || null;
}

async function insertWorkLocation(client, d) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.work_locations
       (business, name, address, latitude, longitude, geofence_radius_m)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6,250))
     RETURNING *`,
    [d.business, d.name, d.address || null, d.latitude, d.longitude, d.geofence_radius_m],
  );
  return row;
}

async function updateWorkLocation(client, locationId, d) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.work_locations SET
       name = COALESCE($2, name),
       address = COALESCE($3, address),
       latitude = COALESCE($4, latitude),
       longitude = COALESCE($5, longitude),
       geofence_radius_m = COALESCE($6, geofence_radius_m),
       is_active = COALESCE($7, is_active)
     WHERE location_id = $1
     RETURNING *`,
    [
      locationId,
      d.name ?? null,
      d.address ?? null,
      d.latitude ?? null,
      d.longitude ?? null,
      d.geofence_radius_m ?? null,
      d.is_active ?? null,
    ],
  );
  return row || null;
}

// ── WORK SCHEDULE (columns on staff_profiles) ────────────────

async function getSchedule(client, profileId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT sp.profile_id, sp.work_location_type, sp.work_schedule,
            sp.expected_start_time, sp.grace_minutes, sp.work_location_id,
            wl.name AS work_location_name, wl.latitude AS office_latitude,
            wl.longitude AS office_longitude, wl.geofence_radius_m,
            c.display_name
     FROM shared.staff_profiles sp
     JOIN shared.contacts c ON c.contact_id = sp.contact_id
     LEFT JOIN shared.work_locations wl ON wl.location_id = sp.work_location_id
     WHERE sp.profile_id = $1`,
    [profileId],
  );
  return row || null;
}

async function updateSchedule(client, profileId, d) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.staff_profiles SET
       work_location_type = COALESCE($2, work_location_type),
       work_schedule = COALESCE($3::jsonb, work_schedule),
       expected_start_time = COALESCE($4, expected_start_time),
       grace_minutes = COALESCE($5, grace_minutes),
       work_location_id = COALESCE($6, work_location_id)
     WHERE profile_id = $1
     RETURNING profile_id, work_location_type, work_schedule,
               expected_start_time, grace_minutes, work_location_id`,
    [
      profileId,
      d.work_location_type ?? null,
      d.work_schedule ? JSON.stringify(d.work_schedule) : null,
      d.expected_start_time ?? null,
      d.grace_minutes ?? null,
      d.work_location_id ?? null,
    ],
  );
  return row || null;
}

// ── ATTENDANCE ───────────────────────────────────────────────

async function getAttendanceByDate(client, profileId, workDate) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM shared.attendance_records
     WHERE profile_id = $1 AND work_date = $2`,
    [profileId, workDate],
  );
  return row || null;
}

async function getAttendanceById(client, attendanceId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT ar.*, sp.business, c.display_name
     FROM shared.attendance_records ar
     JOIN shared.staff_profiles sp ON sp.profile_id = ar.profile_id
     JOIN shared.contacts c ON c.contact_id = sp.contact_id
     WHERE ar.attendance_id = $1`,
    [attendanceId],
  );
  return row || null;
}

// Insert (or update if a record for the day already exists) a clock-in.
async function upsertClockIn(client, d) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.attendance_records
       (profile_id, work_date, expected_mode, status, clock_in_at,
        clock_in_ip, clock_in_latitude, clock_in_longitude, clock_in_accuracy_m,
        clock_in_location_label, distance_from_office_m, is_offsite, late_minutes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (profile_id, work_date) DO UPDATE SET
       expected_mode = EXCLUDED.expected_mode,
       status = EXCLUDED.status,
       clock_in_at = COALESCE(shared.attendance_records.clock_in_at, EXCLUDED.clock_in_at),
       clock_in_ip = COALESCE(shared.attendance_records.clock_in_ip, EXCLUDED.clock_in_ip),
       clock_in_latitude = COALESCE(shared.attendance_records.clock_in_latitude, EXCLUDED.clock_in_latitude),
       clock_in_longitude = COALESCE(shared.attendance_records.clock_in_longitude, EXCLUDED.clock_in_longitude),
       clock_in_accuracy_m = COALESCE(shared.attendance_records.clock_in_accuracy_m, EXCLUDED.clock_in_accuracy_m),
       clock_in_location_label = COALESCE(shared.attendance_records.clock_in_location_label, EXCLUDED.clock_in_location_label),
       distance_from_office_m = EXCLUDED.distance_from_office_m,
       is_offsite = EXCLUDED.is_offsite,
       late_minutes = EXCLUDED.late_minutes
     RETURNING *`,
    [
      d.profile_id,
      d.work_date,
      d.expected_mode,
      d.status,
      d.clock_in_at,
      d.clock_in_ip,
      d.clock_in_latitude,
      d.clock_in_longitude,
      d.clock_in_accuracy_m,
      d.clock_in_location_label,
      d.distance_from_office_m,
      d.is_offsite,
      d.late_minutes,
    ],
  );
  return row;
}

async function setClockOut(client, attendanceId, d) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.attendance_records SET
       clock_out_at = $2,
       clock_out_ip = $3,
       clock_out_latitude = $4,
       clock_out_longitude = $5,
       worked_minutes = $6
     WHERE attendance_id = $1
     RETURNING *`,
    [
      attendanceId,
      d.clock_out_at,
      d.clock_out_ip,
      d.clock_out_latitude,
      d.clock_out_longitude,
      d.worked_minutes,
    ],
  );
  return row || null;
}

// HR manual status set / mark absent.
async function setAttendanceStatus(client, profileId, workDate, expectedMode, status, notes) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.attendance_records
       (profile_id, work_date, expected_mode, status, notes)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (profile_id, work_date) DO UPDATE SET
       status = EXCLUDED.status,
       notes = COALESCE(EXCLUDED.notes, shared.attendance_records.notes)
     RETURNING *`,
    [profileId, workDate, expectedMode, status, notes || null],
  );
  return row;
}

async function listAttendance(client, { profileId, fromDate, toDate, status, limit = 200, offset = 0 } = {}) {
  const params = [];
  const where = [];
  if (profileId) {
    params.push(profileId);
    where.push(`ar.profile_id = $${params.length}`);
  }
  if (fromDate) {
    params.push(fromDate);
    where.push(`ar.work_date >= $${params.length}`);
  }
  if (toDate) {
    params.push(toDate);
    where.push(`ar.work_date <= $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`ar.status = $${params.length}`);
  }
  params.push(limit);
  params.push(offset);
  const { rows } = await client.query(
    `SELECT ar.*, c.display_name, sp.business, sp.job_title, sp.department
     FROM shared.attendance_records ar
     JOIN shared.staff_profiles sp ON sp.profile_id = ar.profile_id
     JOIN shared.contacts c ON c.contact_id = sp.contact_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY ar.work_date DESC, c.display_name ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

async function setJustification(client, attendanceId, { type, note }) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.attendance_records SET
       justification_type = $2,
       justification_note = $3,
       justification_status = 'pending',
       justification_reviewed_by = NULL,
       justification_reviewed_at = NULL
     WHERE attendance_id = $1
     RETURNING *`,
    [attendanceId, type, note],
  );
  return row || null;
}

async function reviewJustification(client, attendanceId, { status, reviewerId }) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.attendance_records SET
       justification_status = $2,
       justification_reviewed_by = $3,
       justification_reviewed_at = now()
     WHERE attendance_id = $1
     RETURNING *`,
    [attendanceId, status, reviewerId],
  );
  return row || null;
}

// Payroll: unexcused absences in a month — recorded absences whose
// justification was not approved and which no approved leave covers.
async function countUnexcusedAbsences(client, profileId, month, year) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT COUNT(*)::int AS days
     FROM shared.attendance_records ar
     WHERE ar.profile_id = $1
       AND ar.status = 'absent'
       AND EXTRACT(MONTH FROM ar.work_date) = $2
       AND EXTRACT(YEAR  FROM ar.work_date) = $3
       AND (ar.justification_status IS DISTINCT FROM 'approved')
       AND NOT EXISTS (
         SELECT 1 FROM shared.leave_requests lr
         WHERE lr.profile_id = ar.profile_id
           AND lr.status = 'approved'
           AND ar.work_date BETWEEN lr.start_date AND lr.end_date
       )`,
    [profileId, month, year],
  );
  return row.days;
}

// Attendance summary for a window — used by KPI computation.
async function attendanceSummary(client, profileId, fromDate, toDate) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('present','late','remote'))::int AS days_attended,
       COUNT(*) FILTER (WHERE status = 'late')::int AS days_late,
       COUNT(*) FILTER (WHERE status = 'absent')::int AS days_absent,
       COUNT(*) FILTER (WHERE expected_mode <> 'off')::int AS scheduled_days,
       COALESCE(SUM(late_minutes), 0)::int AS total_late_minutes,
       COUNT(*) FILTER (WHERE is_offsite)::int AS offsite_days
     FROM shared.attendance_records
     WHERE profile_id = $1 AND work_date BETWEEN $2 AND $3`,
    [profileId, fromDate, toDate],
  );
  return row;
}

// ── STAFF QUERIES ────────────────────────────────────────────

async function listQueries(client, { profileId, status, limit = 100, offset = 0 } = {}) {
  const params = [];
  const where = [];
  if (profileId) {
    params.push(profileId);
    where.push(`q.profile_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`q.status = $${params.length}`);
  }
  params.push(limit);
  params.push(offset);
  const { rows } = await client.query(
    `SELECT q.*, c.display_name, sp.business, sp.job_title,
            ru.email AS raised_by_email
     FROM shared.staff_queries q
     JOIN shared.staff_profiles sp ON sp.profile_id = q.profile_id
     JOIN shared.contacts c ON c.contact_id = sp.contact_id
     LEFT JOIN shared.users ru ON ru.user_id = q.raised_by
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY q.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

async function getQuery(client, queryId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT q.*, c.display_name, sp.business
     FROM shared.staff_queries q
     JOIN shared.staff_profiles sp ON sp.profile_id = q.profile_id
     JOIN shared.contacts c ON c.contact_id = sp.contact_id
     WHERE q.query_id = $1`,
    [queryId],
  );
  return row || null;
}

async function insertQuery(client, d) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.staff_queries
       (profile_id, raised_by, query_type, severity, related_attendance_id,
        subject, details, due_date)
     VALUES ($1,$2,$3,COALESCE($4,'normal'),$5,$6,$7,$8)
     RETURNING *`,
    [
      d.profile_id,
      d.raised_by,
      d.query_type,
      d.severity,
      d.related_attendance_id || null,
      d.subject,
      d.details,
      d.due_date || null,
    ],
  );
  return row;
}

async function respondQuery(client, queryId, response) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.staff_queries SET
       response = $2, responded_at = now(),
       status = CASE WHEN status = 'open' THEN 'responded' ELSE status END
     WHERE query_id = $1
     RETURNING *`,
    [queryId, response],
  );
  return row || null;
}

async function resolveQuery(client, queryId, { status, resolution, resolvedBy }) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.staff_queries SET
       status = $2,
       resolution = COALESCE($3, resolution),
       resolved_by = $4,
       resolved_at = CASE WHEN $2 = 'closed' THEN now() ELSE resolved_at END
     WHERE query_id = $1
     RETURNING *`,
    [queryId, status, resolution || null, resolvedBy],
  );
  return row || null;
}

// ── PERFORMANCE: REVIEWS ─────────────────────────────────────

async function listReviews(client, profileId) {
  const { rows } = await client.query(
    `SELECT pr.*, ru.email AS reviewer_email
     FROM shared.performance_reviews pr
     LEFT JOIN shared.users ru ON ru.user_id = pr.reviewer_id
     WHERE pr.profile_id = $1
     ORDER BY pr.period_end DESC`,
    [profileId],
  );
  return rows;
}

async function getReview(client, reviewId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM shared.performance_reviews WHERE review_id = $1`,
    [reviewId],
  );
  return row || null;
}

async function insertReview(client, d) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.performance_reviews
       (profile_id, reviewer_id, period_start, period_end, overall_rating,
        kpi_snapshot, strengths, improvements, summary, status)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,COALESCE($10,'draft'))
     RETURNING *`,
    [
      d.profile_id,
      d.reviewer_id,
      d.period_start,
      d.period_end,
      d.overall_rating ?? null,
      d.kpi_snapshot ? JSON.stringify(d.kpi_snapshot) : null,
      d.strengths || null,
      d.improvements || null,
      d.summary || null,
      d.status || null,
    ],
  );
  return row;
}

async function updateReview(client, reviewId, d) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.performance_reviews SET
       overall_rating = COALESCE($2, overall_rating),
       strengths = COALESCE($3, strengths),
       improvements = COALESCE($4, improvements),
       summary = COALESCE($5, summary),
       status = COALESCE($6, status),
       acknowledged_at = CASE WHEN $6 = 'acknowledged' THEN now() ELSE acknowledged_at END
     WHERE review_id = $1
     RETURNING *`,
    [
      reviewId,
      d.overall_rating ?? null,
      d.strengths ?? null,
      d.improvements ?? null,
      d.summary ?? null,
      d.status ?? null,
    ],
  );
  return row || null;
}

// ── PERFORMANCE: GOALS ───────────────────────────────────────

async function listGoals(client, profileId) {
  const { rows } = await client.query(
    `SELECT * FROM shared.performance_goals
     WHERE profile_id = $1
     ORDER BY status ASC, due_date ASC NULLS LAST, created_at DESC`,
    [profileId],
  );
  return rows;
}

async function insertGoal(client, d) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.performance_goals
       (profile_id, title, description, metric, target_value, current_value,
        unit, weight, due_date, created_by)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6,0),$7,COALESCE($8,1),$9,$10)
     RETURNING *`,
    [
      d.profile_id,
      d.title,
      d.description || null,
      d.metric || null,
      d.target_value ?? null,
      d.current_value ?? null,
      d.unit || null,
      d.weight ?? null,
      d.due_date || null,
      d.created_by || null,
    ],
  );
  return row;
}

async function updateGoal(client, goalId, d) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.performance_goals SET
       title = COALESCE($2, title),
       description = COALESCE($3, description),
       target_value = COALESCE($4, target_value),
       current_value = COALESCE($5, current_value),
       unit = COALESCE($6, unit),
       weight = COALESCE($7, weight),
       due_date = COALESCE($8, due_date),
       status = COALESCE($9, status)
     WHERE goal_id = $1
     RETURNING *`,
    [
      goalId,
      d.title ?? null,
      d.description ?? null,
      d.target_value ?? null,
      d.current_value ?? null,
      d.unit ?? null,
      d.weight ?? null,
      d.due_date ?? null,
      d.status ?? null,
    ],
  );
  return row || null;
}

// ── OVERVIEW AGGREGATES (HR dashboard) ───────────────────────

async function overviewCounts(client, today, business) {
  const {
    rows: [row],
  } = await client.query(
    `WITH active_staff AS (
       SELECT profile_id FROM shared.staff_profiles
       WHERE is_deleted = false AND end_date IS NULL
         AND ($2::TEXT IS NULL OR business = $2)
     )
     SELECT
       (SELECT COUNT(*) FROM active_staff)::int AS total_staff,
       (SELECT COUNT(*) FROM shared.attendance_records ar
          JOIN active_staff a ON a.profile_id = ar.profile_id
          WHERE ar.work_date = $1 AND ar.status IN ('present','late','remote'))::int AS present_today,
       (SELECT COUNT(*) FROM shared.attendance_records ar
          JOIN active_staff a ON a.profile_id = ar.profile_id
          WHERE ar.work_date = $1 AND ar.status = 'late')::int AS late_today,
       (SELECT COUNT(*) FROM shared.leave_requests lr
          JOIN active_staff a ON a.profile_id = lr.profile_id
          WHERE lr.status = 'approved' AND $1 BETWEEN lr.start_date AND lr.end_date)::int AS on_leave_today,
       (SELECT COUNT(*) FROM shared.leave_requests lr
          JOIN active_staff a ON a.profile_id = lr.profile_id
          WHERE lr.status = 'pending')::int AS pending_leave,
       (SELECT COUNT(*) FROM shared.attendance_records ar
          JOIN active_staff a ON a.profile_id = ar.profile_id
          WHERE ar.justification_status = 'pending')::int AS pending_justifications,
       (SELECT COUNT(*) FROM shared.staff_queries q
          JOIN active_staff a ON a.profile_id = q.profile_id
          WHERE q.status IN ('open','responded'))::int AS open_queries`,
    [today, business || null],
  );
  return row;
}

module.exports = {
  // work locations
  listWorkLocations,
  getWorkLocation,
  insertWorkLocation,
  updateWorkLocation,
  // schedule
  getSchedule,
  updateSchedule,
  // attendance
  getAttendanceByDate,
  getAttendanceById,
  upsertClockIn,
  setClockOut,
  setAttendanceStatus,
  listAttendance,
  setJustification,
  reviewJustification,
  countUnexcusedAbsences,
  attendanceSummary,
  // queries
  listQueries,
  getQuery,
  insertQuery,
  respondQuery,
  resolveQuery,
  // performance
  listReviews,
  getReview,
  insertReview,
  updateReview,
  listGoals,
  insertGoal,
  updateGoal,
  // overview
  overviewCounts,
};
