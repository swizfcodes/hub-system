"use strict";

// ─────────────────────────────────────────────────────────────
// HR SERVICE
//
// The people-management layer: attendance (clock in/out with IP +
// GPS capture and geofencing), work schedules, the lateness/absence
// justification workflow, HR staff queries, and performance (live
// role-aware KPIs plus manager reviews & goals).
//
// Self-service endpoints resolve the caller's own staff profile from
// their user account, so any signed-in employee can clock in, see
// their attendance, respond to queries and view their performance —
// while management actions are gated by can('staff', ...).
// ─────────────────────────────────────────────────────────────

const { withSharedContext, withBusinessContext } = require("../../config/db");
const logger = require("../../config/logger");
const auditService = require("../audit/audit.service");
const notifService = require("../notifications/notifications.service");
const repo = require("./hr.repository");
const staffRepo = require("./staff.repository");
const { reverseGeocode } = require("../../integrations/geocoding/geoapify");

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// ── small helpers ────────────────────────────────────────────

function toDateStr(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

// Great-circle distance in metres between two lat/lng points.
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// Minutes late relative to expected_start_time + grace. Returns 0 if
// no start time is configured or the arrival is within grace.
function computeLateMinutes(now, startTime, graceMinutes) {
  if (!startTime) return 0;
  const [h, m] = String(startTime).split(":").map(Number);
  const expected = new Date(now);
  expected.setHours(h || 0, m || 0, 0, 0);
  expected.setMinutes(expected.getMinutes() + (graceMinutes || 0));
  const diffMin = Math.floor((now.getTime() - expected.getTime()) / 60000);
  return diffMin > 0 ? diffMin : 0;
}

async function resolveOwnProfile(client, user) {
  const profileId = await staffRepo.resolveProfileIdForUser(
    client,
    user.user_id,
  );
  if (!profileId) {
    throw Object.assign(
      new Error(
        "Your user account is not linked to a staff profile. Ask an admin to link your profile.",
      ),
      { status: 400 },
    );
  }
  return profileId;
}

async function userIdForProfile(client, profileId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT user_id FROM shared.users WHERE staff_profile_id = $1`,
    [profileId],
  );
  return row?.user_id || null;
}

// ─────────────────────────────────────────────────────────────
// ATTENDANCE — clock in / out
// ─────────────────────────────────────────────────────────────

async function clockIn(user, { latitude, longitude, accuracy, locationLabel, ip }) {
  const lat = latitude != null ? Number(latitude) : null;
  const lng = longitude != null ? Number(longitude) : null;

  // Reverse-geocode the GPS fix into a readable address BEFORE opening the
  // transaction: the external HTTP call must never hold a DB connection
  // open, and a slow/failed lookup must never block clocking in. Falls back
  // to null (the UI then shows a plain map pin from the raw coordinates).
  let label = locationLabel || null;
  if (!label && lat != null && lng != null) {
    label = await reverseGeocode(lat, lng);
  }

  return withSharedContext(async (client) => {
    const profileId = await resolveOwnProfile(client, user);
    const sched = await repo.getSchedule(client, profileId);

    const now = new Date();
    const workDate = toDateStr(now);

    const existing = await repo.getAttendanceByDate(client, profileId, workDate);
    if (existing && existing.clock_in_at) {
      throw Object.assign(new Error("You have already clocked in today."), {
        status: 409,
      });
    }

    const dayKey = WEEKDAYS[now.getDay()];
    const expectedMode = (sched.work_schedule || {})[dayKey] || "on_site";

    let distance = null;
    let isOffsite = false;
    let lateMinutes = 0;
    let status;

    if (expectedMode === "on_site") {
      lateMinutes = computeLateMinutes(
        now,
        sched.expected_start_time,
        sched.grace_minutes,
      );
      // Geofence only when both the office and the device reported coords.
      if (
        sched.office_latitude != null &&
        sched.office_longitude != null &&
        lat != null &&
        lng != null
      ) {
        distance = haversineMeters(
          lat,
          lng,
          Number(sched.office_latitude),
          Number(sched.office_longitude),
        );
        isOffsite = distance > (sched.geofence_radius_m || 250);
      }
      status = lateMinutes > 0 ? "late" : "present";
    } else if (expectedMode === "remote") {
      lateMinutes = computeLateMinutes(
        now,
        sched.expected_start_time,
        sched.grace_minutes,
      );
      status = "remote";
    } else {
      // Scheduled off day but the employee chose to work — record it as
      // a remote/worked day so it is never counted as an absence.
      status = "remote";
    }

    const record = await repo.upsertClockIn(client, {
      profile_id: profileId,
      work_date: workDate,
      expected_mode: expectedMode,
      status,
      clock_in_at: now.toISOString(),
      clock_in_ip: ip || null,
      clock_in_latitude: lat,
      clock_in_longitude: lng,
      clock_in_accuracy_m: accuracy != null ? Number(accuracy) : null,
      clock_in_location_label: label,
      distance_from_office_m: distance,
      is_offsite: isOffsite,
      late_minutes: lateMinutes,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: sched.business || user.current_business,
      module: "staff",
      action: "create",
      table: "shared.attendance_records",
      recordId: record.attendance_id,
      after: {
        status,
        late_minutes: lateMinutes,
        is_offsite: isOffsite,
        distance_from_office_m: distance,
      },
    });

    return record;
  });
}

async function clockOut(user, { latitude, longitude, ip }) {
  return withSharedContext(async (client) => {
    const profileId = await resolveOwnProfile(client, user);
    const now = new Date();
    const workDate = toDateStr(now);
    const existing = await repo.getAttendanceByDate(client, profileId, workDate);
    if (!existing || !existing.clock_in_at) {
      throw Object.assign(new Error("Clock in before clocking out."), {
        status: 400,
      });
    }
    if (existing.clock_out_at) {
      throw Object.assign(new Error("You have already clocked out today."), {
        status: 409,
      });
    }
    const workedMinutes = Math.max(
      0,
      Math.round((now.getTime() - new Date(existing.clock_in_at).getTime()) / 60000),
    );
    const record = await repo.setClockOut(client, existing.attendance_id, {
      clock_out_at: now.toISOString(),
      clock_out_ip: ip || null,
      clock_out_latitude: latitude != null ? Number(latitude) : null,
      clock_out_longitude: longitude != null ? Number(longitude) : null,
      worked_minutes: workedMinutes,
    });
    return record;
  });
}

async function getMyToday(user) {
  return withSharedContext(async (client) => {
    const profileId = await resolveOwnProfile(client, user);
    const sched = await repo.getSchedule(client, profileId);
    const now = new Date();
    const dayKey = WEEKDAYS[now.getDay()];
    const expectedMode = (sched.work_schedule || {})[dayKey] || "on_site";
    const record = await repo.getAttendanceByDate(
      client,
      profileId,
      toDateStr(now),
    );
    return {
      profile_id: profileId,
      work_date: toDateStr(now),
      expected_mode: expectedMode,
      expected_start_time: sched.expected_start_time,
      work_location_name: sched.work_location_name,
      clocked_in: !!(record && record.clock_in_at),
      clocked_out: !!(record && record.clock_out_at),
      record: record || null,
    };
  });
}

async function listMyAttendance(user, { fromDate, toDate } = {}) {
  return withSharedContext(async (client) => {
    const profileId = await resolveOwnProfile(client, user);
    const rows = await repo.listAttendance(client, {
      profileId,
      fromDate,
      toDate,
    });
    return { profile_id: profileId, data: rows };
  });
}

async function listAttendance(query = {}) {
  return withSharedContext(async (client) => {
    const rows = await repo.listAttendance(client, {
      profileId: query.profile_id,
      fromDate: query.from_date,
      toDate: query.to_date,
      status: query.status,
      limit: query.limit ? parseInt(query.limit) : 200,
      offset: query.page ? (parseInt(query.page) - 1) * (parseInt(query.limit) || 200) : 0,
    });
    return { data: rows };
  });
}

// HR materialises no-shows: any active staff member scheduled to work
// `date` with no attendance row gets an 'absent' record, so payroll and
// the dashboards reflect reality without waiting on a clock-in.
async function reconcileDay(date, business, user) {
  return withSharedContext(async (client) => {
    const dayKey = WEEKDAYS[new Date(date).getDay()];
    const { rows: staff } = await client.query(
      `SELECT sp.profile_id, sp.work_schedule
       FROM shared.staff_profiles sp
       WHERE sp.is_deleted = false AND sp.end_date IS NULL
         AND ($1::TEXT IS NULL OR sp.business = $1)
         AND sp.start_date <= $2`,
      [business || null, date],
    );
    let created = 0;
    for (const s of staff) {
      const mode = (s.work_schedule || {})[dayKey] || "on_site";
      if (mode === "off") continue;
      const existing = await repo.getAttendanceByDate(client, s.profile_id, date);
      // On approved leave? mark as on_leave rather than absent.
      const {
        rows: [leave],
      } = await client.query(
        `SELECT 1 FROM shared.leave_requests
         WHERE profile_id = $1 AND status = 'approved'
           AND $2 BETWEEN start_date AND end_date LIMIT 1`,
        [s.profile_id, date],
      );
      if (existing) {
        if (!existing.clock_in_at && leave && existing.status !== "on_leave") {
          await repo.setAttendanceStatus(client, s.profile_id, date, mode, "on_leave", null);
        }
        continue;
      }
      await repo.setAttendanceStatus(
        client,
        s.profile_id,
        date,
        mode,
        leave ? "on_leave" : "absent",
        null,
      );
      created++;
    }
    if (user) {
      await auditService.log(client, {
        userId: user.user_id,
        userName: user.display_name,
        business: business || user.current_business,
        module: "staff",
        action: "create",
        table: "shared.attendance_records",
        recordId: null,
        metadata: { reconciled_date: date, records_created: created },
      });
    }
    return { date, records_created: created };
  });
}

// ─────────────────────────────────────────────────────────────
// JUSTIFICATIONS
// ─────────────────────────────────────────────────────────────

async function submitJustification(user, attendanceId, { type, note }) {
  return withSharedContext(async (client) => {
    const profileId = await resolveOwnProfile(client, user);
    const record = await repo.getAttendanceById(client, attendanceId);
    if (!record) throw Object.assign(new Error("Attendance record not found"), { status: 404 });
    if (record.profile_id !== profileId) {
      throw Object.assign(new Error("You can only justify your own attendance."), {
        status: 403,
      });
    }
    if (!note || !note.trim()) {
      throw Object.assign(new Error("A justification note is required."), { status: 400 });
    }
    const updated = await repo.setJustification(client, attendanceId, {
      type: type || (record.status === "absent" ? "absence" : record.late_minutes > 0 ? "lateness" : "offsite"),
      note: note.trim(),
    });
    // Notify approvers via the profile's manager if linked.
    return updated;
  });
}

async function reviewJustification(attendanceId, { status }, user) {
  if (!["approved", "rejected"].includes(status)) {
    throw Object.assign(new Error("status must be 'approved' or 'rejected'"), { status: 400 });
  }
  return withSharedContext(async (client) => {
    const record = await repo.getAttendanceById(client, attendanceId);
    if (!record) throw Object.assign(new Error("Attendance record not found"), { status: 404 });
    if (!record.justification_status) {
      throw Object.assign(new Error("There is no justification to review."), { status: 400 });
    }
    const updated = await repo.reviewJustification(client, attendanceId, {
      status,
      reviewerId: user.user_id,
    });

    const targetUserId = await userIdForProfile(client, record.profile_id);
    if (targetUserId) {
      await notifService.create(client, {
        userId: targetUserId,
        business: record.business,
        type: "hr_attendance",
        title: `Justification ${status}`,
        body: `Your explanation for ${toDateStr(record.work_date)} was ${status}.`,
        referenceType: "attendance",
        referenceId: attendanceId,
        actionUrl: "/me/hr",
      });
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: record.business,
      module: "staff",
      action: "approve",
      table: "shared.attendance_records",
      recordId: attendanceId,
      after: { justification_status: status },
    });
    return updated;
  });
}

// ─────────────────────────────────────────────────────────────
// WORK SCHEDULE & LOCATIONS
// ─────────────────────────────────────────────────────────────

const VALID_DAY_MODES = ["on_site", "remote", "off"];

function validateSchedule(ws) {
  if (ws == null) return;
  if (typeof ws !== "object") {
    throw Object.assign(new Error("work_schedule must be an object"), { status: 400 });
  }
  for (const day of Object.keys(ws)) {
    if (!WEEKDAYS.includes(day)) {
      throw Object.assign(new Error(`Invalid weekday key: ${day}`), { status: 400 });
    }
    if (!VALID_DAY_MODES.includes(ws[day])) {
      throw Object.assign(
        new Error(`work_schedule.${day} must be one of ${VALID_DAY_MODES.join(", ")}`),
        { status: 400 },
      );
    }
  }
}

async function getSchedule(profileId) {
  return withSharedContext(async (client) => {
    const sched = await repo.getSchedule(client, profileId);
    if (!sched) throw Object.assign(new Error("Staff profile not found"), { status: 404 });
    return sched;
  });
}

async function updateSchedule(profileId, fields, user) {
  validateSchedule(fields.work_schedule);
  return withSharedContext(async (client) => {
    const updated = await repo.updateSchedule(client, profileId, fields);
    if (!updated) throw Object.assign(new Error("Staff profile not found"), { status: 404 });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: user.current_business,
      module: "staff",
      action: "edit",
      table: "shared.staff_profiles",
      recordId: profileId,
      after: updated,
    });
    return updated;
  });
}

async function listWorkLocations(business) {
  return withSharedContext(async (client) => {
    return { data: await repo.listWorkLocations(client, business) };
  });
}

async function createWorkLocation(data, user) {
  if (!data.name) throw Object.assign(new Error("name is required"), { status: 400 });
  return withSharedContext(async (client) => {
    const loc = await repo.insertWorkLocation(client, {
      business: data.business || user.current_business,
      name: data.name,
      address: data.address,
      latitude: data.latitude != null ? Number(data.latitude) : null,
      longitude: data.longitude != null ? Number(data.longitude) : null,
      geofence_radius_m: data.geofence_radius_m != null ? parseInt(data.geofence_radius_m) : null,
    });
    return loc;
  });
}

async function updateWorkLocation(locationId, data) {
  return withSharedContext(async (client) => {
    const loc = await repo.updateWorkLocation(client, locationId, data);
    if (!loc) throw Object.assign(new Error("Work location not found"), { status: 404 });
    return loc;
  });
}

// ─────────────────────────────────────────────────────────────
// STAFF QUERIES
// ─────────────────────────────────────────────────────────────

async function listQueries(query = {}) {
  return withSharedContext(async (client) => {
    return {
      data: await repo.listQueries(client, {
        profileId: query.profile_id,
        status: query.status,
      }),
    };
  });
}

async function listMyQueries(user) {
  return withSharedContext(async (client) => {
    const profileId = await resolveOwnProfile(client, user);
    return { data: await repo.listQueries(client, { profileId }) };
  });
}

async function raiseQuery(data, user) {
  if (!data.profile_id || !data.subject || !data.details) {
    throw Object.assign(new Error("profile_id, subject and details are required"), {
      status: 400,
    });
  }
  return withSharedContext(async (client) => {
    const q = await repo.insertQuery(client, {
      profile_id: data.profile_id,
      raised_by: user.user_id,
      query_type: data.query_type || "other",
      severity: data.severity,
      related_attendance_id: data.related_attendance_id,
      subject: data.subject,
      details: data.details,
      due_date: data.due_date,
    });
    const targetUserId = await userIdForProfile(client, data.profile_id);
    if (targetUserId) {
      await notifService.create(client, {
        userId: targetUserId,
        business: user.current_business,
        type: "hr_query",
        title: "You have a new HR query",
        body: data.subject,
        referenceType: "staff_query",
        referenceId: q.query_id,
        actionUrl: "/me/hr",
      });
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name,
      business: user.current_business,
      module: "staff",
      action: "create",
      table: "shared.staff_queries",
      recordId: q.query_id,
      after: { subject: data.subject, query_type: q.query_type },
    });
    return q;
  });
}

async function respondToQuery(queryId, response, user) {
  if (!response || !response.trim()) {
    throw Object.assign(new Error("A response is required"), { status: 400 });
  }
  return withSharedContext(async (client) => {
    const profileId = await resolveOwnProfile(client, user);
    const q = await repo.getQuery(client, queryId);
    if (!q) throw Object.assign(new Error("Query not found"), { status: 404 });
    if (q.profile_id !== profileId) {
      throw Object.assign(new Error("You can only respond to your own queries."), {
        status: 403,
      });
    }
    const updated = await repo.respondQuery(client, queryId, response.trim());
    if (q.raised_by) {
      await notifService.create(client, {
        userId: q.raised_by,
        business: q.business,
        type: "hr_query",
        title: "Query response received",
        body: `${q.display_name} responded to: ${q.subject}`,
        referenceType: "staff_query",
        referenceId: queryId,
        actionUrl: "/staff?tab=queries",
      });
    }
    return updated;
  });
}

async function resolveQuery(queryId, { status, resolution }, user) {
  if (!["closed", "escalated", "open"].includes(status)) {
    throw Object.assign(new Error("status must be 'closed', 'escalated' or 'open'"), {
      status: 400,
    });
  }
  return withSharedContext(async (client) => {
    const q = await repo.getQuery(client, queryId);
    if (!q) throw Object.assign(new Error("Query not found"), { status: 404 });
    const updated = await repo.resolveQuery(client, queryId, {
      status,
      resolution,
      resolvedBy: user.user_id,
    });
    return updated;
  });
}

// ─────────────────────────────────────────────────────────────
// PERFORMANCE — live role-aware KPIs + reviews + goals
// ─────────────────────────────────────────────────────────────

function buildGoalKpi(goals) {
  const active = goals.filter((g) => g.status !== "cancelled");
  if (!active.length) {
    return {
      key: "goals",
      label: "Goal completion",
      value: null,
      unit: "%",
      target: 100,
      score: null,
      weight: 2,
      hint: "No goals set yet",
    };
  }
  const progress = active.map((g) => {
    if (g.status === "achieved") return 100;
    if (g.status === "missed") return 0;
    if (g.target_value && Number(g.target_value) > 0) {
      return clamp(Math.round((Number(g.current_value) / Number(g.target_value)) * 100));
    }
    return 50;
  });
  const avg = Math.round(progress.reduce((a, b) => a + b, 0) / progress.length);
  return {
    key: "goals",
    label: "Goal completion",
    value: avg,
    unit: "%",
    target: 100,
    score: avg,
    weight: 2,
    hint: `${active.length} active goal(s)`,
  };
}

// Best-effort sales contribution from the business schema. Never throws.
async function salesContribution(business, profileId, year) {
  try {
    return await withBusinessContext(business, async (client) => {
      const {
        rows: [r],
      } = await client.query(
        `SELECT COALESCE(SUM(commission_amount),0)::numeric AS commission,
                COUNT(*)::int AS deals
         FROM commission_earned
         WHERE profile_id = $1 AND period_year = $2`,
        [profileId, year],
      );
      return { commission: Number(r.commission), deals: r.deals };
    });
  } catch {
    return null;
  }
}

function isSalesRole(profile) {
  const dept = (profile.department || "").toLowerCase();
  const title = (profile.job_title || "").toLowerCase();
  return (
    dept === "sales" ||
    /sales|retail|store|pos|account manager|business develop/.test(title)
  );
}

async function computePerformance(profileId, { from, to } = {}) {
  return withSharedContext(async (client) => {
    const sched = await repo.getSchedule(client, profileId);
    if (!sched) throw Object.assign(new Error("Staff profile not found"), { status: 404 });
    const {
      rows: [profile],
    } = await client.query(
      `SELECT sp.profile_id, sp.business, sp.department, sp.job_title,
              sp.start_date, c.display_name
       FROM shared.staff_profiles sp
       JOIN shared.contacts c ON c.contact_id = sp.contact_id
       WHERE sp.profile_id = $1`,
      [profileId],
    );

    const now = new Date();
    const year = now.getFullYear();
    const toDate = to || toDateStr(now);
    const fromDate =
      from || toDateStr(new Date(now.getFullYear(), now.getMonth() - 2, 1)); // ~ rolling quarter

    const sum = await repo.attendanceSummary(client, profileId, fromDate, toDate);
    const goals = await repo.listGoals(client, profileId);
    const reviews = await repo.listReviews(client, profileId);

    const kpis = [];

    // Attendance rate (all roles).
    const attRate = sum.scheduled_days
      ? Math.round((sum.days_attended / sum.scheduled_days) * 100)
      : null;
    kpis.push({
      key: "attendance_rate",
      label: "Attendance rate",
      value: attRate,
      unit: "%",
      target: 95,
      score: attRate,
      weight: 3,
      hint: `${sum.days_attended}/${sum.scheduled_days} scheduled days`,
    });

    // Punctuality (all roles).
    const punct = sum.days_attended
      ? Math.round(((sum.days_attended - sum.days_late) / sum.days_attended) * 100)
      : null;
    kpis.push({
      key: "punctuality",
      label: "Punctuality",
      value: punct,
      unit: "%",
      target: 90,
      score: punct,
      weight: 2,
      hint: `${sum.days_late} late arrival(s), ${sum.total_late_minutes} min total`,
    });

    // Goals (all roles).
    kpis.push(buildGoalKpi(goals));

    // Sales contribution — only for sales-facing roles, informational.
    if (isSalesRole(profile)) {
      const sales = await salesContribution(profile.business, profileId, year);
      kpis.push({
        key: "sales_contribution",
        label: "Sales contribution (YTD)",
        value: sales ? sales.commission : null,
        unit: "₦ commission",
        target: null,
        score: null, // no universal target — shown, not scored
        weight: 0,
        hint: sales ? `${sales.deals} attributed sale(s)` : "No sales data",
      });
    }

    // Weighted overall score across KPIs that have a real score.
    const scored = kpis.filter((k) => k.score != null && k.weight > 0);
    const totalWeight = scored.reduce((a, k) => a + k.weight, 0);
    const overallScore = totalWeight
      ? Math.round(scored.reduce((a, k) => a + k.score * k.weight, 0) / totalWeight)
      : null;
    const rating = overallScore != null ? Math.round((overallScore / 20) * 10) / 10 : null;

    return {
      profile: {
        profile_id: profile.profile_id,
        display_name: profile.display_name,
        department: profile.department,
        job_title: profile.job_title,
        business: profile.business,
      },
      period: { from: fromDate, to: toDate },
      kpis,
      overall_score: overallScore,
      rating, // 0–5
      attendance_summary: sum,
      goals,
      reviews,
    };
  });
}

async function getMyPerformance(user) {
  return withSharedContext(async (client) => {
    const profileId = await resolveOwnProfile(client, user);
    return profileId;
  }).then((profileId) => computePerformance(profileId, {}));
}

async function createReview(profileId, data, user) {
  if (!data.period_start || !data.period_end) {
    throw Object.assign(new Error("period_start and period_end are required"), {
      status: 400,
    });
  }
  return withSharedContext(async (client) => {
    const review = await repo.insertReview(client, {
      profile_id: profileId,
      reviewer_id: user.user_id,
      period_start: data.period_start,
      period_end: data.period_end,
      overall_rating: data.overall_rating,
      kpi_snapshot: data.kpi_snapshot,
      strengths: data.strengths,
      improvements: data.improvements,
      summary: data.summary,
      status: data.status,
    });
    return review;
  });
}

async function updateReview(reviewId, data) {
  return withSharedContext(async (client) => {
    const review = await repo.updateReview(client, reviewId, data);
    if (!review) throw Object.assign(new Error("Review not found"), { status: 404 });
    return review;
  });
}

async function acknowledgeReview(reviewId, user) {
  return withSharedContext(async (client) => {
    const profileId = await resolveOwnProfile(client, user);
    const review = await repo.getReview(client, reviewId);
    if (!review) throw Object.assign(new Error("Review not found"), { status: 404 });
    if (review.profile_id !== profileId) {
      throw Object.assign(new Error("You can only acknowledge your own review."), {
        status: 403,
      });
    }
    return repo.updateReview(client, reviewId, { status: "acknowledged" });
  });
}

async function createGoal(profileId, data, user) {
  if (!data.title) throw Object.assign(new Error("title is required"), { status: 400 });
  return withSharedContext(async (client) => {
    return repo.insertGoal(client, { ...data, profile_id: profileId, created_by: user.user_id });
  });
}

async function updateGoal(goalId, data) {
  return withSharedContext(async (client) => {
    const goal = await repo.updateGoal(client, goalId, data);
    if (!goal) throw Object.assign(new Error("Goal not found"), { status: 404 });
    return goal;
  });
}

async function listGoals(profileId) {
  return withSharedContext(async (client) => {
    return { data: await repo.listGoals(client, profileId) };
  });
}

// ─────────────────────────────────────────────────────────────
// DASHBOARDS
// ─────────────────────────────────────────────────────────────

async function getOverview(query = {}) {
  return withSharedContext(async (client) => {
    const today = toDateStr(new Date());
    const business = query.business || null;
    const counts = await repo.overviewCounts(client, today, business);
    const pendingLeave = await staffRepo.listLeaveRequests(client, {
      status: "pending",
      limit: 10,
    });
    const pendingJustifications = await repo.listAttendance(client, {
      status: undefined,
      limit: 25,
    });
    const openQueries = await repo.listQueries(client, { status: "open", limit: 10 });
    return {
      today,
      counts,
      pending_leave: pendingLeave,
      pending_justifications: pendingJustifications.filter(
        (r) => r.justification_status === "pending",
      ),
      open_queries: openQueries,
    };
  });
}

async function getMyHrSummary(user) {
  return withSharedContext(async (client) => {
    const profileId = await resolveOwnProfile(client, user);
    const sched = await repo.getSchedule(client, profileId);
    const today = await repo.getAttendanceByDate(client, profileId, toDateStr(new Date()));
    const leaveBalance = await staffRepo.getLeaveBalanceSummary(
      client,
      profileId,
      new Date().getFullYear(),
    );
    const queries = await repo.listQueries(client, { profileId, status: "open" });
    const goals = await repo.listGoals(client, profileId);
    const reviews = await repo.listReviews(client, profileId);
    return {
      profile_id: profileId,
      schedule: sched,
      today: today || null,
      leave_balance: leaveBalance,
      open_queries: queries,
      goals: goals.filter((g) => g.status === "active"),
      latest_review: reviews[0] || null,
    };
  });
}

module.exports = {
  // attendance
  clockIn,
  clockOut,
  getMyToday,
  listMyAttendance,
  listAttendance,
  reconcileDay,
  // justifications
  submitJustification,
  reviewJustification,
  // schedule & locations
  getSchedule,
  updateSchedule,
  listWorkLocations,
  createWorkLocation,
  updateWorkLocation,
  // queries
  listQueries,
  listMyQueries,
  raiseQuery,
  respondToQuery,
  resolveQuery,
  // performance
  computePerformance,
  getMyPerformance,
  createReview,
  updateReview,
  acknowledgeReview,
  createGoal,
  updateGoal,
  listGoals,
  // dashboards
  getOverview,
  getMyHrSummary,
};
