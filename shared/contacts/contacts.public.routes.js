"use strict";
// ── contacts.public.routes.js — NO auth ───────────────────────────────────────
// Two endpoints:
//
//   GET  /api/contacts/register-qr/:business
//     Protected (staff only) — generates the permanent walk-in QR SVG on the
//     fly pointing at the public /register/:business page.
//
//   POST /api/contacts/register/:business
//     Public — accepts a walk-in self-registration, creates or upserts a CRM
//     contact, and sends a branded welcome email.

const express = require("express");
const { body, param } = require("express-validator");
const validate = require("../../middleware/validateBody");
const { verifyToken, registrationRateLimiter } = require("../../middleware/auth");
const { setBusinessContext } = require("../../middleware/businessContext");
const { withSharedContext } = require("../../config/db");
const { sendEmail } = require("../../lib/email/sender");
const { renderEmail } = require("../../lib/email/render");
const notifService = require("../notifications/notifications.service");
const businesses = require("../../config/businesses");
const config = require("../../config/config");
const logger = require("../../config/logger");

const router = express.Router();

// ── GET /api/contacts/register-qr/:business ───────────────────────────────────
// Staff-only: generate + return the permanent walk-in QR SVG for this business.
// The QR is stateless (URL is deterministic) so nothing is stored.
router.get(
  "/register-qr/:business",
  verifyToken,
  setBusinessContext,
  param("business").isString().trim(),
  validate,
  async (req, res, next) => {
    try {
      const QRCode = require("qrcode");
      const biz = req.params.business;

      if (!businesses.isValidBusiness(biz)) {
        return res.status(400).json({ error: "Unknown business" });
      }

      const baseUrl = config.appBaseUrl || "https://app.orikaliving.com";
      const joinUrl = `${baseUrl}/register/${biz}`;

      const svgString = await QRCode.toString(joinUrl, {
        type: "svg",
        margin: 2,
        color: { dark: "#1a1a1a", light: "#ffffff" },
        errorCorrectionLevel: "H",
      });

      const qrDataUri = `data:image/svg+xml;base64,${Buffer.from(svgString).toString("base64")}`;

      res.json({ qr_code_url: qrDataUri, join_url: joinUrl });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/contacts/register/:business ─────────────────────────────────────
// Public — walk-in self-registration. No auth required.
router.post(
  "/register/:business",
  registrationRateLimiter,
  param("business").isString().trim(),
  body("first_name").notEmpty().trim(),
  body("last_name").notEmpty().trim(),
  body("phone").notEmpty().trim(),
  body("email").isEmail().normalizeEmail({ gmail_dots: false }),
  body("address_city").optional().isString().trim(),
  body("address_state").optional().isString().trim(),
  body("wants_birthday").optional().isBoolean(),
  body("birthday_month").optional().isInt({ min: 1, max: 12 }),
  body("birthday_day").optional().isInt({ min: 1, max: 31 }),
  validate,
  async (req, res, next) => {
    try {
      const biz = req.params.business;

      if (!businesses.isValidBusiness(biz)) {
        return res.status(400).json({ error: "Unknown business" });
      }

      const {
        first_name, last_name, phone, email,
        address_city, address_state,
        wants_birthday, birthday_month, birthday_day,
      } = req.body;

      const displayName = `${first_name} ${last_name}`.trim();

      await withSharedContext(async (client) => {
        // ── Upsert contact ───────────────────────────────────────
        const { rows: [existing] } = await client.query(
          `SELECT contact_id FROM shared.contacts
           WHERE primary_phone = $1 AND is_deleted = false LIMIT 1`,
          [phone],
        );

        let contactId;

        if (existing) {
          // Update any missing fields on the existing record
          await client.query(
            `UPDATE shared.contacts
             SET display_name  = COALESCE(NULLIF(display_name,''),  $2),
                 first_name    = COALESCE(NULLIF(first_name,''),    $3),
                 last_name     = COALESCE(NULLIF(last_name,''),     $4),
                 email         = COALESCE(email,                    $5),
                 address_city  = COALESCE(NULLIF(address_city,''),  $6),
                 address_state = COALESCE(NULLIF(address_state,''), $7)
             WHERE contact_id  = $1`,
            [
              existing.contact_id,
              displayName,
              first_name,
              last_name,
              email || null,
              address_city || null,
              address_state || null,
            ],
          );
          contactId = existing.contact_id;
        } else {
          const { rows: [created] } = await client.query(
            `INSERT INTO shared.contacts
               (display_name, first_name, last_name,
                primary_phone, email,
                address_city, address_state,
                contact_type, source, visible_to)
             VALUES ($1,$2,$3,$4,$5,$6,$7,
                     ARRAY['customer']::text[],
                     'walk_in_qr',
                     ARRAY[$8])
             RETURNING contact_id`,
            [
              displayName, first_name, last_name,
              phone, email || null,
              address_city || null, address_state || null,
              biz,
            ],
          );
          contactId = created.contact_id;
        }

        // ── Birthday opt-in — store as a contact note / tag ─────
        // (full birthday field support can be added via a migration;
        //  for now we store it in the notes if opted in)
        if (wants_birthday && birthday_month && birthday_day) {
          await client.query(
            `UPDATE shared.contacts
             SET birthday_month = $2, birthday_day = $3
             WHERE contact_id   = $1`,
            [contactId, birthday_month, birthday_day],
          ).catch(() => {
            // columns may not exist yet — silently skip
          });
        }

        // ── Welcome email ────────────────────────────────────────
        if (email) {
          try {
            const bizConfig = businesses.getBusinessConfig(biz);
            const { subject, html } = renderEmail("walkin_welcome", biz, {
              first_name,
              shop_url: bizConfig?.website || "https://orikaliving.com/products",
              wants_birthday: !!(wants_birthday && birthday_month && birthday_day),
              birthday_month: birthday_month || null,
              birthday_day:   birthday_day   || null,
            });
            await sendEmail({ to: email, subject, html, business: biz });
          } catch (emailErr) {
            logger.warn(`[walkin] welcome email failed for ${email}: ${emailErr.message}`);
          }
        }

        // ── Notify staff ─────────────────────────────────────────
        try {
          const { rows: managers } = await client.query(
            `SELECT u.user_id FROM shared.users u
             JOIN shared.user_roles ur ON ur.user_id = u.user_id
             JOIN shared.roles r ON r.role_id = ur.role_id
             WHERE r.role_name IN ('owner','manager')
               AND (ur.business = $1 OR ur.business = '*')`,
            [biz],
          );
          for (const m of managers) {
            await notifService.create(client, {
              userId: m.user_id,
              business: biz,
              type: "new_contact",
              title: "New walk-in client",
              body: `${displayName} registered via the walk-in QR code`,
              referenceType: "contact",
              referenceId: contactId,
              actionUrl: `/contacts/${contactId}`,
            });
          }
        } catch (notifErr) {
          logger.warn(`[walkin] notification failed: ${notifErr.message}`);
        }
      });

      res.status(201).json({ registered: true });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
