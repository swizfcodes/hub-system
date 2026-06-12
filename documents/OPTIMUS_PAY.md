# Optimus Pay — Integration Runbook

> Orika Living — virtual-account collections via Optimus Bank (OnePipe).
> This is the single current reference for the integration. The official API
> documentation (Postman) is the source of truth for the wire contract.

---

## What we use

| Service | Provider | Purpose |
|---|---|---|
| Open Account (dynamic) | `OptimusVirtual` | One amount-bound virtual account per order/invoice, expires ~30 min |
| Transaction Notification | `OptimusVirtual` | Webhook fired when the transfer lands |
| Query Transaction | `OptimusVirtual` | Server-to-server verification before fulfilling |

All three must show as **approved** on the Optimus dashboard
(https://optimuspayconsole.onepipe.io), and the app must be in **Live** mode.

## Where the code lives

```
integrations/optimus/optimus.service.js   API client (open account, query)
integrations/optimus/optimus.webhook.js   Inbound notifications → fulfilment
config/config.js → optimusPay             Env wiring + mock_mode validation
scripts/optimus-mock-server.js            Local stand-in for OnePipe (dev only)
documents/OptimusPaymentPanel.portable.jsx Drop-in React panel for the website
migrations/000053_optimus_pay.sql         optimus_* columns on all payment tables
```

Payment surfaces that provision virtual accounts:

1. **Sales-campaign storefront** — `modules/sales_campaigns/storefront.service.js`
2. **Website store (orikaliving.com)** — `modules/store/store.service.js`
3. **Invoicing** — `modules/invoicing/invoicing.service.js` (`payment_method: optimus_pay`)

All fulfilment happens **only** in the webhook (`/api/webhooks/optimus`), never
from a client call.

## Environment

```
OPTIMUS_PAY_API_KEY=…            # console → API Settings (exact copy, no spaces)
OPTIMUS_PAY_CLIENT_SECRET=…      # console → API Settings
OPTIMUS_PAY_ACCOUNT_NAME=ORIKA LIVING LTD
OPTIMUS_PAY_MOCK_MODE=Live       # must match the app mode on the dashboard
OPTIMUS_PAY_WEBHOOK_VERIFY=on    # query-back verification (keep on in prod)
# OPTIMUS_PAY_BASE_URL           # UNSET in prod (defaults to https://api.onepipe.io)
```

The base URL is deliberately **not** keyed on `NODE_ENV`: production hits
`https://api.onepipe.io` unless `OPTIMUS_PAY_BASE_URL` explicitly points local
dev at the mock. The webhook URL is configured on the Optimus dashboard:
`https://app.orikaliving.com/api/webhooks/optimus`.

## Wire contract (per the official docs)

- Headers on every call: `Content-Type: application/json`,
  `Authorization: Bearer {api_key}`, `Signature: MD5(request_ref;secret)`.
- `request_ref` unique per call; `transaction_ref` unique per transaction
  (`store-{orderId}`, `inv-{invoiceId}`, campaign `order_id`).
- Amounts are **kobo** everywhere (naira × 100); dynamic accounts carry the
  expected amount in `transaction.meta.amount`, `transaction.amount` stays 0.
- `transaction.mock_mode`: `"Live"` or `"Inspect"` only — and it must match
  the app's dashboard mode, otherwise the API rejects with
  **"Request mode not supported"**.
- Empty `data.errors` + status `Successful` = success; `Duplicate` = same
  request inside a 5-minute window (treated as in-flight, HTTP 409).
- Webhook: respond `200 OK` fast; payload nests everything under `details`
  with `details.amount` in kobo and `details.transaction_ref` = our ref.

## Payment flow

```
checkout (optimus_pay) → open_account (dynamic VA, meta.amount = kobo)
  → customer sees account + 30-min countdown, transfers
  → Optimus POSTs /api/webhooks/optimus
  → handler: idempotency check → query-back (/v2/transact/query) → amount guard
  → confirm: campaign order / store order (stock + journals) / invoice payment
  → client polls (campaign tracking page, /api/store/optimus/verify) → "paid"
```

Webhook security: notifications carry no signature, so the handler re-queries
the transaction server-to-server and requires `Successful` before fulfilling.
Underpayments are never auto-confirmed — they stay in `shared.webhook_log`
with `error_message` for manual reconciliation. Overpayments confirm and are
flagged in the logs.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "Request mode not supported" (error code 01) | The app on OnePipe is not enabled for the mode sent. An app awaiting live activation accepts only `Inspect` and rejects `Live` | Optimus must activate Live for the app (OPTO872115) — email digitalbanking@optimusbank.com. Don't "fix" it by switching production to Inspect |
| Account provisioned but payer's bank finds no name (e.g. "John Doe", 999… number) | `Inspect` mode fabricates a placeholder account — nothing is registered at the real bank, so name-enquiry fails and it can never receive money | Live mode only. Real accounts carry `name_on_account` (ORIKA LIVING LTD) |
| "Could not provision payment account…" | Any open_account failure — the customer-facing wrapper | `grep '\[optimus\]' logs/error.log` for the provider's real message |
| HTTP 401 from API | Wrong/whitespace-padded key or secret; service not approved for the app | Re-paste keys exactly; confirm service approval on the console |
| "Optimus Pay is not configured…" (503) | Env vars missing on the server | Set `OPTIMUS_PAY_API_KEY` / `OPTIMUS_PAY_CLIENT_SECRET`, restart PM2 |
| Paid but order never confirms | Webhook not reaching us, or query-back failing | Check dashboard webhook URL; `SELECT * FROM shared.webhook_log WHERE source='optimus' ORDER BY created_at DESC` — unprocessed rows carry `error_message` |
| `Duplicate` (409) on checkout retry | Same request inside OnePipe's 5-min window | Wait and retry; the first request is still in flight |
| Accounts opening with wrong name | `OPTIMUS_PAY_ACCOUNT_NAME` unset | Set it (payers see it on name-enquiry) |

## Go-live checklist

1. **Optimus must activate Live mode for the app** (OPTO872115) — having Live
   API keys is not the same thing; until activation the gateway accepts only
   Inspect and rejects Live with error 01. All three services approved, and
   settlement confirmed as mapped to ORIKA LIVING LTD's corporate account at
   Optimus Bank (the unactivated app profile shows an unset beneficiary —
   defaulted bank name, null account number — so have Optimus confirm the
   mapping in writing at activation). Webhook URL set to
   `https://app.orikaliving.com/api/webhooks/optimus`.
2. Server `.env`: Optimus section present (see `.env.example`), **no**
   `OPTIMUS_PAY_BASE_URL` line.
3. `NODE_ENV=production node scripts/optimus-smoke-test.js` — provisions one
   throwaway dynamic account against the live API and prints a pass/fail
   diagnosis (expires on its own, no funds move).
4. `pm2 restart hub-api --update-env`, then watch `logs/error.log` for
   `[optimus]` lines while placing a small live test order on each surface
   (campaign checkout + website checkout + an invoice payment).
5. Confirm the order flips to paid after the transfer and the journal posts.

## Local development

```
node scripts/optimus-mock-server.js          # fake OnePipe on :7100
# .env.local:
OPTIMUS_PAY_BASE_URL=http://localhost:7100
OPTIMUS_PAY_NOTIFICATION_URL=http://localhost:7000/api/webhooks/optimus
OPTIMUS_PAY_WEBHOOK_VERIFY=off               # mock can't answer query-back
```

The mock auto-fires the confirmation webhook a few seconds after checkout so
the full pay-and-confirm loop can be exercised without real money.
