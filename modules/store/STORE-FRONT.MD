storefront is now a true ERP sales channel
Scope change applied: admin routes discarded, storefront fully ERP-managed, every web sale balances with the books.
What changed from the first build

1. Admin routes deleted. store.admin.routes.js is gone, unmounted from routes/index.js. Products, scents, orders are managed from the ERP — the catalogue module already does product CRUD, and the storefront's web-only fields (slug, scent_family, format, notes, images) live on store.products which the ERP UI will edit.
2. store.products is now a presentation layer, not an island. It has no price and no stock columns. Instead it carries a product_id FK to diffusers.products, and every product query JOINs the ERP: price_kobo comes from diffusers.products.selling_price × 100, stock_qty from SUM(quantity × direction) over diffusers.stock_movements. The storefront physically cannot display a price or stock figure the ERP disagrees with — there's no separate copy to drift.
3. verifyAndFulfil now balances with the ERP. This is the heart of it. When a web order is paid, the whole fulfilment runs inside withBusinessContext('diffusers') and:

writes a stock_movements row (sold, direction −1) for each line → ERP stock decremented
posts a revenue journal — DR Bank 1210 / CR Sales 4100 / CR VAT 2210 (VAT backed out at the business rate)
posts a COGS journal — DR COGS 5000 / CR Inventory 1410, using weighted-average cost via stockService.calculateSaleCOGS
flips the order to paid and records both journal ids — atomically, in the same transaction

It's the exact path a POS sale takes. A web sale now shows up in the P&L, the balance sheet, and the stock ledger. 4. Web customers join the ERP CRM. store.customers links to shared.contacts — checkout creates a shared.contacts row (contact_type ['customer']) for any new buyer, so web buyers appear in CRM alongside walk-in customers. 5. Newsletter, subscribe, unsubscribe, enquiries — all kept, untouched, storefront-owned (no ERP equivalent).
Integrity guarantees

Idempotent fulfilment — markOrderPaidWithJournals only touches a pending row; repeat webhooks and the verify-endpoint can't double-post journals or double-decrement stock.
All-or-nothing — the entire fulfilment is one DB transaction. If a journal or stock movement throws, everything rolls back; the order stays pending and retries cleanly. An order can never be paid without its journals.
Amount mismatch flags the order processing for review instead of fulfilling.
Verified against the schema — diffusers.stock_movements exists, all 5 COA codes (1210/4100/2210/5000/1410) are seeded, and I caught + fixed that shared.contacts.contact_type is a text[] array (my insert was passing a scalar — would have thrown).
