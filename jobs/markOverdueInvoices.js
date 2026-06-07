"use strict";
const { pool } = require("../config/db");
const logger = require("../config/logger");
const { emitToBusiness } = require("../config/sockets");
const { getActiveBusinesses } = require("../config/businesses");

module.exports = async function markOverdueInvoices() {
  for (const business of getActiveBusinesses()) {
    const count = await pool.query(
      `SELECT ${business}.fn_mark_overdue_invoices()`,
    );
    const n = count.rows[0][`fn_mark_overdue_invoices`];
    if (n > 0) {
      logger.info(`Marked ${n} overdue invoices [${business}]`);
      emitToBusiness(business, "invoices:overdue_updated", { count: n });
    }
  }
};
