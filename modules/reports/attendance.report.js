"use strict";

// Attendance / leave report family.
// Note: leave_requests PK is leave_id; profiles join via profile_id.

async function generate(client, { reportType, startDate, endDate }) {
  switch (reportType) {
    case "leave_summary":
      return generateLeaveSummary(client, { startDate, endDate });
    case "by_staff":
      return generateByStaff(client, { startDate, endDate });
    default:
      throw Object.assign(
        new Error("reportType must be: leave_summary, by_staff"),
        { status: 400 },
      );
  }
}

async function generateLeaveSummary(client, { startDate, endDate }) {
  const { rows } = await client.query(
    `SELECT lr.leave_type,
            COUNT(*) AS request_count,
            COUNT(*) FILTER (WHERE lr.status='approved') AS approved,
            COUNT(*) FILTER (WHERE lr.status='rejected') AS rejected,
            COUNT(*) FILTER (WHERE lr.status='pending')  AS pending,
            COALESCE(SUM(lr.days_requested), 0)::INT AS total_days
     FROM shared.leave_requests lr
     WHERE lr.start_date BETWEEN $1 AND $2
     GROUP BY lr.leave_type
     ORDER BY total_days DESC`,
    [startDate, endDate],
  );
  return {
    meta: {
      title: "Leave Summary",
      subtitle: `${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
      summary: {
        total_requests: rows.reduce((s, r) => s + parseInt(r.request_count), 0),
        total_days: rows.reduce((s, r) => s + parseInt(r.total_days), 0),
      },
    },
    columns: [
      { key: "leave_type", label: "Type", type: "string" },
      { key: "request_count", label: "Requests", type: "int" },
      { key: "approved", label: "Approved", type: "int" },
      { key: "rejected", label: "Rejected", type: "int" },
      { key: "pending", label: "Pending", type: "int" },
      { key: "total_days", label: "Total Days", type: "int" },
    ],
    rows,
  };
}

async function generateByStaff(client, { startDate, endDate }) {
  const { rows } = await client.query(
    `SELECT c.display_name AS staff_name, sp.job_title, sp.department,
            COUNT(lr.leave_id) AS leave_requests,
            COALESCE(SUM(lr.days_requested) FILTER (WHERE lr.status='approved'), 0)::INT AS approved_days
     FROM shared.staff_profiles sp
     JOIN shared.contacts c ON c.contact_id = sp.contact_id
     LEFT JOIN shared.leave_requests lr
       ON lr.profile_id = sp.profile_id
       AND lr.start_date BETWEEN $1 AND $2
     WHERE sp.is_deleted = false
     GROUP BY c.display_name, sp.job_title, sp.department
     ORDER BY approved_days DESC, c.display_name`,
    [startDate, endDate],
  );
  return {
    meta: {
      title: "Attendance by Staff",
      subtitle: `${startDate} to ${endDate}`,
      generatedAt: new Date().toISOString(),
      summary: { staff_count: rows.length },
    },
    columns: [
      { key: "staff_name", label: "Name", type: "string" },
      { key: "job_title", label: "Title", type: "string" },
      { key: "department", label: "Department", type: "string" },
      { key: "leave_requests", label: "Leave Requests", type: "int" },
      { key: "approved_days", label: "Days Off", type: "int" },
    ],
    rows,
  };
}

module.exports = { generate };
