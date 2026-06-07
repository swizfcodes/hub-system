"use strict";
const config = require("../../config/config");
module.exports =
  config.storage.driver === "s3" ? require("./s3") : require("./local");
