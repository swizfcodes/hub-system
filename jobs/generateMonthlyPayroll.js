"use strict";
const logger = require("../config/logger");
// NOTE: Payroll is initiated manually by the owner/manager, not auto-generated.
// This job can optionally create a draft run at month start as a reminder.
module.exports = async function generateMonthlyPayroll() {
  logger.debug(
    "generateMonthlyPayroll: draft creation can be added here if needed",
  );
};
