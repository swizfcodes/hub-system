"use strict";

// ─────────────────────────────────────────────────────────────
// modules/catalogue/catalogue.repository
//
// SQL layer for the catalogue module. Covers six per-business
// resources that other modules read from but don't own:
//
//   products              — master catalogue
//   product_categories    — taxonomy
//   stock_locations       — warehouses, showrooms, retail-partner slots
//   product_images        — links to shared.documents
//   product_suppliers     — many-to-many cost catalogue per supplier
//   barcodes              — internal barcodes (CODE128 etc.) for POS scan
//
// Every function takes a pg client supplied by the service layer's
// withBusinessContext. No transactions opened here — composition is
// the service's job.
// ─────────────────────────────────────────────────────────────

// ── CATEGORIES ───────────────────────────────────────────────

async function listCategories(client, { includeInactive = false } = {}) {
  const filter = includeInactive ? "" : "WHERE is_active = true";
  const { rows } = await client.query(
    `SELECT category_id, name, parent_category_id, description,
            display_order, is_active, created_at, updated_at
     FROM product_categories
     ${filter}
     ORDER BY display_order, name`,
  );
  return rows;
}

async function findCategoryById(client, categoryId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT category_id, name, parent_category_id, description,
            display_order, is_active, created_at, updated_at
     FROM product_categories
     WHERE category_id = $1`,
    [categoryId],
  );
  return row || null;
}

async function insertCategory(
  client,
  { name, parentCategoryId, description, displayOrder },
) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO product_categories
       (name, parent_category_id, description, display_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, parentCategoryId || null, description || null, displayOrder || 0],
  );
  return row;
}

async function updateCategory(
  client,
  categoryId,
  { name, parentCategoryId, description, displayOrder, isActive },
) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE product_categories
     SET name               = COALESCE($2, name),
         parent_category_id = COALESCE($3, parent_category_id),
         description        = COALESCE($4, description),
         display_order      = COALESCE($5, display_order),
         is_active          = COALESCE($6, is_active)
     WHERE category_id = $1
     RETURNING *`,
    [
      categoryId,
      name ?? null,
      parentCategoryId ?? null,
      description ?? null,
      displayOrder ?? null,
      isActive ?? null,
    ],
  );
  return row || null;
}

async function countProductsInCategory(client, categoryId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT COUNT(*)::int AS n FROM products
     WHERE category_id = $1 AND is_deleted = false`,
    [categoryId],
  );
  return row.n;
}

async function softDeleteCategory(client, categoryId) {
  // Soft-delete via is_active=false. Hard delete would orphan
  // category_id FKs on products. Caller verifies no active products
  // first (see countProductsInCategory).
  const { rowCount } = await client.query(
    `UPDATE product_categories SET is_active = false WHERE category_id = $1`,
    [categoryId],
  );
  return rowCount > 0;
}

// ── PRODUCTS ─────────────────────────────────────────────────

async function listProducts(
  client,
  {
    search,
    categoryId,
    includeInactive = false,
    includeDeleted = false,
    page = 1,
    limit = 50,
  } = {},
) {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const where = [];

  if (!includeDeleted) where.push("p.is_deleted = false");
  if (!includeInactive) where.push("p.is_active = true");
  if (categoryId) {
    params.push(categoryId);
    where.push(`p.category_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(
      `(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.barcode ILIKE $${params.length})`,
    );
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  params.push(limit, offset);
  const { rows } = await client.query(
    `SELECT p.product_id, p.sku, p.name, p.description,
            p.category_id, pc.name AS category_name,
            p.cost_price, p.selling_price, p.min_selling_price, p.currency,
            p.weight_grams, p.barcode, p.custom_fields,
            p.reorder_level, p.reorder_quantity,
            p.is_active, p.is_deleted,
            p.created_at, p.updated_at,
            pi.document_id AS primary_image_document_id -- NEW: Fetch primary image ID
     FROM products p
     LEFT JOIN product_categories pc ON pc.category_id = p.category_id
     LEFT JOIN product_images pi ON pi.product_id = p.product_id AND pi.is_primary = true -- NEW: Join images
     ${whereClause}
     ORDER BY p.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

async function findProductById(client, productId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT p.*,
            pc.name              AS category_name,
            coa_i.account_name   AS income_account_name,
            coa_inv.account_name AS inventory_account_name,
            coa_c.account_name   AS cogs_account_name,
            pi.document_id       AS primary_image_document_id -- NEW: Fetch primary image ID
     FROM products p
     LEFT JOIN product_categories pc     ON pc.category_id    = p.category_id
     LEFT JOIN chart_of_accounts coa_i   ON coa_i.account_id   = p.income_account_id
     LEFT JOIN chart_of_accounts coa_inv ON coa_inv.account_id  = p.inventory_account_id
     LEFT JOIN chart_of_accounts coa_c   ON coa_c.account_id   = p.cogs_account_id
     LEFT JOIN product_images pi         ON pi.product_id      = p.product_id AND pi.is_primary = true -- NEW: Join images
     WHERE p.product_id = $1`,
    [productId],
  );
  return row || null;
}

