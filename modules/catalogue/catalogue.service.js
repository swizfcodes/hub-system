"use strict";

const { withBusinessContext } = require("../../config/db");
const auditService = require("../../shared/audit/audit.service");
const documentsService = require("../../shared/documents/documents.service");
const logger = require("../../config/logger");
const repo = require("./catalogue.repository");

// ─────────────────────────────────────────────────────────────
// modules/catalogue/catalogue.service
//
// Orchestration layer for the catalogue module. Six logical groups:
//   1. Categories — taxonomy
//   2. Products   — master catalogue, soft-delete only
//   3. Locations  — warehouses / showrooms / pos / partners
//   4. Images     — pivots to shared.documents
//   5. Suppliers  — per-product cost catalogue per supplier
//   6. Barcodes   — auto-generated primary, optional manual extras
//
// Each group has its own audit log entries so the audit feed reads
// like a story rather than a wall of "edit / edit / edit". Custom
// guards (e.g. refuse to soft-delete a category that has products)
// live in this layer, not the repository.
// ─────────────────────────────────────────────────────────────

// ── CATEGORIES ───────────────────────────────────────────────

async function listCategories(business, query, user) {
  return withBusinessContext(business, async (client) => {
    const rows = await repo.listCategories(client, {
      includeInactive: query.include_inactive === "true",
    });
    return { data: rows };
  });
}

async function getCategory(business, categoryId) {
  return withBusinessContext(business, async (client) => {
    const row = await repo.findCategoryById(client, categoryId);
    if (!row) {
      throw Object.assign(new Error("Category not found"), { status: 404 });
    }
    return row;
  });
}

async function createCategory(business, data, user) {
  if (!data.name) {
    throw Object.assign(new Error("name is required"), { status: 400 });
  }
  return withBusinessContext(business, async (client) => {
    const row = await repo.insertCategory(client, {
      name: data.name,
      parentCategoryId: data.parent_category_id,
      description: data.description,
      displayOrder: data.display_order,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "catalogue",
      action: "create",
      table: "product_categories",
      recordId: row.category_id,
      after: row,
    });
    return row;
  });
}

async function updateCategory(business, categoryId, data, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findCategoryById(client, categoryId);
    if (!before) {
      throw Object.assign(new Error("Category not found"), { status: 404 });
    }
    const row = await repo.updateCategory(client, categoryId, {
      name: data.name,
      parentCategoryId: data.parent_category_id,
      description: data.description,
      displayOrder: data.display_order,
      isActive: data.is_active,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "catalogue",
      action: "edit",
      table: "product_categories",
      recordId: categoryId,
      before,
      after: row,
    });
    return row;
  });
}

async function deleteCategory(business, categoryId, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findCategoryById(client, categoryId);
    if (!before) {
      throw Object.assign(new Error("Category not found"), { status: 404 });
    }
    // Refuse if any non-deleted products still reference this category.
    // Forcing the admin to reassign first is much safer than silently
    // orphaning every product into "uncategorised".
    const n = await repo.countProductsInCategory(client, categoryId);
    if (n > 0) {
      throw Object.assign(
        new Error(
          `Cannot delete category "${before.name}" — ${n} product(s) ` +
            `still reference it. Reassign them first.`,
        ),
        { status: 400 },
      );
    }
    await repo.softDeleteCategory(client, categoryId);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "catalogue",
      action: "delete",
      table: "product_categories",
      recordId: categoryId,
      before,
    });
    return { deleted: true };
  });
}

// ── PRODUCTS ─────────────────────────────────────────────────

async function listProducts(business, query, user) {
  return withBusinessContext(business, async (client) => {
    const rows = await repo.listProducts(client, {
      search: query.search,
      categoryId: query.category_id,
      includeInactive: query.include_inactive === "true",
      includeDeleted: query.include_deleted === "true",
      page: query.page,
      limit: query.limit,
    });
    return { data: rows };
  });
}

