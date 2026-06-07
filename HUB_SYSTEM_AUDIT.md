# Hub System — Full Codebase Audit

**Date:** 2026-05-30  
**Scope:** Complete fullstack — backend (Node.js/Express/PostgreSQL) + frontend (React/TypeScript/Zustand)

---

## Architecture Overview

### Tech Stack

- **Backend:** Node.js + Express, PostgreSQL (multi-tenant via schema-per-business), Redis (permission cache), Socket.IO
- **Frontend:** React 18 + TypeScript, Zustand (state), TanStack Query, Vite, Tailwind CSS
- **Auth:** JWT (access) + hashed refresh tokens, RBAC via `shared.permissions` table, Redis-cached
- **Multi-tenancy:** Schema-per-business (`SET LOCAL search_path TO {business}, shared, public`), dynamic business registry cached in memory

### Clean Data Flow

```
Browser → Vite SPA → /api (Express)
                      ├── verifyToken (JWT → Redis + DB)
                      ├── setBusinessContext (X-Business-Line header → in-memory cache)
                      ├── can(module, action) (Redis → DB → req.permissionScope)
                      └── Module Route → Service → Repository → withBusinessContext(PostgreSQL)
```

---

## 🔴 CRITICAL — Fix Before Client Test

### C1. POS Terminal Creation Has No UI — POS Is Blocked

**File:** `client/src/pages/pos/POSTerminals.tsx`
**Impact:** If no terminals exist in DB, client sees an empty page with zero way to add one. POS is completely blocked.

What exists:

- Backend: `POST /api/pos/terminals` — fully implemented
- Frontend service: `createTerminal()` in `services/pos/terminals.ts` — implemented
- Frontend page: `POSTerminals.tsx` — **zero UI to create a terminal**

Fix — add to POSTerminals.tsx:

```tsx
// Fetch locations for dropdown
const { data: locations = [] } = useQuery({
  queryKey: ["stock-locations"],
  queryFn: () => api.get("/catalogue/locations").then((r) => r.data.data ?? []),
});

const [showCreate, setShowCreate] = useState(false);
const [newName, setNewName] = useState("");
const [locationId, setLocationId] = useState("");

const createMutation = useMutation({
  mutationFn: () =>
    createTerminal({ name: newName.trim(), location_id: locationId }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["pos-terminals"] });
    setShowCreate(false);
    setNewName("");
    setLocationId("");
    showToast.success("Terminal created");
  },
  onError: (err) => showToast.error(errMsg(err)),
});
```

Add a "New Terminal" button to the PageHeader and a Modal with name + location dropdown.

Also seed a stock location if none exist — terminals require location_id:

```sql
INSERT INTO {business}.stock_locations (name, location_type, is_active)
VALUES ('Main Floor', 'retail', true) ON CONFLICT DO NOTHING;
```

---

### C2. AppShell Auth Race — Every Page Refresh Redirects to Login

**Files:** `client/src/components/shell/AppShell.tsx`, `client/src/stores/useAuthStore.ts`
**Impact:** Every browser refresh kicks users to /login. In a 5-hour client test this will look like a broken system.

Root cause:

```ts
// Store initializes: user = null
// AppShell:
useEffect(() => { hydrate(); }, [hydrate]); // fires AFTER first render
if (!user) return <Navigate to="/login" replace />; // fires FIRST → redirect
// hydrate() never runs — AppShell already unmounted
```

Fix:

```ts
// useAuthStore.ts — add:
isHydrated: false,
hydrate: () => {
  const u = getUser();
  if (u) set({ user: u as AuthUser });
  set({ isHydrated: true }); // ← always mark, even if no user
},

// AppShell.tsx — change:
const { user, isHydrated } = useAuthStore(s => ({ user: s.user, isHydrated: s.isHydrated }));
if (!isHydrated) return <div className="min-h-screen bg-orika-black" />; // blank, not redirect
if (!user) return <Navigate to="/login" replace />;
```

---

### C3. req.user.role_name Is Undefined — Admin Session Management Broken

**File:** `shared/auth/auth.routes.js` line ~167
**Impact:** No admin can view or revoke another user's sessions. Always returns 403.

Root cause: verifyToken sets `req.user = { user_id, role_id, current_business, permitted_businesses, session_id }`. No role_name. But the endpoint checks:

```js
if (!allowed.includes(req.user.role_name)) { // role_name is ALWAYS undefined → always 403
```

Quickest fix — add role_name lookup in verifyToken:

```js
// In auth.js verifyToken, after the main DB query, add:
const roleResult = await client.query(
  `SELECT r.role_name FROM shared.user_roles ur
   JOIN shared.roles r ON r.role_id = ur.role_id
   WHERE ur.user_id = $1 LIMIT 1`,
  [decoded.user_id],
);
req.user.role_name = roleResult.rows[0]?.role_name || null;
```

---

### C4. Contacts Service Hardcoded "jewelry" Fallback

**File:** `shared/contacts/contacts.service.js` line 11

```js
const biz = business || user.current_business || "jewelry"; // ← hardcoded
```

