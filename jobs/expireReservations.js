"use strict";
const { pool } = require("../config/db");
const logger = require("../config/logger");
const { getActiveBusinesses } = require("../config/businesses");

module.exports = async function expireReservations() {
  for (const business of getActiveBusinesses()) {
    const result = await pool.query(
      `SELECT ${business}.fn_expire_reservations()`,
    );
    const n = result.rows[0][`fn_expire_reservations`];
    if (n > 0) logger.info(`Expired ${n} stock reservations [${business}]`);
  }
};
