# Orika Hub — Backend Patch Summary

This patch set delivers everything the audit reports called for: the
journal/accounting integration **and** the six per-module patches
(security, scheduling, dashboard, reports, social, payroll).

## Run order
1. Apply the new migrations in numeric order:
   - `000037_accounting_expansion.sql` — COA codes + system user
   - `000038_security_invite_2fa.sql`  — invite_tokens, TOTP cols, permissions
   - `000039_scheduling_privacy.sql`   — `is_private` / `is_personal`
   - `000040_social_accounts_templates.sql` — multi-account, templates,
     hashtag sets, nullable `scheduled_at`
   - `000041_payroll_coa.sql`          — payroll COA codes
2. Set env (optional, all have defaults):
   - `SYSTEM_USER_ID` — UUID seeded by migration 037
     (default `00000000-0000-0000-0000-000000000001`).
   - `HUB_BASE_URL` — public URL of the Hub frontend; used in invite links.
3. Restart the API.

## 1. Accounting / journal integration

### Migration 000037_accounting_expansion.sql
Seeds system user and new COA codes in both schemas:
2100 AP · 2150 GRNI · 1350 Partner Receivable · 1430 Consignment Stock ·
4900 Stock Adjustment Income · 6900 Inventory Write-off ·
6700 Purchases—Non-stock.

### modules/invoicing/invoicing.service.js
- New shared helper `postPaymentJournal()` (exported).
- `recordPayment()` → DR Bank/Cash · CR AR (1310) on confirmed payments.
- `voidInvoice()` → reverses original journal via `journalService.reverseEntry`.

### modules/purchasing/{purchasing.service.js,purchasing.repository.js}
- `receiveGoods()` → DR Inventory (1410) · CR GRNI (2150), valued from
  PO line `unit_price` (added to `getPOLineProduct`).
- `approveBill()` → DR GRNI (2150) or 6700 if non-PO · CR AP (2100).
- `payBill()`     → DR AP (2100) · CR Bank (1210 or `bank_account_code`).

### modules/expenses/expenses.service.js
- `postExpenseJournal()` rewritten onto `journalService.postEntry`.

### modules/retail-partners/retail-partners.service.js
- `sendConsignment()`    → DR Consignment Stock (1430) · CR Inventory (1410)
- `reportPartnerSale()`  → DR Partner Receivable (1350) · CR Revenue (4100)
                            [+ CR VAT 2210], plus DR COGS (5000) · CR 1430
- `markSettlementPaid()` → DR Bank (1210) · CR Partner Receivable (1350)

### modules/stock/movements.service.js
- `recordMovement()` posts value journals for `adjustment`/`write_off`
  via new `postStockValueJournal()`.
  +adj → DR 1410 · CR 4900;  −adj / write_off → DR 6900 · CR 1410.

### integrations/{paystack,flutterwave}/...webhook.js
- On confirmation both post the cash-collection journal via
  `invoicingService.postPaymentJournal`, `posted_by = config.systemUserId`.

### config/config.js
- Added `config.systemUserId` and `config.app.hubBaseUrl`.

## 2. Security

### Migration 000038_security_invite_2fa.sql
- `shared.invite_tokens` (one-time invite links, SHA-256 hashed).
- `shared.users.totp_*` columns (optional 2FA; routes not yet wired).
- Permission seeds: owner gets full `settings`/`security`; manager gets
  settings view/edit + security view.

### shared/auth/invite.service.js (new)
- `createInvite`, `verifyInvite`, `acceptInvite`.
- Schema-correct: uses `contacts.email` (not `primary_email`); seeds
  `contacts.primary_phone = ''` (NOT NULL placeholder).

### shared/auth/auth.routes.js
- `POST /auth/invite`, `GET /auth/invite/:token`,
  `POST /auth/invite/:token/accept`.
- `GET /auth/sessions/:userId`, `DELETE /auth/sessions/:userId[/:tokenId]`.

### shared/auth/auth.service.js
- `listActiveSessions`, `revokeSession`, `revokeAllSessions`.

### modules/security/audit.{service,routes}.js (new)
- `GET /security/audit` (filters, pagination, CSV export).
- `GET /security/audit/stats` (failed logins 24h, recent events,
  active users 30d, inactive accounts).
