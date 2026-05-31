# Sales Campaign & Landing Page — Audit & Repairs

**Scope:** the sales-campaign module (`modules/sales_campaigns`), the public storefront/landing page (`client/src/pages/storefront`), the campaign builder UI, and the image-upload pipeline.
**Date:** 31 May 2026

---

## 1. Why the landing page says "Not Available" (root cause)

The shared link `https://app.orikaliving.com/c/diffusers/orika-diffuser-sale` resolves correctly (`diffusers` is a valid business schema, `orika-diffuser-sale` is the slug), the SPA route exists, and the API is mounted. The page failed for a single, concrete reason:

**The public storefront query referenced a database column that does not exist.**

`modules/sales_campaigns/campaigns.repository.js → getStorefrontCampaign()` built each product's image URL from `p.primary_image_document_id`:

```sql
CASE WHEN p.primary_image_document_id IS NOT NULL
     THEN '/api/documents/' || p.primary_image_document_id || '/image'
     ELSE NULL END
```

But `products` has **no such column** (migration `000007`). Product images live in a separate `product_images` table (`document_id`, `is_primary`). PostgreSQL resolves every column reference when it *parses* the statement — before any rows are read — so the query threw `column p.primary_image_document_id does not exist` on **every** request. The flow was:

`GET /api/c/diffusers/orika-diffuser-sale` → query throws → service rejects → API returns 500 → the frontend service `getStorefrontPage()` catches and returns `null` → `LandingPage.tsx` renders **"Not Available."**

This is why it failed for *all* storefront pages, not just this one. The admin builder kept working because its query (`findCampaignById`) uses the correct `product_images` join — so the campaign looked perfectly fine inside the ERP while the public page was broken.

**Fix** — derive the image from `product_images`, matching the working admin query:

```sql
COALESCE(
  cp.campaign_image_url,
  (SELECT '/api/documents/' || pi.document_id || '/image'
     FROM product_images pi
    WHERE pi.product_id = p.product_id AND pi.is_primary = true
    ORDER BY pi.display_order
    LIMIT 1)
)
```

**One thing to confirm after deploy:** the page only renders when the campaign's `status` is `live` (or `expired`). If a link is opened while the campaign is still `draft` or `scheduled`, it will still say "Not Available" — by design. The builder previously let you copy/share the link before publishing with no warning, so a draft link could be shared by mistake. I added a warning banner in the share panel for any non-live campaign (see §3). After deploying, open the campaign in the ERP and make sure it shows **Live**; if it is `scheduled`, the link starts working once the start date passes (the 5-minute status job handles that).

---

## 2. Image uploads — the 7 MB timeout & automatic WebP compression

**Problem:** nothing in the pipeline compressed images. A 7 MB JPEG hero was stored at full size, hashed, and served raw to every visitor — slow to upload and heavy on the landing page.

**What I added:** a reusable optimizer, `lib/images/optimizeImage.js` (uses `sharp`, already in `package.json`). It auto-orients via EXIF, resizes to fit a max bound (never upscales), and re-encodes to **WebP** (quality ≈ 80–85). A 7 MB photographic JPEG typically drops to ~300–700 KB with no visible quality loss. It is deliberately defensive: non-images (PDF, SVG) pass through untouched, and any failure (corrupt file, or `sharp` not yet installed) falls back to the original bytes so an upload is never blocked.

**Where it's wired in:**

| Upload surface | File | Behaviour |
|---|---|---|
| Campaign hero + all catalogue product images | `shared/documents/documents.service.js` (`uploadDocument`, `document_type = 'product_image'`) | Converted to WebP before hashing & storage |
| Storefront proof-of-payment (public) | `modules/files/files.routes.js` | Images → WebP; PDFs untouched |
| Business logo | `shared/upload/uploads.routes.js` | Raster → WebP; SVG untouched |

I also raised the hero upload's inbound cap from 10 MB → 20 MB so large originals are *accepted and then shrunk* server-side instead of being rejected.

**Note on the timeout:** compression runs after the file reaches the server, so it fixes storage size and (most importantly) page-load weight. If an upload of a very large original still times out *during transfer*, that's a reverse-proxy limit (e.g. nginx `client_max_body_size` / `proxy_read_timeout`) and is an infra setting, not app code.

**Action required:** run `npm install` on the server so the `sharp` native binary is present. Until then the optimizer safely no-ops and stores originals.

