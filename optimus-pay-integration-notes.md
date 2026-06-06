# Optimus Pay Integration Notes
> Orika Living — Payment Gateway Research & Integration Plan  
> Date: 2026-06-05  
> Status: **Awaiting Service Approval from Optimus Bank**

---

## Overview

Optimus Pay is a **Banking as a Service (BaaS)** product from **Optimus Bank** (CBN-licensed National Commercial Bank, operational since January 2023). It is built on top of the **OnePipe** platform (`api.onepipe.io`), which acts as a provider-agnostic abstraction layer over multiple Nigerian payment providers (Paystack, Flutterwave/Rave, Quickteller, Interswitch, etc.).

**Why Optimus Pay over Paystack (interim):**
- Virtual accounts settle in as little as **1 hour** (our current transaction log shows `ONE_HOUR` settlement cycle)
- No OTP friction for customers — just a standard bank transfer
- Provider-agnostic: can swap underlying providers without changing integration code
- Direct relationship with Optimus Bank (CBN-regulated)

---

## Account Status

- **Dashboard:** https://optimuspayconsole.onepipe.io
- **Contact:** digitalbanking@optimusbank.com
- **Account:** Set up, password configured ✅

### Services on Account

| Service | Provider | Status |
|---|---|---|
| Open Account | OptimusVirtual | ⏳ Awaiting Approval |
| Close Account | OptimusVirtual | ⏳ Awaiting Approval |
| Transaction Notification | OptimusVirtual | ⏳ Awaiting Approval |

> **Action required:** Follow up with Optimus Bank to approve **Open Account** and **Transaction Notification** services.

---

## API Reference

### Base URLs

| Environment | URL |
|---|---|
| **Production** | `https://api.onepipe.io` |
| **Mock/Test** | `https://409a9dcf-73e5-41bb-aa2e-ba6c286173a3.mock.pstmn.io` |

> Swapping from mock to production is a **one-line change** — all other code stays identical.

### Authentication Headers (every request)

```
Content-Type: application/json
Authorization: Bearer {api_key}
Signature: MD5Hash(request_ref;client_secret)
```

- `api_key` and `client_secret` are generated from the Optimus Pay dashboard
- `request_ref` must be **unique per API call**
- `Signature` is an MD5 hash of `request_ref` + `;` + `client_secret`

### Signature Computation (Node.js)

```js
const crypto = require('crypto');

function computeSignature(requestRef, clientSecret) {
  return crypto
    .createHash('md5')
    .update(`${requestRef};${clientSecret}`)
    .digest('hex');
}
```

---

## Encryption

Sensitive values in `auth.secure` (BVN, card details, account numbers) must be encrypted using **Triple DES** with your `client_secret` as the key.

### Key Derivation

1. Encode `client_secret` as UTF-16LE
2. MD5 hash it → 16 bytes
3. Append first 8 bytes → 24-byte key
4. IV: 8 null bytes
5. Cipher: `DES-EDE3-CBC` with PKCS5 padding
6. Output: Base64 string

### Node.js Implementation

```js
const crypto = require('crypto');

function encrypt(sharedKey, plainText) {
  const bufferedKey = Buffer.from(sharedKey, 'utf16le');
  const key = crypto.createHash('md5').update(bufferedKey).digest();
  const newKey = Buffer.concat([key, key.slice(0, 8)]);
  const IV = Buffer.alloc(8, '\0');
  const cipher = crypto.createCipheriv('des-ede3-cbc', newKey, IV).setAutoPadding(true);
  return cipher.update(plainText, 'utf8', 'base64') + cipher.final('base64');
}
```

### What to encrypt per auth type

| Auth Type | Value to encrypt |
|---|---|
| BVN | `bvn` |
| Bank Account | `bank_account;bank_code` |
| OTP | `otp` |
| Card (Card-Not-Present) | `card.Pan;card.Cvv;card.Expdate;card.Pin` |
| Card (Card-Present / DCIR) | `card.Pan;;card.Expdate;card.Pinblock` |

> Note: Expiry date format is `YYMM`

---

## Standard Request Structure

All requests share this top-level JSON shape:

```json
{
  "request_ref": "unique-per-call-string",
  "request_type": "open_account | collect | disburse | transfer_funds",
  "auth": {
    "type": "bvn | bank.account | card | token",
    "secure": "<TripleDES encrypted value>",
    "auth_provider": "Optimus"
  },
  "transaction": {
    "amount": 650000,
    "transaction_ref": "unique-per-transaction-string",
    "transaction_desc": "Payment for Order #001",
    "customer": {
      "customer_ref": "cust-001",
      "firstname": "Emeka",
      "surname": "Eze",
      "email": "emeka@email.com",
      "mobile_no": "2348012345678"
    },
    "meta": {},
    "details": {}
  }
}
```