- Managers cannot see `login`/`logout`/`permission_change`/`provision_login`.

## 3. Scheduling

### Migration 000039_scheduling_privacy.sql
- `calendar_events.is_private` BOOLEAN.
- `tasks.is_personal` BOOLEAN.

### shared/calendar/calendar.{service,routes}.js
- Participant CRUD + RSVP routes; creates a `calendar_invite`
  notification for invited internal users.

## 4. Dashboard

### modules/dashboards/dashboards.routes.js
- Removed the duplicate `/configs` block (taking the wrong-permission
  DELETE with it).
- Added `GET /dashboards/yesterday`.

### modules/dashboards/dashboards.service.js
- Added `getYesterdaySummary()`.

### shared/notifications/notifications.routes.js
- Reordered so `PATCH /notifications/read-all` is registered before
  `PATCH /notifications/:id/read` (was shadowed and rejected by UUID validator).

## 5. Reports

### modules/reports/reports.repository.js
- Removed duplicate saved-report functions.

### modules/reports/{purchases,attendance}.report.js (new)
- purchases: by_supplier, by_category, by_period.
- attendance: leave_summary, by_staff.
- Adapted to your real schema (`sup_invoice_id`, `leave_id`,
  `staff_profiles.is_deleted`).

### modules/reports/reports.service.js
- Registered the new families in `REPORT_FAMILIES`.

### modules/reports/reports.routes.js
- `GET /reports/purchases/:reportType` (`can("reports","approve")`).
- `GET /reports/attendance/:reportType` (`can("payroll","approve")`).
- `GET /reports/consolidated/:family/:reportType` (owner only).

### jobs/fetchSocialMetrics.js + jobs/sendScheduledReports.js (new)
- Daily 3am social metrics fetch (IG/FB/TikTok).
- Weekly Monday 7am and monthly 1st 7am scheduled report delivery
  via email and/or WhatsApp.

## 6. Social

### Migration 000040_social_accounts_templates.sql
- Drops `NOT NULL` on `social_posts.scheduled_at` (drafts).
- New `social_accounts`, `social_caption_templates`, `social_hashtag_sets`.

### modules/social/social.repository.js
- `insert()` accepts `status` (default `'scheduled'`).

### modules/social/social.service.js
- `validateScheduledAt()` returns null for missing values.
- `schedule()` passes `status` to repo; rejects empty `scheduled_at`
  for non-drafts.

### modules/social/social.routes.js
- `POST /social/posts`: `scheduled_at` optional, `status` accepts
  `draft` or `scheduled`.
- Added accounts CRUD, templates CRUD, hashtag-sets CRUD.
- `GET /social/posts/:id/comments` — live fetch from IG/FB.

## 7. Payroll

### Migration 000041_payroll_coa.sql
- COA codes both schemas: 6110 Salaries · 6120 Employer Pension ·
  2310 PAYE Payable · 2320 Pension Payable · 2330 NHF Payable.

### modules/payroll/payroll.repository.js
- `findPayslipById` now returns `whatsapp_number` (for payslip delivery).

### modules/payroll/payroll.service.js
- New: `generatePayeSchedule`, `generatePencomFile`, `generateNhfSchedule`,
  `generatePaymentSchedule` (CSV).
- New: `sendPayslip(business, payslipId, { channel }, user)` — email,
  whatsapp, or both. Uses your existing `lib/email/sender.sendWithAttachment`
  and the WhatsApp adapter.
- Compliance queries adapted: TIN from `contacts.tin`, pension PIN from
  `staff_profiles.pension_pin` (your schema has no PFA-name column).

### modules/payroll/payroll.routes.js
- `GET /payroll/runs/:id/compliance/{paye-schedule,pencom,nhf,payment-schedule}`
  (CSV, `can("payroll","view")`).
- `POST /payroll/payslips/:id/send` (`can("payroll","approve")`).

## Caveats to validate before production
- Account-code mappings follow the audit reports; confirm against the
  live CoA after running the migrations.
- Gateway journals assume confirmed payments cleanly join to their invoice;
  verify against a real webhook payload.
- `fetchSocialMetrics` requires `config.meta.accessToken` (and optional
  `config.tiktok.accessToken`); add if not present.