---

## 3. Other bugs fixed

| # | Area | Issue | Fix | Severity |
|---|---|---|---|---|
| 1 | `getStorefrontCampaign` (backend) | Non-existent column broke every public page (see §1) | Subquery on `product_images` | **Critical** |
| 2 | `storefront.service.js → trackEvent` | The `business` URL param was interpolated straight into a schema-qualified table name (`${business}.sales_campaigns`) with no validation — a SQL-injection vector on a public, unauthenticated route | Reject unless `businesses.isValidBusiness(business)` before the query runs | **High (security)** |
| 3 | `Checkout.tsx` (bank transfer step) | Display logic `bankAccounts.find(a => a.id === bankAccounts[0]?.id)` + `.map(...).slice(0,1)` always showed the **first** account, ignoring the one the customer selected — customers could transfer to the wrong account | Render the actually-selected account (`watch('bank_account_id')`, falling back to primary/first) | **High (correctness)** |
| 4 | `CampaignBuilder.tsx` & `LandingPage.tsx` | Discount rendered as "**25.00%**" because PostgreSQL returns `NUMERIC` as a string `"25.00"` | Coerce with `Number(...)` so it reads "25%" | Medium (polish) |
| 5 | `CampaignBuilder.tsx` (share panel) | Share/copy link shown for draft/scheduled campaigns with no warning → broken links get shared | Added an amber warning banner whenever status ≠ `live` | Medium (UX) |

The over-long WhatsApp message you pasted is expected behaviour, not a bug: the share text concatenates headline + subheadline + body copy + discount + dates + URL. WhatsApp shows "Read more" past a certain length. If you want it shorter, trim the campaign's **body copy** (or I can cap the share message to the headline + discount + link).

---

## 4. Performance optimizations

- **Public image serving was writing an audit row on every view.** The route `GET /api/documents/:id/image` called `downloadDocument()`, which re-reads the file, recomputes a SHA-256, and writes an audit-log `INSERT` — on *every* `<img>` load of a publicly shared page. I added `getImageForPublic()` (no re-hash, no audit) for the public route, and pointed the route at it. Authenticated downloads keep full verification + audit. This removes a DB write and a full-file hash per image impression.
- **Smaller images end-to-end** (§2): WebP conversion cuts hero/product bytes by ~70–90%, which is the single biggest win for landing-page load time and the upload timeout.
- The hero image is already served with `Cache-Control: public, max-age=31536000, immutable`, so repeat views are cached by the browser. (If you later put the app behind a CDN, these images will cache at the edge for free.)

---

## 5. Files changed

```
NEW  lib/images/optimizeImage.js                         sharp WebP optimizer (resize + compress)
EDIT shared/documents/documents.service.js               compress product images; add getImageForPublic()
EDIT routes/index.js                                      public image route → getImageForPublic()
EDIT modules/files/files.routes.js                       compress proof-of-payment images
EDIT shared/upload/uploads.routes.js                     compress business logos
EDIT modules/sales_campaigns/admin.service.js            hero upload cap 10MB → 20MB
EDIT modules/sales_campaigns/campaigns.repository.js     FIX storefront image column (the "Not Available" bug)
EDIT modules/sales_campaigns/storefront.service.js       validate business in trackEvent (SQLi)
EDIT client/src/pages/storefront/LandingPage.tsx         discount number formatting
EDIT client/src/pages/storefront/Checkout.tsx            show the selected bank account
EDIT client/src/pages/salesCampaigns/CampaignBuilder.tsx discount formatting + non-live share warning
```

No database migration is required — the fix uses an existing table.

---

## 6. Deploy checklist

1. `npm install` on the server (picks up `sharp`).
2. Rebuild the client: `cd client && npm run build`.
3. Restart the API.
4. Confirm the campaign shows **Live** in the ERP, then open the public link — it should now load. Re-upload the hero (it will be stored as WebP).

## 7. Not yet done (needs a running instance / your call)

- I could not run the app or the database here (the sandbox was unavailable), so these changes are verified by code review against the schema, not by live execution. Backend files are syntactically self-consistent; please run the existing `npm test` / smoke tests after `npm install`.
- The proof-upload step in `Checkout.tsx` doesn't check `uploadRes.ok` before parsing — it works via the fallback path, but it's worth tightening if you want cleaner error messages.
