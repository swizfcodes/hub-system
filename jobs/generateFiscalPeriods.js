"use strict";
const { withBusinessContext } = require("../config/db");
const logger = require("../config/logger");
const { getActiveBusinesses } = require("../config/businesses");

module.exports = async function generateFiscalPeriods() {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const year = nextMonth.getFullYear();
  const month = nextMonth.getMonth() + 1;
  const name =
    nextMonth.toLocaleString("en-GB", { month: "long" }) + ` ${year}`;

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().split("T")[0]; // last day of month

  for (const business of getActiveBusinesses()) {
    await withBusinessContext(business, async (client) => {
      await client.query(
        `INSERT INTO fiscal_periods (name, period_type, start_date, end_date)
         VALUES ($1, 'month', $2, $3)
         ON CONFLICT (period_type, start_date) DO NOTHING`,
        [name, startDate, endDate],
      );
      logger.info(`Fiscal period ensured: ${name} [${business}]`);
    });
  }
};