async function getProduct(business, productId) {
  return withBusinessContext(business, async (client) => {
    const product = await repo.findProductById(client, productId);
    if (!product) {
      throw Object.assign(new Error("Product not found"), { status: 404 });
    }
    // Attach related collections so the UI's "product detail" screen
    // doesn't need to fan out into 4 separate calls. Cheap because
    // they're all small fetches keyed by product_id.
    const [images, suppliers, barcodes, storeProduct] = await Promise.all([
      repo.listProductImages(client, productId),
      repo.listProductSuppliers(client, productId),
      repo.listProductBarcodes(client, productId),
      // The storefront face, if this product is published to the web.
      // null for jewelry products and unpublished diffusers products.
      repo.findStoreProductByProductId(client, productId),
    ]);
    return {
      ...product,
      images,
      suppliers,
      barcodes,
      store_product: storeProduct,
    };
  });
}

/**
 * Generate an internal CODE128-compatible barcode value. Format:
 *   {BIZ}-{SKU-FRAGMENT}-{NANO}
 * where:
 *   BIZ          = 3-char uppercase business prefix
 *   SKU-FRAGMENT = up to 8 chars of the SKU, stripped of non-alphanum
 *   NANO         = 6 random base36 chars
 *
 * CODE128 accepts any ASCII so this is safe to print on any thermal
 * label printer or shelf tag. Total length stays under 24 chars to
 * fit the scanning windows of cheap USB barcode guns.
 */
