"use strict";

const { withBusinessContext } = require("../../config/db");
const auditService = require("../../shared/audit/audit.service");
const repo = require("./dashboards.repository");

function getPeriodDates(query) {
  const now = new Date();
  const year = parseInt(query.year || now.getFullYear());
  const month = parseInt(query.month || now.getMonth() + 1);
  const startDate =
    query.start_date || `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate =
    query.end_date ||
    `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`;
  return { startDate, endDate, year, month };
}

async function getSalesDashboard(business, query, user) {
  const { startDate, endDate } = getPeriodDates(query);
  return withBusinessContext(business, async (client) => {
    const [
      revenue,
      topProducts,
      revenueByDay,
      quoteConversion,
      paymentMethods,
    ] = await Promise.all([
      repo.getSalesRevenue(client, { startDate, endDate }),
      repo.getTopProducts(client, { startDate, endDate }),
      repo.getRevenueByDay(client, { startDate, endDate }),
      repo.getQuoteConversion(client, { startDate, endDate }),
      repo.getPaymentMethods(client, { startDate, endDate }),
    ]);
    return {
      period: { startDate, endDate },
      revenue,
      top_products: topProducts,
      revenue_by_day: revenueByDay,
      quotations: quoteConversion,
      payment_methods: paymentMethods,
    };
  });
}

async function getFinanceDashboard(business, query) {
  const { startDate, endDate } = getPeriodDates(query);
  return withBusinessContext(business, async (client) => {
    const [incomeVsExpense, arAgeing, apSummary, cashBalance] =
      await Promise.all([
        repo.getIncomeVsExpense(client, { startDate, endDate }),
        repo.getARAgeing(client),
        repo.getAPSummary(client),
        repo.getBankBalances(client, business),
      ]);
    return {
      period: { startDate, endDate },
      income_vs_expense: incomeVsExpense,
      ar_ageing: arAgeing,
      ap_summary: apSummary,
      bank_balances: cashBalance,
    };
  });
}

async function getStockDashboard(business, query) {
  return withBusinessContext(business, async (client) => {
    const [totalValue, lowStock, topMoving, locationBreakdown] =
      await Promise.all([
        repo.getTotalStockValue(client),
        repo.getLowStockCount(client),
        repo.getTopMovingProducts(client),
        repo.getStockByLocation(client),
      ]);
    return {
      total_value: totalValue,
      low_stock: lowStock,
      top_moving: topMoving,
      location_breakdown: locationBreakdown,
    };
  });
}

async function getCustomerDashboard(business, query) {
  const { startDate, endDate } = getPeriodDates(query);
  return withBusinessContext(business, async (client) => {
    const [summary, newVsReturning, topCustomers, pipelineHealth] =
      await Promise.all([
        repo.getCustomerSummary(client, { startDate, endDate, business }),
        repo.getNewVsReturning(client, { startDate, endDate }),
        repo.getTopCustomers(client),
        repo.getPipelineHealth(client),
      ]);
    return {
      period: { startDate, endDate },
      summary,
      new_vs_returning: newVsReturning,
      top_customers: topCustomers,
      pipeline_health: pipelineHealth,
    };
  });
}

async function getRetailPartnerDashboard(business, query) {
  return withBusinessContext(business, async (client) => {
    return { data: await repo.getRetailPartners(client) };
  });
}

async function getLogisticsDashboard(business, query) {
  const { startDate, endDate } = getPeriodDates(query);
  return withBusinessContext(business, async (client) => {
    const [summary, byCourier, activeDeliveries] = await Promise.all([
      repo.getLogisticsSummary(client, { startDate, endDate }),
      repo.getLogisticsByCourier(client, { startDate, endDate }),
      repo.getActiveDeliveries(client),
    ]);
    return {
      period: { startDate, endDate },
      summary,
      by_courier: byCourier,
      active_deliveries: activeDeliveries,
    };
  });
}

async function getOverview(business, query, user) {
  const { startDate, endDate } = getPeriodDates(query);
  return withBusinessContext(business, async (client) => {
    const [revenue, stock, deliveries, crm, notifications] = await Promise.all([
      repo.getOverviewRevenue(client, { startDate, endDate }),
      repo.getOverviewStock(client),
      repo.getOverviewDeliveries(client),
      repo.getOverviewCRM(client),
      repo.getUnreadNotifications(client, user.user_id),
    ]);
    return {
      period: { startDate, endDate },
      revenue,
      stock,
      deliveries,
      crm,
      notifications,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD CONFIGS
//
// Per-user saved dashboard layouts. A user may keep several named
// dashboards (e.g. "Daily ops", "Finance deep-dive"); one is the
// default that loads first. All operations are scoped to the
// calling user — a user only sees and edits their own dashboards.
// ─────────────────────────────────────────────────────────────

async function listDashboardConfigs(business, user) {
  return withBusinessContext(business, async (client) => {
    const data = await repo.listDashboardConfigs(client, user.user_id);
    return { data };
  });
}

async function getDashboardConfig(business, configId, user) {
  return withBusinessContext(business, async (client) => {
    const row = await repo.findDashboardConfigById(client, configId);
    if (!row || row.user_id !== user.user_id) {
      throw Object.assign(new Error("Dashboard config not found"), {
        status: 404,
      });
    }
    return row;
  });
}

async function createDashboardConfig(business, data, user) {
  if (!data.dashboard_name || !data.dashboard_name.trim()) {
    throw Object.assign(new Error("dashboard_name is required"), {
      status: 400,
    });
  }
  return withBusinessContext(business, async (client) => {
    const row = await repo.insertDashboardConfig(client, {
      userId: user.user_id,
      dashboardName: data.dashboard_name.trim(),
      layout: data.layout,
      widgets: data.widgets,
      isDefault: data.is_default,
    });
    // If this one is marked default, demote the user's other defaults.
    if (data.is_default) {
      await repo.clearOtherDefaults(client, user.user_id, row.config_id);
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "dashboards",
      action: "create",
      table: "dashboard_configs",
      recordId: row.config_id,
      after: row,
    });
    return row;
  });
}

async function updateDashboardConfig(business, configId, data, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findDashboardConfigById(client, configId);
    if (!before || before.user_id !== user.user_id) {
      throw Object.assign(new Error("Dashboard config not found"), {
        status: 404,
      });
    }
    const row = await repo.updateDashboardConfig(client, configId, {
      dashboardName: data.dashboard_name ? data.dashboard_name.trim() : null,
      layout: data.layout,
      widgets: data.widgets,
      isDefault: data.is_default,
    });
    if (data.is_default) {
      await repo.clearOtherDefaults(client, user.user_id, configId);
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "dashboards",
      action: "edit",
      table: "dashboard_configs",
      recordId: configId,
      before,
      after: row,
    });
    return row;
  });
}

async function deleteDashboardConfig(business, configId, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findDashboardConfigById(client, configId);
    if (!before || before.user_id !== user.user_id) {
      throw Object.assign(new Error("Dashboard config not found"), {
        status: 404,
      });
    }
    await repo.deleteDashboardConfig(client, configId);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "dashboards",
      action: "delete",
      table: "dashboard_configs",
      recordId: configId,
      before,
    });
    return { deleted: true };
  });
}

// ── Local-date helper ─────────────────────────────────────
// The business operates in Africa/Lagos (UTC+1, no DST). Server time may
// be UTC, so `new Date().toISOString()` gives the wrong calendar date
// between 00:00–00:59 Lagos time. Always compute briefing dates in the
// business timezone. "en-CA" formats as YYYY-MM-DD.
const BUSINESS_TZ = "Africa/Lagos";
function localDateStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ }).format(d);
}

// Shared rollup for a single calendar day (yesterday briefing / today hero).
async function getDaySummary(business, date) {
  return withBusinessContext(business, async (client) => {
    const [revenue, topProduct, newCustomers, orders] = await Promise.all([
      repo.getOverviewRevenue(client, { startDate: date, endDate: date }),
      repo.getTopProducts(client, { startDate: date, endDate: date }),
      client
        .query(
          `SELECT COUNT(*) AS new_customers
           FROM shared.contacts c
           WHERE (c.created_at AT TIME ZONE 'Africa/Lagos')::DATE = $1
             AND 'customer' = ANY(c.contact_type)
             AND c.is_deleted = false`,
          [date],
        )
        .then((r) => r.rows[0]),
      client
        .query(
          `SELECT COUNT(*) AS order_count
           FROM sales_orders
           WHERE (created_at AT TIME ZONE 'Africa/Lagos')::DATE = $1
             AND status != 'cancelled'`,
          [date],
        )
        .then((r) => r.rows[0]),
    ]);

    const topItem = topProduct?.[0] || null;
    return {
      date,
      revenue: Number(revenue?.revenue ?? 0),
      invoice_count: Number(revenue?.invoices ?? 0),
      transaction_count: Number(revenue?.invoices ?? 0),
      order_count: parseInt(orders?.order_count || 0),
      new_customers: parseInt(newCustomers?.new_customers || 0),
      top_product: topItem
        ? {
            name: topItem.description || topItem.product_name,
            units: Number(topItem.units_sold),
            revenue: Number(topItem.revenue),
          }
        : null,
    };
  });
}

// Morning-briefing rollup for yesterday's activity.
async function getYesterdaySummary(business) {
  return getDaySummary(business, localDateStr(-1));
}

// Live "today so far" rollup — hero card on cashier/manager dashboards.
async function getTodaySummary(business) {
  return getDaySummary(business, localDateStr(0));
}

// Last N sales orders created by the current user ("My Recent Sales"
// on the cashier dashboard).
async function getMyRecentSales(business, user, limit = 10) {
  return withBusinessContext(business, async (client) => {
    const { rows } = await client.query(
      `SELECT o.order_id, o.order_number, o.total_amount, o.status,
              o.created_at, c.display_name AS customer_name
       FROM sales_orders o
       LEFT JOIN shared.contacts c ON c.contact_id = o.contact_id
       WHERE o.created_by = $1
       ORDER BY o.created_at DESC
       LIMIT $2`,
      [user.user_id, Math.min(parseInt(limit) || 10, 50)],
    );
    return { data: rows };
  });
}

module.exports = {
  getSalesDashboard,
  getFinanceDashboard,
  getStockDashboard,
  getCustomerDashboard,
  getRetailPartnerDashboard,
  getLogisticsDashboard,
  getOverview,
  getYesterdaySummary,
  getTodaySummary,
  getMyRecentSales,
  // dashboard configs
  listDashboardConfigs,
  getDashboardConfig,
  createDashboardConfig,
  updateDashboardConfig,
  deleteDashboardConfig,
};