- TOTP columns are seeded by migration 038, but the actual TOTP
  enrollment/login routes are a follow-up.
- Payroll "simplified mode" toggle in the calculator was not implemented;
  the existing PAYE/NHF/Pension calculations remain.

## 8. Campaigns + Messaging (added this round)

### Migration 000042_campaigns_messaging_extras.sql
- `jewelry.saved_segments`, `diffusers.saved_segments` (reusable audience filters).
- `jewelry.whatsapp_templates`, `diffusers.whatsapp_templates` (Cloud-API templates).
- `shared.message_channels.{assigned_to, assigned_at, status}` (thread ownership / resolved state).
- `shared.message_reactions` table (emoji reactions, unique per message+user+emoji).

### Campaigns
- **Route ordering fix:** moved the `/segments` block in `campaigns.routes.js`
  to before the `/:id` block. Previously `GET /segments` was being matched
  as a UUID id and failing validation.
- **Public tracking routes:** extracted `/track/:token`, `/track/:token/click`,
  and `/unsubscribe/:token` into a new `campaigns.public.routes.js` and
  mounted it in `app.js` on `/api/campaigns` BEFORE the authenticated
  `/api` router — so email clients with no JWT can hit them.
- **Cron job:** `jobs/runScheduledCampaigns.js` runs `* * * * *` and
  delegates to `scheduler.runScheduledSweep()`.

### Messaging — shared service (`shared/messaging/messaging.service.js`)
- **`@mention` notifications** in `sendMessage`: extracts `@firstname`
  tokens, matches against channel members' first names, and creates a
  notification for each mention.
- **`assignThread(channelId, { assigned_to, handoff_note }, user)`** —
  updates `message_channels.assigned_to` + `assigned_at`, posts a system
  message, notifies the assignee, and audit-logs.
- **`resolveThread(channelId, user)`** — sets `status='resolved'` and
  `is_archived=true`, posts a system message, audit-logs.
- **`toggleReaction(messageId, emoji, user)`** — toggles a row in
  `shared.message_reactions`, returns `{added, emoji}`.
- **`getCustomer360(contactId, user)`** — fetches the contact from
  shared and aggregates recent orders / open invoices / deliveries
  across each business in `user.permitted_businesses`. Quiet on
  per-schema failures (a brand may have no relationship with the contact).

### Messaging — routes
- `PATCH /messaging/channels/:id/assign` — `can("messaging","edit")`.
- `PATCH /messaging/channels/:id/resolve` — `can("messaging","edit")`.
- `POST  /messaging/messages/:id/react` — `can("messaging","view")`.
- `GET   /messaging/customer-360/:contactId` — `can("messaging","view")`.

### Messaging — integrations layer (`integrations/messaging/messaging.service.js`)
- **Dynamic business socket room:** the `emitToUser("business:jewelry", ...)`
  hardcode in `handleInbound` is gone. The channel's actual business is
  looked up by id and used for `emitToBusiness("business:<biz>", ...)`.
  Import switched from `emitToUser` to `emitToBusiness`.
- **Email source wired into `handleInbound`** via `smtp.parseInbound`,
  and into `sendReply` via `smtp.sendChannelMessage` (subject from
  `emailMeta.subject`, default `"Re: Your enquiry"`).

### Messaging — config & adapters
- `config.whatsapp.phoneNumbers.{jewelry,diffusers}` for per-brand
  WhatsApp Cloud API numbers. Legacy `phoneNumberId` retained as
  fallback so single-brand callers don't break.
- `integrations/messaging/adapters/whatsapp.js`: removed the module-load
  `BASE` constant, added `baseFor(business)` that resolves the right
  phone number per call. `sendMessage`/`sendTemplate`/`sendDocument`
  all accept an optional `business` arg.

### Required env vars (add to your .env if not already set)
```
WHATSAPP_PHONE_ID_JEWELRY=<phone_number_id_bejewelled>
WHATSAPP_PHONE_ID_DIFFUSERS=<phone_number_id_orika_living>
META_ACCESS_TOKEN=<page_access_token>
META_VERIFY_TOKEN=<webhook_verify_token>
CAMPAIGN_APPROVAL_THRESHOLD=50          # optional
WA_DAILY_SEND_LIMIT=1000                # optional
```
