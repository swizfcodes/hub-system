# Hub Platform — Backend

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your values

# 3. Create PostgreSQL database
createdb hubdata

# 4. Run migrations
npm run migrate

# 5. Verify schema
npm run db:verify

# 6. Create first admin user
npm run admin

# 7. Start server (development)
npm run dev
```

## Project Structure

```
config/       — DB pool, Redis, Socket.io, logger, all env config
middleware/   — Auth, business context, permissions, rate limiter
shared/       — Cross-business modules: contacts, docs, messaging etc.
modules/      — Business modules: CRM, sales, POS, invoicing etc.
integrations/ — External APIs: Shopify, Paystack, Meta, couriers
lib/          — PDF generation, email, currency, storage
jobs/         — Scheduled cron jobs
templates/    — HTML templates for PDF rendering
public/       — PWA frontend assets
routes/       — Central route registration
migrations/   — SQL migration files (run via npm run migrate)
scripts/      — Admin scripts
tests/        — Unit and integration tests
```

## Key Patterns

- Every DB query runs inside `withBusinessContext(req.business, async (client) => {...})`
- `SET LOCAL search_path TO {business}, shared, public` scopes queries per request
- Permission checks via `can('module','action')` middleware on every route
- All document numbers from `nextDocumentNumber(client, business, type)`
- Financial mutations always post a matching `journal_entry`
- Stock changes always write to `stock_movements` — never update a quantity column

## Tests

- Run `npm test`
- Read `TEST_SUMMARY.md` for more information
