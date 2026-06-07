"use strict";

const { pool } = require("../../config/db");

// Actions managers should not see (owner-only visibility).
const MANAGER_HIDDEN_ACTIONS = [
  "login",
  "logout",
  "permission_change",
  "provision_login",
];

async function queryAuditLog(
  requestingUser,
  {
    user_id,
    module,
    action,
    start_date,
    end_date,
    page = 1,
    limit = 50,
    format = "json",
    business,
  },
) {
  const isOwner = requestingUser.role_name === "owner";
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const biz = business || requestingUser.current_business || null;

  const params = [
    user_id || null,
    module || null,
    action || null,
    biz,
    start_date || null,
    end_date || null,
    parseInt(limit),
    offset,
  ];

  // Managers cannot see security-sensitive actions.
  const actionFilter = !isOwner
    ? `AND action NOT IN (${MANAGER_HIDDEN_ACTIONS.map(
        (a, i) => `$${9 + i}`,
      ).join(",")})`
    : "";
  const extraParams = !isOwner ? MANAGER_HIDDEN_ACTIONS : [];

  const sql = `
    SELECT log_id, occurred_at, user_id, user_name, user_email,
           business, module, action, table_name, record_id,
           before_state, after_state, ip_address, session_id, metadata
    FROM shared.audit_log
    WHERE ($1::UUID IS NULL OR user_id = $1)
      AND ($2::TEXT IS NULL OR module = $2)
      AND ($3::TEXT IS NULL OR action = $3)
      AND ($4::TEXT IS NULL OR business = $4)
      AND ($5::DATE IS NULL OR occurred_at::DATE >= $5::DATE)
      AND ($6::DATE IS NULL OR occurred_at::DATE <= $6::DATE)
      ${actionFilter}
    ORDER BY occurred_at DESC
    LIMIT $7 OFFSET $8
  `;

  const { rows } = await pool.query(sql, [...params, ...extraParams]);

  if (format === "csv") {
    const headers = "Time,User,Business,Module,Action,Record,IP\n";
    const lines = rows
      .map(
        (r) =>
          `"${r.occurred_at}","${r.user_name}","${r.business}","${r.module}","${r.action}","${
            r.record_id || ""
          }","${r.ip_address || ""}"`,
      )
      .join("\n");
    return headers + lines;
  }

  const {
    rows: [{ total }],
  } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM shared.audit_log
     WHERE ($1::UUID IS NULL OR user_id = $1)
       AND ($2::TEXT IS NULL OR business = $2)`,
    [user_id || null, biz],
  );

  return { data: rows, total, page: parseInt(page), limit: parseInt(limit) };
}

async function getSecurityStats(requestingUser, { business } = {}) {
  const biz = business || requestingUser.current_business;
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [failedLogins, recentEvents, activeUsers, inactiveSessions] =
    await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS count, user_name, user_email
         FROM shared.audit_log
         WHERE action = 'login_failed' AND occurred_at > $1 AND business = $2
         GROUP BY user_name, user_email ORDER BY count DESC LIMIT 10`,
        [since24h, biz],
      ),
      pool.query(
        `SELECT log_id, occurred_at, user_name, module, action, ip_address
         FROM shared.audit_log
         WHERE business = $1
           AND action IN ('login','logout','permission_change','provision_login','invite_sent','account_created')
         ORDER BY occurred_at DESC LIMIT 10`,
        [biz],
      ),
      pool.query(
        `SELECT COUNT(DISTINCT user_id)::int AS count
         FROM shared.audit_log
         WHERE business = $1 AND action = 'login'
           AND occurred_at > now() - INTERVAL '30 days'`,
        [biz],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM shared.users u
         WHERE (u.last_login_at IS NULL OR u.last_login_at < now() - INTERVAL '90 days')
           AND u.is_active = true
           AND $1 = ANY(u.permitted_businesses)`,
        [biz],
      ),
    ]);

  return {
    failed_logins_24h: failedLogins.rows,
    recent_events: recentEvents.rows,
    active_users_30d: activeUsers.rows[0].count,
    inactive_accounts: inactiveSessions.rows[0].count,
  };
}

module.exports = { queryAuditLog, getSecurityStats };
