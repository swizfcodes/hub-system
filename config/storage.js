"use strict";

const config = require("./config");
const local = require("../lib/storage/local");
const s3 = require("../lib/storage/s3");

module.exports = config.storage.driver === "s3" ? s3 : local;
