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