async function findProductBySku(client, sku) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT product_id, sku, is_deleted FROM products WHERE sku = $1`,
    [sku],
  );
  return row || null;
}

async function insertProduct(
  client,
  {
    sku,
    name,
    description,
    categoryId,
    costPrice,
    sellingPrice,
    minSellingPrice,
    currency,
    weightGrams,
    barcode,
    customFields,
    reorderLevel,
    reorderQuantity,
    createdBy,
  },
) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO products
       (sku, name, description, category_id,
        cost_price, selling_price, min_selling_price, currency,
        weight_grams, barcode, custom_fields,
        reorder_level, reorder_quantity, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14)
     RETURNING *`,
    [
      sku,
      name,
      description || null,
      categoryId || null,
      costPrice || 0,
      sellingPrice || 0,
      minSellingPrice || null,
      currency || "NGN",
      weightGrams || null,
      barcode || null,
      JSON.stringify(customFields || {}),
      reorderLevel || 0,
      reorderQuantity || 0,
      createdBy || null,
    ],
  );
  return row;
}

async function updateProduct(client, productId, fields) {
  // COALESCE pattern lets partial updates work without a giant
  // "do I need to update column X?" branching mess.
  const {
    rows: [row],
  } = await client.query(
    `UPDATE products SET
       name                 = COALESCE($2,  name),
       description          = COALESCE($3,  description),
       category_id          = COALESCE($4,  category_id),
       cost_price           = COALESCE($5,  cost_price),
       selling_price        = COALESCE($6,  selling_price),
       min_selling_price    = COALESCE($7,  min_selling_price),
       currency             = COALESCE($8,  currency),
       weight_grams         = COALESCE($9,  weight_grams),
       barcode              = COALESCE($10, barcode),
       custom_fields        = COALESCE($11::jsonb, custom_fields),
       reorder_level        = COALESCE($12, reorder_level),
       reorder_quantity     = COALESCE($13, reorder_quantity),
       is_active            = COALESCE($14, is_active),
       income_account_id    = COALESCE($15, income_account_id),
       inventory_account_id = COALESCE($16, inventory_account_id),
       cogs_account_id      = COALESCE($17, cogs_account_id)
     WHERE product_id = $1 AND is_deleted = false
     RETURNING *`,
    [
      productId,
      fields.name ?? null,
      fields.description ?? null,
      fields.categoryId ?? null,
      fields.costPrice ?? null,
      fields.sellingPrice ?? null,
      fields.minSellingPrice ?? null,
      fields.currency ?? null,
      fields.weightGrams ?? null,
      fields.barcode ?? null,
      fields.customFields ? JSON.stringify(fields.customFields) : null,
      fields.reorderLevel ?? null,
      fields.reorderQuantity ?? null,
      fields.isActive ?? null,
      fields.incomeAccountId ?? null,
      fields.inventoryAccountId ?? null,
      fields.cogsAccountId ?? null,
    ],
  );
  return row || null;
}

async function softDeleteProduct(client, productId) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE products
     SET is_deleted = true, is_active = false, deleted_at = now()
     WHERE product_id = $1 AND is_deleted = false
     RETURNING product_id, sku, deleted_at`,
    [productId],
  );
  return row || null;
}

async function restoreProduct(client, productId) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE products
     SET is_deleted = false, is_active = true, deleted_at = NULL
     WHERE product_id = $1 AND is_deleted = true
     RETURNING product_id, sku`,
    [productId],
  );
  return row || null;
}

