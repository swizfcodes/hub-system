"use strict";

const express = require("express");
const router = express.Router();
const config = require("../../config/config");
const logger = require("../../config/logger");
const messagingService = require("./messaging.service");

// Meta webhook verification (GET)
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.meta.verifyToken) {
    logger.info("Meta webhook verified");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Meta webhook events (POST) — Instagram DMs, Facebook Messenger, WhatsApp
router.post("/", express.json(), async (req, res) => {
  res.sendStatus(200); // Always respond immediately to Meta

  const body = req.body;
  if (
    body.object !== "instagram" &&
    body.object !== "page" &&
    body.object !== "whatsapp_business_account"
  ) {
    return;
  }

  try {
    for (const entry of body.entry || []) {
      for (const messaging of entry.messaging || entry.changes || []) {
        await messagingService.handleInbound({
          source: body.object,
          entry,
          messaging,
        });
      }
    }
  } catch (err) {
    logger.error("Meta webhook processing error", err);
  }
});

module.exports = router;