function generateBarcodeValue(business, sku) {
  const bizPrefix = business.slice(0, 3).toUpperCase();
  const skuFrag = (sku || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  const nano = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${bizPrefix}-${skuFrag || "PRD"}-${nano}`;
}

// ── STOREFRONT (web) PRODUCT FACE — Option A ─────────────────
// A diffusers product can carry a `web` block. When present, the
// same transaction that creates/updates the diffusers.products SKU
// also creates/updates a store.products row (the web presentation
// layer) linked by product_id. One upload → both faces.
//
// store.products holds price NOWHERE — the storefront resolves
// price from diffusers.products.selling_price and stock from
// stock_movements. So the web block is purely presentation:
// slug, scent_family, format, size_ml, images, fragrance notes.

const STORE_BUSINESS = "diffusers";
const SCENT_FAMILIES = [
  "Fresh & Marine",
  "Citrus & Green",
  "Oud & Floral",
  "Spice & Amber",
  "Woody & Deep",
  "Floral & Musk",
];
const PRODUCT_FORMATS = [
  "Grand Edition",
  "Signature Edition",
  "Curated Gift Set",
  "Car Diffuser",
];

/**
 * Validate a `web` block from a create/update request. Throws a
 * 400 on any problem. `requireAll` is true for create (every
 * mandatory web field must be present) and false for update
 * (partial edits allowed).
 */
function validateWebBlock(business, web, { requireAll }) {
  // The web block only makes sense for the storefront business.
  // A `web` block on a jewelry product is a mistake — reject it
  // rather than silently writing an orphan store.products row.
  if (business !== STORE_BUSINESS) {
    throw Object.assign(
      new Error(
        `A 'web' block is only valid for the ${STORE_BUSINESS} business — ` +
          `'${business}' products have no storefront listing.`,
      ),
      { status: 400 },
    );
  }
  if (requireAll) {
    for (const f of ["slug", "scent_family", "format", "size_ml"]) {
      if (web[f] === undefined || web[f] === null || web[f] === "") {
        throw Object.assign(
          new Error(`web.${f} is required to publish a product to the store`),
          { status: 400 },
        );
      }
    }
  }
  if (
    web.scent_family !== undefined &&
    !SCENT_FAMILIES.includes(web.scent_family)
  ) {
    throw Object.assign(
      new Error(
        `web.scent_family must be one of: ${SCENT_FAMILIES.join(", ")}`,
      ),
      { status: 400 },
    );
  }
  if (web.format !== undefined && !PRODUCT_FORMATS.includes(web.format)) {
    throw Object.assign(
      new Error(`web.format must be one of: ${PRODUCT_FORMATS.join(", ")}`),
      { status: 400 },
    );
  }
  if (
    web.size_ml !== undefined &&
    (!Number.isInteger(web.size_ml) || web.size_ml <= 0)
  ) {
    throw Object.assign(new Error("web.size_ml must be a positive integer"), {
      status: 400,
    });
  }
}

async function createProduct(business, data, user) {
  if (!data.sku || !data.name) {
    throw Object.assign(new Error("sku and name are required"), {
      status: 400,
    });
  }
  // If a web block is supplied, validate it up-front (all mandatory
  // web fields required on create) before opening the transaction.
  if (data.web) {
    validateWebBlock(business, data.web, { requireAll: true });
  }
  return withBusinessContext(business, async (client) => {
    // SKU uniqueness — catch the duplicate before the DB does so we
    // can produce a friendlier error than "duplicate key value".
    // The check covers soft-deleted rows too — reusing a deleted SKU
    // is allowed only via explicit restore.
    const dupe = await repo.findProductBySku(client, data.sku);
    if (dupe) {
      throw Object.assign(
        new Error(
          dupe.is_deleted
            ? `SKU "${data.sku}" was previously deleted. Restore that product instead of creating a new one.`
            : `SKU "${data.sku}" already exists`,
        ),
        { status: 409 },
      );
    }

    // Auto-generate the primary barcode value upfront. We retry up to
    // 3 times in the extremely unlikely event of a collision (with
    // ~60 million combinations per SKU prefix, real-world collision
    // probability is ~zero — but the loop is cheap insurance).
    let barcodeValue = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = generateBarcodeValue(business, data.sku);
      if (!(await repo.barcodeExists(client, candidate))) {
        barcodeValue = candidate;
        break;
      }
    }
    if (!barcodeValue) {
      throw new Error("Could not generate a unique barcode after 3 attempts");
    }

    // Insert product with the barcode also stored in the legacy
    // products.barcode column so POS scan continues to find it via
    // that column too (POS service queries both during transition).
    const product = await repo.insertProduct(client, {
      sku: data.sku,
      name: data.name,
      description: data.description,
      categoryId: data.category_id,
      costPrice: data.cost_price,
      sellingPrice: data.selling_price,
      minSellingPrice: data.min_selling_price,
      currency: data.currency,
      weightGrams: data.weight_grams,
      barcode: barcodeValue,
      customFields: data.custom_fields,
      reorderLevel: data.reorder_level,
      reorderQuantity: data.reorder_quantity,
      createdBy: user.user_id,
    });

    // Also register the barcode in the dedicated barcodes table so
    // multi-barcode workflows work later (admin can add EAN13/UPC
    // codes alongside the auto-generated CODE128).
    const barcode = await repo.insertBarcode(client, {
      productId: product.product_id,
      barcodeValue,
      barcodeType: "CODE128",
      isPrimary: true,
    });

    // Option A: if a web block was supplied, create the storefront
    // listing in the SAME transaction. The slug must be unique across
    // store.products — check first for a friendly error.
    let storeProduct = null;
    if (data.web) {
      const slugDupe = await repo.findStoreProductBySlug(client, data.web.slug);
      if (slugDupe) {
        throw Object.assign(
          new Error(`Storefront slug "${data.web.slug}" is already in use`),
          { status: 409 },
        );
      }
      storeProduct = await repo.insertStoreProduct(client, {
        productId: product.product_id,
        slug: data.web.slug,
        scentFamily: data.web.scent_family,
        format: data.web.format,
        sizeMl: data.web.size_ml,
        images: data.web.images,
        webDescription: data.web.web_description,
        topNotes: data.web.top_notes,
        heartNotes: data.web.heart_notes,
        baseNotes: data.web.base_notes,
        isPublished: data.web.is_published,
      });
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "catalogue",
      action: "create",
      table: "products",
      recordId: product.product_id,
      after: {
        ...product,
        primary_barcode: barcode.barcode_value,
        published_to_store: !!storeProduct,
      },
    });

    return {
      ...product,
      primary_barcode: barcode,
      store_product: storeProduct,
    };
  });
}

async function updateProduct(business, productId, data, user) {
  // Validate the web block (partial allowed on update) before the txn.
  if (data.web) {
    validateWebBlock(business, data.web, { requireAll: false });
  }
  return withBusinessContext(business, async (client) => {
    const before = await repo.findProductById(client, productId);
    if (!before || before.is_deleted) {
      throw Object.assign(new Error("Product not found"), { status: 404 });
    }
    const row = await repo.updateProduct(client, productId, {
      name: data.name,
      description: data.description,
      categoryId: data.category_id,
      costPrice: data.cost_price,
      sellingPrice: data.selling_price,
      minSellingPrice: data.min_selling_price,
      currency: data.currency,
      weightGrams: data.weight_grams,
      barcode: data.barcode,
      customFields: data.custom_fields,
      reorderLevel: data.reorder_level,
      reorderQuantity: data.reorder_quantity,
      isActive: data.is_active,
    });

    // Option A: sync the storefront face. If the product already has
    // a store.products row, update it. If it doesn't and a complete
    // web block is supplied, create one (publishing an existing
    // product to the store). A partial web block on an unpublished
    // product is rejected — you can't half-publish.
    let storeProduct = null;
    if (data.web) {
      const existing = await repo.findStoreProductByProductId(
        client,
        productId,
      );
      if (existing) {
        // Slug change must stay unique.
        if (data.web.slug && data.web.slug !== existing.slug) {
          const slugDupe = await repo.findStoreProductBySlug(
            client,
            data.web.slug,
          );
          if (slugDupe) {
            throw Object.assign(
              new Error(`Storefront slug "${data.web.slug}" is already in use`),
              { status: 409 },
            );
          }
        }
        storeProduct = await repo.updateStoreProductByProductId(
          client,
          productId,
          {
            slug: data.web.slug,
            scentFamily: data.web.scent_family,
            format: data.web.format,
            sizeMl: data.web.size_ml,
            images: data.web.images,
            webDescription: data.web.web_description,
            topNotes: data.web.top_notes,
            heartNotes: data.web.heart_notes,
            baseNotes: data.web.base_notes,
            isPublished: data.web.is_published,
          },
        );
      } else {
        // No storefront row yet — this is a "publish to store" action.
        // Require the full web block, same as create.
        validateWebBlock(business, data.web, { requireAll: true });
        const slugDupe = await repo.findStoreProductBySlug(
          client,
          data.web.slug,
        );
        if (slugDupe) {
          throw Object.assign(
            new Error(`Storefront slug "${data.web.slug}" is already in use`),
            { status: 409 },
          );
        }
        storeProduct = await repo.insertStoreProduct(client, {
          productId,
          slug: data.web.slug,
          scentFamily: data.web.scent_family,
          format: data.web.format,
          sizeMl: data.web.size_ml,
          images: data.web.images,
          webDescription: data.web.web_description,
          topNotes: data.web.top_notes,
          heartNotes: data.web.heart_notes,
          baseNotes: data.web.base_notes,
          isPublished: data.web.is_published,
        });
      }
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "catalogue",
      action: "edit",
      table: "products",
      recordId: productId,
      before,
      after: row,
    });
    return { ...row, store_product: storeProduct };
  });
}

async function deleteProduct(business, productId, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findProductById(client, productId);
    if (!before) {
      throw Object.assign(new Error("Product not found"), { status: 404 });
    }
    if (before.is_deleted) {
      throw Object.assign(new Error("Product is already deleted"), {
        status: 400,
      });
    }
    // Soft delete is always safe for products — even with stock
    // movements, marking is_deleted=true preserves the historical
    // line items while hiding the product from new operations.
    const result = await repo.softDeleteProduct(client, productId);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "catalogue",
      action: "delete",
      table: "products",
      recordId: productId,
      before,
    });
    return result;
  });
}

async function restoreProduct(business, productId, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findProductById(client, productId);
    if (!before || !before.is_deleted) {
      throw Object.assign(new Error("Product is not in a deleted state"), {
        status: 400,
      });
    }
    const row = await repo.restoreProduct(client, productId);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "catalogue",
      action: "edit",
      table: "products",
      recordId: productId,
      before: { is_deleted: true },
      after: { is_deleted: false },
      metadata: { restored: true },
    });
    return row;
  });
}

// ── STOCK LOCATIONS ──────────────────────────────────────────

const VALID_LOCATION_TYPES = [
  "warehouse",
  "showroom",
  "pos_terminal",
  "retail_partner",
  "transit",
];

async function listLocations(business, query) {
  return withBusinessContext(business, async (client) => {
    const rows = await repo.listLocations(client, {
      includeInactive: query.include_inactive === "true",
    });
    return { data: rows };
  });
}

async function createLocation(business, data, user) {
  if (!data.name) {
    throw Object.assign(new Error("name is required"), { status: 400 });
  }
  if (!VALID_LOCATION_TYPES.includes(data.location_type)) {
    throw Object.assign(
      new Error(
        `location_type must be one of: ${VALID_LOCATION_TYPES.join(", ")}`,
      ),
      { status: 400 },
    );
  }
  return withBusinessContext(business, async (client) => {
    const row = await repo.insertLocation(client, {
      name: data.name,
      locationType: data.location_type,
      partnerId: data.partner_id,
      address: data.address,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "catalogue",
      action: "create",
      table: "stock_locations",
      recordId: row.location_id,
      after: row,
    });
    return row;
  });
}

async function updateLocation(business, locationId, data, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findLocationById(client, locationId);
    if (!before) {
      throw Object.assign(new Error("Location not found"), { status: 404 });
    }
    const row = await repo.updateLocation(client, locationId, {
      name: data.name,
      address: data.address,
      isActive: data.is_active,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "catalogue",
      action: "edit",
      table: "stock_locations",
      recordId: locationId,
      before,
      after: row,
    });
    return row;
  });
}

async function deleteLocation(business, locationId, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findLocationById(client, locationId);
    if (!before) {
      throw Object.assign(new Error("Location not found"), { status: 404 });
    }
    // If any stock has ever moved through this location, soft delete
    // (set is_active=false) so historical movements still resolve.
    // If pristine, hard delete is fine.
    const hasHistory = await repo.hasLocationMovements(client, locationId);
    if (hasHistory) {
      await repo.softDeleteLocation(client, locationId);
    } else {
      await repo.softDeleteLocation(client, locationId);
      // Both branches end up the same way today — we always soft-delete
      // — but the check stays as documentation of the intent and a
      // hook for a future hard-delete path if you ever want it.
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "catalogue",
      action: "delete",
      table: "stock_locations",
      recordId: locationId,
      before,
    });
    return { deleted: true };
  });
}

// ── PRODUCT IMAGES ───────────────────────────────────────────

async function listProductImages(business, productId) {
  return withBusinessContext(business, async (client) => {
    const product = await repo.findProductById(client, productId);
    if (!product) {
      throw Object.assign(new Error("Product not found"), { status: 404 });
    }
    return { data: await repo.listProductImages(client, productId) };
  });
}

async function uploadProductImage(
  business,
  productId,
  { buffer, originalFilename, mimeType, altText, isPrimary, displayOrder },
  user,
) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw Object.assign(new Error("Image buffer is required"), { status: 400 });
  }
  if (!mimeType || !mimeType.startsWith("image/")) {
    throw Object.assign(new Error("File must be an image"), { status: 400 });
  }

  return withBusinessContext(business, async (client) => {
    const product = await repo.findProductById(client, productId);
    if (!product || product.is_deleted) {
      throw Object.assign(new Error("Product not found"), { status: 404 });
    }

    // Route the file through the canonical documents pipeline so it
    // benefits from SHA-256 hashing, dedupe, and storage abstraction
    // (local vs S3 driven by STORAGE_DRIVER). Returns a document_id
    // we then pivot to product_images.
    const doc = await documentsService.uploadDocument(
      {
        business,
        buffer,
        originalFilename,
        mimeType,
        documentType: "product_image",
        referenceType: "product",
        referenceId: productId,
      },
      user,
    );

    const image = await repo.insertProductImage(client, {
      productId,
      documentId: doc.document_id,
      isPrimary: !!isPrimary,
      displayOrder: displayOrder || 0,
      altText: altText || product.name,
    });

    // If marked primary, demote any existing primaries on the same
    // product. Same transaction → no window where two images claim
    // primary at once.
    if (isPrimary) {
      await repo.clearOtherPrimaries(client, productId, image.image_id);
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "catalogue",
      action: "create",
      table: "product_images",
      recordId: image.image_id,
      after: { product_id: productId, document_id: doc.document_id },
    });

    return image;
  });
}

async function setPrimaryImage(business, imageId, user) {
  return withBusinessContext(business, async (client) => {
    const row = await repo.setImagePrimary(client, imageId);
    if (!row) {
      throw Object.assign(new Error("Image not found"), { status: 404 });
    }
    await repo.clearOtherPrimaries(client, row.product_id, imageId);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "catalogue",
      action: "edit",
      table: "product_images",
      recordId: imageId,
      after: { is_primary: true },
    });
    return row;
  });
}

async function reorderImage(business, imageId, displayOrder, user) {
  return withBusinessContext(business, async (client) => {
    const row = await repo.reorderImage(client, imageId, displayOrder);
    if (!row) {
      throw Object.assign(new Error("Image not found"), { status: 404 });
    }
    return row;
  });
}

async function deleteProductImage(business, imageId, user) {
  return withBusinessContext(business, async (client) => {
    const removed = await repo.deleteProductImage(client, imageId);
    if (!removed) {
      throw Object.assign(new Error("Image not found"), { status: 404 });
    }
    // If no other product_images row still references the underlying
    // shared.documents row, it's safe to drop the document too —
    // otherwise we'd accumulate orphan files in storage.
    const remaining = await repo.countImageReferencesToDocument(
      client,
      removed.document_id,
    );
    if (remaining === 0) {
      try {
        await documentsService.deleteDocument(removed.document_id, user);
      } catch (err) {
        // Document deletion is best-effort — losing it leaves an
        // orphan but doesn't break the image-delete contract.
        logger.warn(
          `[catalogue] orphan document ${removed.document_id} could not be deleted: ${err.message}`,
        );
      }
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "catalogue",
      action: "delete",
      table: "product_images",
      recordId: imageId,
      before: removed,
    });
    return { deleted: true };
  });
}

// ── PRODUCT SUPPLIERS ────────────────────────────────────────

async function listProductSuppliers(business, productId) {
  return withBusinessContext(business, async (client) => {
    const product = await repo.findProductById(client, productId);
    if (!product) {
      throw Object.assign(new Error("Product not found"), { status: 404 });
    }
    return { data: await repo.listProductSuppliers(client, productId) };
  });
}

async function linkSupplier(business, productId, data, user) {
  if (!data.supplier_id) {
    throw Object.assign(new Error("supplier_id is required"), { status: 400 });
  }
  return withBusinessContext(business, async (client) => {
    const product = await repo.findProductById(client, productId);
    if (!product || product.is_deleted) {
      throw Object.assign(new Error("Product not found"), { status: 404 });
    }
    const row = await repo.upsertProductSupplier(client, {
      productId,
      supplierId: data.supplier_id,
      supplierSku: data.supplier_sku,
      unitCost: data.unit_cost,
      leadTimeDays: data.lead_time_days,
      isPreferred: !!data.is_preferred,
    });
    if (data.is_preferred) {
      await repo.clearOtherPreferredSuppliers(
        client,
        productId,
        data.supplier_id,
      );
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "catalogue",
      action: "edit",
      table: "product_suppliers",
      recordId: productId,
      after: row,
    });
    return row;
  });
}

async function unlinkSupplier(business, productId, supplierId, user) {
  return withBusinessContext(business, async (client) => {
    const removed = await repo.removeProductSupplier(
      client,
      productId,
      supplierId,
    );
    if (!removed) {
      throw Object.assign(
        new Error("Supplier was not linked to this product"),
        { status: 404 },
      );
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "catalogue",
      action: "delete",
      table: "product_suppliers",
      recordId: productId,
      before: { supplier_id: supplierId },
    });
    return { deleted: true };
  });
}

// ── BARCODES ─────────────────────────────────────────────────

async function listBarcodes(business, productId) {
  return withBusinessContext(business, async (client) => {
    const product = await repo.findProductById(client, productId);
    if (!product) {
      throw Object.assign(new Error("Product not found"), { status: 404 });
    }
    return { data: await repo.listProductBarcodes(client, productId) };
  });
}

async function lookupBarcode(business, barcodeValue) {
  return withBusinessContext(business, async (client) => {
    const product = await repo.findProductByBarcode(client, barcodeValue);
    if (!product || !product.is_active) {
      throw Object.assign(new Error("No active product for this barcode"), {
        status: 404,
      });
    }
    return product;
  });
}

async function addBarcode(business, productId, data, user) {
  if (!data.barcode_value) {
    throw Object.assign(new Error("barcode_value is required"), {
      status: 400,
    });
  }
  return withBusinessContext(business, async (client) => {
    const product = await repo.findProductById(client, productId);
    if (!product || product.is_deleted) {
      throw Object.assign(new Error("Product not found"), { status: 404 });
    }
    // Block duplicates — a barcode must uniquely resolve to one product.
    if (await repo.barcodeExists(client, data.barcode_value)) {
      throw Object.assign(
        new Error(
          `Barcode "${data.barcode_value}" already exists on another product`,
        ),
        { status: 409 },
      );
    }
    const row = await repo.insertBarcode(client, {
      productId,
      barcodeValue: data.barcode_value,
      barcodeType: data.barcode_type || "CODE128",
      isPrimary: !!data.is_primary,
    });
    if (data.is_primary) {
      await repo.clearOtherPrimaryBarcodes(client, productId, row.barcode_id);
      // Also update the legacy products.barcode column so POS scan
      // by that column stays consistent.
      await client.query(
        `UPDATE products SET barcode = $1 WHERE product_id = $2`,
        [data.barcode_value, productId],
      );
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "catalogue",
      action: "create",
      table: "barcodes",
      recordId: row.barcode_id,
      after: row,
    });
    return row;
  });
}

async function deleteBarcode(business, barcodeId, user) {
  return withBusinessContext(business, async (client) => {
    const removed = await repo.deleteBarcode(client, barcodeId);
    if (!removed) {
      throw Object.assign(new Error("Barcode not found"), { status: 404 });
    }
    if (removed.is_primary) {
      throw Object.assign(
        new Error(
          "Cannot delete the primary barcode. Set another barcode as primary first.",
        ),
        { status: 400 },
      );
    }
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "catalogue",
      action: "delete",
      table: "barcodes",
      recordId: barcodeId,
      before: removed,
    });
    return { deleted: true };
  });
}

// ── CUSTOMER-FACING SHARE URL ────────────────────────────────

/**
 * Build the canonical customer-facing URL for a product. The
 * storefront resolves /p/{sku} → product page. Admins can encode
 * this URL as a QR code (using any external tool) and print it on
 * shelf tags, packaging, or business cards so customers can scan
 * to view a product.
 *
 * Returns a URL string only. Server-side QR PNG rendering is left
 * out of this round to avoid adding a new dependency (qrcode npm).
 * If you decide later to generate the PNG server-side, this is the
 * function that becomes a wrapper around it.
 */
async function getProductShareUrl(business, productId) {
  return withBusinessContext(business, async (client) => {
    const product = await repo.findProductById(client, productId);
    if (!product || product.is_deleted) {
      throw Object.assign(new Error("Product not found"), { status: 404 });
    }
    const base =
      process.env.STOREFRONT_BASE_URL || `https://${business}.example.com`;
    return {
      product_id: product.product_id,
      sku: product.sku,
      name: product.name,
      url: `${base}/p/${product.sku}`,
    };
  });
}

module.exports = {
  // categories
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  // products
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  restoreProduct,
  getProductShareUrl,
  // locations
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  // images
  listProductImages,
  uploadProductImage,
  setPrimaryImage,
  reorderImage,
  deleteProductImage,
  // suppliers
  listProductSuppliers,
  linkSupplier,
  unlinkSupplier,
  // barcodes
  listBarcodes,
  lookupBarcode,
  addBarcode,
  deleteBarcode,
};
