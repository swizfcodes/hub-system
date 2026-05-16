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

module.exports = {
  getSalesDashboard,
  getFinanceDashboard,
  getStockDashboard,
  getCustomerDashboard,
  getRetailPartnerDashboard,
  getLogisticsDashboard,
  getOverview,
  // dashboard configs
  listDashboardConfigs,
  getDashboardConfig,
  createDashboardConfig,
  updateDashboardConfig,
  deleteDashboardConfig,
};
