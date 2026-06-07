"use strict";
// WooCommerce webhook handler — not yet implemented.
// Exports a router that returns 501 on all routes so it can be safely
// mounted once the webhook is uncommented in routes/index.js.

const express = require("express");
const router = express.Router();

router.all("*", (req, res) => {
  res
    .status(501)
    .json({ message: "WooCommerce webhook handler not yet implemented" });
});

module.exports = router;