Any non-jewelry business missing a business context will silently query the jewelry schema.

Fix:

```js
const biz = business || user.current_business;
if (!biz)
  throw Object.assign(new Error("Business context required"), { status: 400 });
```

---

### C5. Contact Count Not Scoped to Filters — Wrong Pagination Totals

**File:** `shared/contacts/contacts.service.js`

```js
const rows = await repo.list(client, {
  business: biz,
  search,
  type,
  limit,
  offset,
}); // filtered
const total = await repo.count(client, biz); // NO filter — wrong total
```

Fix: add `countFiltered(client, biz, { search, type })` to the repository that mirrors the list() WHERE clause.

---

## 🟠 HIGH — Fix This Week

### H1. contact_type and visible_to Cannot Be Updated via PATCH

**File:** `shared/contacts/contacts.service.js`

The patchable fields array is missing `"contact_type"` and `"visible_to"`. A contact's type can be set on creation but never changed. The edit UI silently does nothing for these fields.

Fix: Add `"contact_type"`, `"visible_to"` to the fields array in the `update()` function.

---

### H2. POS Store Doesn't Clear on Business Switch

**File:** `client/src/stores/useBusinessStore.ts`

Switching business leaves old terminal/session in posStore. Next POS request sends new X-Business-Line header with stale session_id → 404.

Fix:

```ts
setActive: (key) => {
  set({ active: key });
  const pos = usePOSStore.getState();
  pos.setTerminal(null); pos.setSession(null); pos.clearCart();
},
```

---

### H3. Contacts List Loads Only 200 Records with Client-Side Filtering

**File:** `client/src/pages/contacts/ContactsHome.tsx`

```ts
queryFn: () => listContacts({ search: filters.search, limit: 200 }),
// All type/priority/source filtering done client-side on truncated results
```

With 200+ contacts: records silently disappear, tab counts are wrong.
Fix: Move all filtering server-side. Add `type`, `priority`, `source` params. Add real pagination.

---

### H4. Invoices Hardcoded at 100 Records — No Pagination

**File:** `client/src/pages/invoicing/InvoicesHome.tsx`

```ts
queryFn: () => listInvoices({ status: ..., limit: 100 }),
```

Backend supports pagination. Fix: use page/limit with a pagination control.

---

### H5. Duplicate RBAC UIs — Settings/Permissions AND Security/Roles

Two separate UIs manage the same `shared.permissions` table via the same backend:

- `/settings/permissions` — PermissionMatrix (133 lines, `@services/settings/permissions`)
- `/security/roles` — PermissionMatrix (346 lines, `@services/security`)

Both call `/settings/permissions/...` correctly so no data inconsistency, but the duplication is confusing. Client will find "Roles" in two places. Consolidate to Settings; make Security/Roles a read-only view or remove it.

---

### H6. No Default Stock Location Created on Business Bootstrap

`scripts/bootstrapBusiness.js` creates schema, tables, COA, document sequences — but no stock locations. POS terminals require a location_id. After creating a new business, admin must create a location separately (no guidance in UI) before they can create any terminal.

Fix — add to bootstrapBusiness.js after migrations:

```js
await client.query(`
  INSERT INTO ${key}.stock_locations (name, location_type, is_active)
  VALUES ('Main Floor', 'retail', true)
`);
```

---

## 🟡 MEDIUM — Next Sprint

### M1. cookieParser Registered Twice

`app.js` lines 52 and 69. Remove the second registration.

### M2. Duplicate Contact Service Files

- `services/contacts.ts` (legacy wrapper, always sets contact_type: ['customer'])
- `services/contacts/contacts.ts` (canonical)

These will drift. Delete `services/contacts.ts`. Update its 3 import sites.

### M3. services/purchasing/pos.ts Is Badly Named

Handles Purchase Orders (POs), not Point-of-Sale. Rename to `purchaseOrders.ts`.

### M4. tasks/index.ts addSubtask Drops display_order

```ts
export function addSubtask(_taskId: string, title: string): Promise<Subtask> {
  return addSubtaskCore(_taskId, { title }); // display_order silently dropped
}
```

Fix: accept and forward `display_order`.

### M5. JWT Revocation Gap

After logout, access token remains valid until expiry. verifyToken checks `is_active` only, not `jti` revocation. Acceptable if expiry is short (≤15 min). Full fix: add jti to Redis revocation set on logout.

### M6. Invoice Line Items Missing Validation

```js
body("lines").isArray({ min: 1 }), // no per-item validation
```

NaN from bad line data propagates into VAT calculations and journal entries.
Fix: add `body("lines.*.quantity").isInt({ min: 1 })` and `body("lines.*.unit_price").isFloat({ min: 0 })`.

### M7. Accounting Journals Fail Silently When COA Accounts Missing

If COA entries (1100, 1210, 1310, 2210, 4100, 5000, 1410) are missing, journal posting logs a warning and returns. The sale/invoice succeeds but no accounting entry is recorded. No alert to operator.
Fix: throw an error instead of silently skipping.

### M8. Contact Timeline Inline Schema Interpolation

