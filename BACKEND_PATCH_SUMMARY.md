# Orika Hub — Backend Accounting Patch Summary

All changes are pure backend (journal side-effects of existing business
transactions). No API contracts changed; the frontend needs no awareness of these.

## Run order
1. Apply migration `migrations/000037_accounting_expansion.sql` to BOTH schemas
   (`jewelry` and `diffusers`) **before** deploying the code.
2. Optionally set env `SYSTEM_USER_ID` (defaults to
   `00000000-0000-0000-0000-000000000001`, which the migration seeds).

## Files changed

### migrations/000037_accounting_expansion.sql  (NEW)
Seeds the system user (`shared.users`) used as `posted_by` for gateway-posted
journals, plus new COA codes in both schemas:
2100 Accounts Payable · 2150 Goods Received Not Invoiced · 1350 Retail Partner
Receivable · 1430 Consignment Stock · 4900 Stock Adjustment Income ·
6900 Inventory Write-off · 6700 Purchases—Non-stock.

### modules/invoicing/invoicing.service.js
- New shared helper `postPaymentJournal()` (exported).
- `recordPayment()` now posts DR Bank/Cash · CR AR (1310) on confirmed payments.
- `voidInvoice()` now reverses the original invoice journal via
  `journalService.reverseEntry`.

### modules/purchasing/purchasing.service.js  (+ purchasing.repository.js)
- `receiveGoods()` posts DR Inventory (1410) · CR GRNI (2150), valued from the
  PO line `unit_price` (added to `getPOLineProduct`).
- `approveBill()` posts DR GRNI (2150, or 6700 if non-PO) · CR AP (2100).
- `payBill()` posts DR AP (2100) · CR Bank (1210 or `data.bank_account_code`).

### modules/expenses/expenses.service.js
- `postExpenseJournal()` rewritten onto `journalService.postEntry`
  (fiscal-period stamped, DR=CR validated). Category→account map expanded
  (fuel, meals, accommodation).

### modules/retail-partners/retail-partners.service.js
- `sendConsignment()` → DR Consignment Stock (1430) · CR Inventory (1410).
- `reportPartnerSale()` → DR Partner Receivable (1350) · CR Revenue (4100)
  [+ CR VAT 2210]; and DR COGS (5000) · CR Consignment Stock (1430).
- `markSettlementPaid()` → DR Bank (1210) · CR Partner Receivable (1350).

### modules/stock/movements.service.js
- `recordMovement()` posts value journals for `adjustment` (±) and `write_off`
  via new `postStockValueJournal()`:
  +adjustment → DR Inventory / CR Stock Adjustment Income (4900);
  −adjustment / write_off → DR Inventory Write-off (6900) / CR Inventory.

### integrations/paystack/paystack.webhook.js, flutterwave/flutterwave.webhook.js
- On payment confirmation, both now post the cash-collection journal by reusing
  `invoicingService.postPaymentJournal`, with `posted_by = config.systemUserId`.

### config/config.js
- Added `config.systemUserId`.

## Caveats to validate before production
- Account-code mappings follow the audit report; confirm they match the live CoA.
- Consignment sale VAT: if no 2210 account exists, VAT is folded into revenue so
  the entry still balances — adjust if you require a separate VAT line.
- Gateway journals assume the confirmed payment row joins cleanly to its invoice;
  verify against real webhook payloads.
- Not implemented (per report priority): loyalty deferred-revenue (P4), and the
  optional multi-bank-account selector UX.