async function hasStockMovements(client, productId) {
  // Used by the soft-delete service-layer guard — refuse hard-delete
  // (or warn on soft-delete) of a product that has any stock history.
  const {
    rows: [row],
  } = await client.query(
    `SELECT EXISTS(
       SELECT 1 FROM stock_movements WHERE product_id = $1 LIMIT 1
     ) AS has_movements`,
    [productId],
  );
  return row.has_movements;
}

// ── STOCK LOCATIONS ──────────────────────────────────────────

async function listLocations(client, { includeInactive = false } = {}) {
  const filter = includeInactive ? "" : "WHERE is_active = true";
  const { rows } = await client.query(
    `SELECT location_id, name, location_type, partner_id, address,
            is_active, created_at, updated_at
     FROM stock_locations
     ${filter}
     ORDER BY location_type, name`,
  );
  return rows;
}

async function findLocationById(client, locationId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM stock_locations WHERE location_id = $1`,
    [locationId],
  );
  return row || null;
}

async function insertLocation(
  client,
  { name, locationType, partnerId, address },
) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO stock_locations (name, location_type, partner_id, address)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, locationType, partnerId || null, address || null],
  );
  return row;
}

async function updateLocation(client, locationId, { name, address, isActive }) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE stock_locations SET
       name      = COALESCE($2, name),
       address   = COALESCE($3, address),
       is_active = COALESCE($4, is_active)
     WHERE location_id = $1
     RETURNING *`,
    [locationId, name ?? null, address ?? null, isActive ?? null],
  );
  return row || null;
}

async function hasLocationMovements(client, locationId) {
  // Refuse hard-delete of a location that has stock history.
  const {
    rows: [row],
  } = await client.query(
    `SELECT EXISTS(
       SELECT 1 FROM stock_movements
       WHERE from_location_id = $1 OR to_location_id = $1
       LIMIT 1
     ) AS has_movements`,
    [locationId],
  );
  return row.has_movements;
}

async function softDeleteLocation(client, locationId) {
  const { rowCount } = await client.query(
    `UPDATE stock_locations SET is_active = false WHERE location_id = $1`,
    [locationId],
  );
  return rowCount > 0;
}

// ── PRODUCT IMAGES ───────────────────────────────────────────

async function listProductImages(client, productId) {
  const { rows } = await client.query(
    `SELECT pi.image_id, pi.product_id, pi.document_id, pi.is_primary,
            pi.display_order, pi.alt_text, pi.created_at,
            d.title AS original_filename, d.mime_type, d.file_size_bytes,
            d.file_path, d.content_hash
     FROM product_images pi
     JOIN shared.documents d ON d.document_id = pi.document_id
     WHERE pi.product_id = $1
     ORDER BY pi.is_primary DESC, pi.display_order, pi.created_at`,
    [productId],
  );
  return rows;
}

async function insertProductImage(
  client,
  { productId, documentId, isPrimary, displayOrder, altText },
) {
  // Caller has already uploaded to shared.documents and got a
  // document_id back; we just pivot here.
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO product_images
       (product_id, document_id, is_primary, display_order, alt_text)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [productId, documentId, !!isPrimary, displayOrder || 0, altText || null],
  );
  return row;
}

async function clearOtherPrimaries(client, productId, exceptImageId) {
  // When marking one image primary, demote any existing primaries
  // on the same product. Run inside the same transaction.
  await client.query(
    `UPDATE product_images
     SET is_primary = false
     WHERE product_id = $1 AND image_id != $2 AND is_primary = true`,
    [productId, exceptImageId],
  );
}

async function setImagePrimary(client, imageId) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE product_images SET is_primary = true
     WHERE image_id = $1
     RETURNING image_id, product_id`,
    [imageId],
  );
  return row || null;
}

async function reorderImage(client, imageId, displayOrder) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE product_images SET display_order = $2
     WHERE image_id = $1
     RETURNING *`,
    [imageId, displayOrder],
  );
  return row || null;
}