> **Amount is in kobo** (₦6,500 = `650000`)

---

## Standard Response Structure

```json
{
  "status": "Successful | Failed | WaitingForOTP | Processing | Duplicate | Fraud",
  "message": "Human-readable description",
  "data": {
    "provider_response_code": "00",
    "provider": "Optimus",
    "errors": [],
    "error": null,
    "charge_token": "optional-reusable-token"
  }
}
```

### Status Codes

| Status | Meaning |
|---|---|
| `Successful` | Transaction processed successfully |
| `Failed` | Definite failure — read `errors` |
| `WaitingForOTP` | OTP required — prompt user and call OTP endpoint |
| `Processing` | Still in flight — do not assume failure |
| `Duplicate` | Same request sent within 5 minutes |
| `Fraud` | Flagged as suspicious |
| `InvalidID` | Lookup ID not found |

### HTTP Status Codes

| Code | Meaning |
|---|---|
| `200` | Request accepted — check `status` field for outcome |
| `400` | Validation error — bad request data |
| `401` | Auth failure — invalid API key or unregistered service |
| `500` | Server error — report if persistent |

---

## Integration Plan: Replacing Paystack with Virtual Accounts

### Payment Flow

```
Customer checks out
        ↓
Backend calls Open Account API
        ↓
Get virtual account number + bank name
        ↓
Show customer: "Transfer ₦X to [account] at [bank]"
        ↓
Customer transfers via their banking app
        ↓
Optimus fires webhook → your notification_url
        ↓
Backend validates amount, marks order paid
```

### Services Required

1. **Open Account** — create a virtual account per customer or per order
2. **Transaction Notification** — webhook fired when account receives inflow

### Open Account — Expected Request

```json
{
  "request_ref": "unique-ref-001",
  "request_type": "open_account",
  "auth": {
    "type": "bvn",
    "secure": "<TripleDES(customer_bvn, secret_key)>",
    "auth_provider": "Optimus"
  },
  "transaction": {
    "amount": 650000,
    "transaction_ref": "order-ref-001",
    "transaction_desc": "Payment for Order #001",
    "customer": {
      "customer_ref": "cust-001",
      "firstname": "Emeka",
      "surname": "Eze",
      "email": "emeka@email.com",
      "mobile_no": "2348012345678"
    }
  }
}
```

### Transaction Notification — Webhook

- You expose a `POST` endpoint (e.g. `/webhooks/optimus`)
- Optimus POSTs to it when money lands on a provisioned account
- Validate: amount matches expected, `status` is `Successful`, no duplicate `transaction_ref`

---

## Mock → Production Switch

```js
// config.js
const BASE_URL = process.env.NODE_ENV === 'production'
  ? 'https://api.onepipe.io'
  : 'https://409a9dcf-73e5-41bb-aa2e-ba6c286173a3.mock.pstmn.io';
```

Everything else — auth, signatures, request bodies, webhook handling — stays the same.

---

## Existing Transaction Data (Reference)

Sample settlement record received from Optimus Bank:

| Field | Value |
|---|---|
| Transaction Type | PURCHASE |
| Action | CREDIT |
| Response Code | 00 (Approved) |
| Payment Method | CARD |
| Amount | ₦6,500.00 |
| Amount Settled | ₦6,467.50 |
| Fee | ₦32.50 |
| Settlement Cycle | ONE_HOUR |
| Settlement Account | 1000293931 |
| Merchant Name | ORIKA LIVING LTD LEKKI |
| Issuing Bank | Providus Bank |
| PAN | 523046\*\*\*\*\*\*2560 (masked ✅) |

---

## Next Steps

- [ ] Follow up with Optimus Bank to approve Open Account + Transaction Notification services
- [ ] Get endpoint-specific docs for Open Account and Transaction Notification (click Documentation links on dashboard)
- [ ] Build and test against mock server
- [ ] Add project folder to Cowork for direct file access
- [ ] Swap `BASE_URL` to production once services are approved

---

## Resources

- Postman Docs: https://documenter.getpostman.com/view/6358444/2s9Ykhijtx
- Dashboard: https://optimuspayconsole.onepipe.io
- Support: digitalbanking@optimusbank.com
- CBN Bank Codes: https://bank.codes/api-nigeria-nuban/