```js
`SELECT ... FROM ${business}.invoices WHERE contact_id = $1`;
```

Business key comes from validated req.business so injection-safe, but breaks the parameterized-query convention. Note for code review.

---

## 🔵 LOW — Code Quality

### L1. Duplicate Migration Number 000043

- `000043_insert_products_and_catalouge.sql` (typo: "catalouge")
- `000043_sales_campaigns.sql`
  Migrator tracks by filename so both run, but convention is broken. Renumber one to 000044 and fix the typo.

### L2. Business Creation Defaults provision_schema: true

Defaults to irreversible full schema provisioning. Consider defaulting to false with an explicit opt-in.

### L3. Two Campaign Scheduler Jobs With Similar Names

- `jobs/runScheduledCampaigns.js`
- `jobs/sendScheduledCampaigns.js`
  Verify these don't double-trigger campaign sends.

---

## Module-by-Module Issues

| Module                | Critical                                   | High                                                | Medium                                                    | Low                   |
| --------------------- | ------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------- | --------------------- |
| **POS**               | No terminal creation UI (C1)               | POS store biz switch (H2), no default location (H6) | VAT rate called twice                                     | —                     |
| **Contacts**          | Hardcoded "jewelry" (C4), wrong count (C5) | contact_type not patchable (H1), 200-limit (H3)     | Duplicate service files (M2)                              | —                     |
| **Auth/Sessions**     | role_name undefined → 403 (C3)             | —                                                   | JWT revocation gap (M5)                                   | —                     |
| **AppShell**          | Page refresh → login (C2)                  | —                                                   | —                                                         | —                     |
| **Invoicing**         | —                                          | 100-record limit (H4)                               | Line validation missing (M6), silent journal failure (M7) | —                     |
| **CRM**               | —                                          | contact_type not editable (H1 shared)               | logActivity implicit client arg                           | —                     |
| **Settings/Security** | —                                          | Duplicate RBAC UIs (H5)                             | provision_schema default                                  | —                     |
| **Tasks**             | —                                          | —                                                   | addSubtask drops display_order (M4)                       | —                     |
| **app.js**            | —                                          | —                                                   | cookieParser twice (M1)                                   | —                     |
| **Migrations**        | —                                          | —                                                   | —                                                         | Dup 000043, typo (L1) |

---

## Files to Rewrite

| File                                          | Reason                                                 |
| --------------------------------------------- | ------------------------------------------------------ |
| `middleware/auth.js`                          | Add role_name to req.user                              |
| `shared/contacts/contacts.service.js`         | Remove hardcoded fallback; fix count; add contact_type |
| `client/src/components/shell/AppShell.tsx`    | isHydrated guard                                       |
| `client/src/stores/useAuthStore.ts`           | isHydrated flag                                        |
| `client/src/pages/pos/POSTerminals.tsx`       | Terminal creation UI                                   |
| `client/src/stores/useBusinessStore.ts`       | Clear POS on biz switch                                |
| `client/src/pages/contacts/ContactsHome.tsx`  | Server-side filtering + pagination                     |
| `client/src/pages/invoicing/InvoicesHome.tsx` | Real pagination                                        |
| `client/src/services/tasks/index.ts`          | Fix addSubtask signature                               |
| `client/src/services/contacts.ts`             | Delete; consolidate                                    |
| `modules/invoicing/invoicing.routes.js`       | Add line-item validators                               |
| `scripts/bootstrapBusiness.js`                | Seed default stock location                            |
| `shared/auth/auth.routes.js`                  | Fix session management role check                      |

---

## Pre-Test Verification SQL

Run these against your database before the client arrives:

```sql
-- 1. Both 000043 migrations ran
SELECT filename FROM shared.migrations WHERE filename LIKE '000043%';

-- 2. COA exists (critical for POS + invoicing journals)
SELECT code, name FROM {business}.chart_of_accounts
WHERE code IN ('1100','1210','1310','2210','4100','5000','1410');

-- 3. Document sequences exist
SELECT business, document_type, prefix FROM shared.document_numbering
WHERE business = '{business}'
  AND document_type IN ('receipt','invoice','quote','purchase_order');

-- 4. Stock locations exist (required for terminal creation)
SELECT location_id, name FROM {business}.stock_locations WHERE is_active = true;

-- 5. POS terminals exist
SELECT terminal_id, name FROM {business}.pos_terminals WHERE is_active = true;
```

---

## Architecture Strengths (Preserve These)

- Schema-per-business with SET LOCAL search_path is correct and safe
- withBusinessContext / withSharedContext / withStoreContext cleanly separates data domains
- nextDocumentNumber with row-level locking prevents duplicate document numbers
- can(module, action) middleware with Redis cache is elegant and performant
- POS journal posting (revenue + COGS) implements correct double-entry bookkeeping
- Refresh token rotation with SHA-256 hashing is secure
- Business cache in config/businesses.js with fallback is well-designed
- Error handler cleanly propagates err.status; no raw 500s in production
- Comprehensive audit logging on every write path
- bootstrapBusiness.js full-schema provisioning via web UI is architecturally sound