async function deleteProductImage(client, imageId) {
  // Hard delete here — the underlying shared.documents row keeps
  // the file. Caller can choose to also delete the document if no
  // other product_images reference it.
  const {
    rows: [row],
  } = await client.query(
    `DELETE FROM product_images
     WHERE image_id = $1
     RETURNING product_id, document_id`,
    [imageId],
  );
  return row || null;
}

async function countImageReferencesToDocument(client, documentId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT COUNT(*)::int AS n FROM product_images WHERE document_id = $1`,
    [documentId],
  );
  return row.n;
}

// ── PRODUCT-SUPPLIER LINKS ───────────────────────────────────

async function listProductSuppliers(client, productId) {
  const { rows } = await client.query(
    `SELECT ps.product_id, ps.supplier_id, ps.supplier_sku,
            ps.unit_cost, ps.lead_time_days, ps.is_preferred,
            ps.created_at,
            c.display_name AS supplier_name
     FROM product_suppliers ps
     JOIN suppliers s ON s.supplier_id = ps.supplier_id
     JOIN shared.contacts c ON c.contact_id = s.contact_id
     WHERE ps.product_id = $1
     ORDER BY ps.is_preferred DESC, c.display_name`,
    [productId],
  );
  return rows;
}

async function upsertProductSupplier(
  client,
  { productId, supplierId, supplierSku, unitCost, leadTimeDays, isPreferred },
) {
  // (product_id, supplier_id) is the PK in the schema. Use UPSERT
  // so the same endpoint handles both "link" and "update terms".
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO product_suppliers
       (product_id, supplier_id, supplier_sku, unit_cost, lead_time_days, is_preferred)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (product_id, supplier_id)
     DO UPDATE SET
       supplier_sku   = EXCLUDED.supplier_sku,
       unit_cost      = EXCLUDED.unit_cost,
       lead_time_days = EXCLUDED.lead_time_days,
       is_preferred   = EXCLUDED.is_preferred
     RETURNING *`,
    [
      productId,
      supplierId,
      supplierSku || null,
      unitCost ?? null,
      leadTimeDays ?? null,
      !!isPreferred,
    ],
  );
  return row;
}

async function clearOtherPreferredSuppliers(
  client,
  productId,
  exceptSupplierId,
) {
  // Only one preferred supplier per product — mirror the primary-
  // image pattern.
  await client.query(
    `UPDATE product_suppliers
     SET is_preferred = false
     WHERE product_id = $1 AND supplier_id != $2 AND is_preferred = true`,
    [productId, exceptSupplierId],
  );
}

async function removeProductSupplier(client, productId, supplierId) {
  const { rowCount } = await client.query(
    `DELETE FROM product_suppliers
     WHERE product_id = $1 AND supplier_id = $2`,
    [productId, supplierId],
  );
  return rowCount > 0;
}

// ── BARCODES ─────────────────────────────────────────────────

async function listProductBarcodes(client, productId) {
  const { rows } = await client.query(
    `SELECT barcode_id, barcode_value, barcode_type, is_primary, created_at
     FROM barcodes
     WHERE product_id = $1
     ORDER BY is_primary DESC, created_at`,
    [productId],
  );
  return rows;
}

async function findProductByBarcode(client, barcodeValue) {
  // Used by POS scan and customer-facing barcode-lookup flows.
  // Checks both the dedicated barcodes table AND the legacy
  // products.barcode column so legacy data isn't orphaned.
  const {
    rows: [row],
  } = await client.query(
    `SELECT p.product_id, p.sku, p.name, p.selling_price, p.currency,
            p.is_active, p.is_deleted
     FROM products p
     LEFT JOIN barcodes b ON b.product_id = p.product_id
     WHERE (b.barcode_value = $1 OR p.barcode = $1)
       AND p.is_deleted = false
     LIMIT 1`,
    [barcodeValue],
  );
  return row || null;
}

async function insertBarcode(
  client,
  { productId, barcodeValue, barcodeType, isPrimary },
) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO barcodes (product_id, barcode_value, barcode_type, is_primary)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [productId, barcodeValue, barcodeType || "CODE128", !!isPrimary],
  );
  return row;
}

async function clearOtherPrimaryBarcodes(client, productId, exceptBarcodeId) {
  await client.query(
    `UPDATE barcodes
     SET is_primary = false
     WHERE product_id = $1 AND barcode_id != $2 AND is_primary = true`,
    [productId, exceptBarcodeId],
  );
}

async function deleteBarcode(client, barcodeId) {
  const {
    rows: [row],
  } = await client.query(
    `DELETE FROM barcodes WHERE barcode_id = $1
     RETURNING product_id, barcode_value, is_primary`,
    [barcodeId],
  );
  return row || null;
}

async function barcodeExists(client, barcodeValue) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT 1 FROM barcodes WHERE barcode_value = $1
     UNION SELECT 1 FROM products WHERE barcode = $1
     LIMIT 1`,
    [barcodeValue],
  );
  return !!row;
}

// ── STORE PRODUCTS (web presentation layer) ──────────────────
// Option A: a diffusers product can also have a storefront listing.
// store.products holds the web-only fields and links back to
// diffusers.products via product_id. These functions are called
// from the catalogue service when a diffusers product is created
// or edited with a `web` block.
//
// IMPORTANT: the catalogue service runs under
// withBusinessContext('diffusers'), so the search_path is
// `diffusers, shared, public`. store.products is therefore
// referenced with an explicit `store.` qualification — Postgres
// honours a schema-qualified name regardless of search_path.

async function findStoreProductByProductId(client, productId) {
  const {
    rows: [row],
  } = await client.query(`SELECT * FROM store.products WHERE product_id = $1`, [
    productId,
  ]);
  return row || null;
}

async function findStoreProductBySlug(client, slug) {
  const {
    rows: [row],
  } = await client.query(`SELECT * FROM store.products WHERE slug = $1`, [
    slug,
  ]);
  return row || null;
}

async function insertStoreProduct(client, p) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO store.products
       (product_id, slug, scent_family, format, size_ml,
        images, web_description, top_notes, heart_notes, base_notes,
        is_published)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      p.productId,
      p.slug,
      p.scentFamily,
      p.format,
      p.sizeMl,
      p.images || [],
      p.webDescription || null,
      p.topNotes || [],
      p.heartNotes || [],
      p.baseNotes || [],
      p.isPublished !== false,
    ],
  );
  return row;
}

async function updateStoreProductByProductId(client, productId, p) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE store.products SET
       slug            = COALESCE($2,  slug),
       scent_family    = COALESCE($3,  scent_family),
       format          = COALESCE($4,  format),
       size_ml         = COALESCE($5,  size_ml),
       images          = COALESCE($6,  images),
       web_description = COALESCE($7,  web_description),
       top_notes       = COALESCE($8,  top_notes),
       heart_notes     = COALESCE($9,  heart_notes),
       base_notes      = COALESCE($10, base_notes),
       is_published    = COALESCE($11, is_published)
     WHERE product_id = $1
     RETURNING *`,
    [
      productId,
      p.slug ?? null,
      p.scentFamily ?? null,
      p.format ?? null,
      p.sizeMl ?? null,
      p.images ?? null,
      p.webDescription ?? null,
      p.topNotes ?? null,
      p.heartNotes ?? null,
      p.baseNotes ?? null,
      p.isPublished ?? null,
    ],
  );
  return row || null;
}

module.exports = {
  // categories
  listCategories,
  findCategoryById,
  insertCategory,
  updateCategory,
  countProductsInCategory,
  softDeleteCategory,
  // store products (web layer)
  findStoreProductByProductId,
  findStoreProductBySlug,
  insertStoreProduct,
  updateStoreProductByProductId,
  // products
  listProducts,
  findProductById,
  findProductBySku,
  insertProduct,
  updateProduct,
  softDeleteProduct,
  restoreProduct,
  hasStockMovements,
  // locations
  listLocations,
  findLocationById,
  insertLocation,
  updateLocation,
  hasLocationMovements,
  softDeleteLocation,
  // images
  listProductImages,
  insertProductImage,
  clearOtherPrimaries,
  setImagePrimary,
  reorderImage,
  deleteProductImage,
  countImageReferencesToDocument,
  // suppliers
  listProductSuppliers,
  upsertProductSupplier,
  clearOtherPreferredSuppliers,
  removeProductSupplier,
  // barcodes
  listProductBarcodes,
  findProductByBarcode,
  insertBarcode,
  clearOtherPrimaryBarcodes,
  deleteBarcode,
  barcodeExists,
};
