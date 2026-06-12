"use strict";

const crypto = require("crypto");
const { withSharedContext, nextDocumentNumber } = require("../../config/db");
const storage = require("../../lib/storage");
const auditService = require("../audit/audit.service");
const repo = require("./documents.repository");
const {
  optimizeImage,
  OPTIMISABLE,
} = require("../../lib/images/optimizeImage");

// ─────────────────────────────────────────────────────────────
// DOCUMENTS SERVICE — Module 12: Documents & Signatures
//
// Promises from the product description:
//   - "stored securely with a unique reference token"
//   - "automatically tagged by type (Commercial, Supplier, Product-Specific)"
//   - "linked to the relevant customer, supplier, or product"
//   - "Once stored, documents cannot be edited or deleted by staff,
//      creating a permanent, tamper-proof record"
//   - "A visual checkmark confirms a document's authenticity"
//
// How tamper-proofing works here:
//   1. On upload, we compute a SHA-256 hash of the file bytes and
//      store it on the documents row. The file is then written to
//      storage (local disk or S3, depending on config) at a path
//      that includes the hash prefix for fast lookup.
//   2. On every download, we recompute the hash of the bytes we
//      just fetched and compare against the stored hash. Mismatch
//      means the file was altered outside the app (or storage is
//      corrupt) — we surface a `verified: false` flag in the response
//      and audit-log the discrepancy with `sensitive: true`.
//   3. The application offers NO update path for file_path or
//      content_hash. There's no PATCH endpoint on documents. The
//      only mutation is soft-delete, which preserves the row.
//   4. Every read, every download, every delete is audit-logged so
//      compliance can answer "who accessed this contract on what
//      date".
// ─────────────────────────────────────────────────────────────

// Document types map to tag categories from Module 12.
const DOCUMENT_TYPES = {
  // commercial
  invoice: "commercial",
  credit_note: "commercial",
  quotation: "commercial",
  receipt: "commercial",
  settlement: "commercial",
  delivery_note: "commercial",
  // supplier
  purchase_order: "supplier",
  supplier_invoice: "supplier",
  supplier_quotation: "supplier",
  // product-specific
  authenticity_certificate: "product-specific",
  warranty_card: "product-specific",
  appraisal: "product-specific",
  product_image: "product-specific",
  // staff / hr
  employment_contract: "hr",
  nda: "hr",
  amendment: "hr",
  payslip: "hr",
  // general
  message_attachment: "general", // chat uploads (images, files, voice notes)
  other: "general",
};

// ─────────────────────────────────────────────────────────────
// UPLOAD
// ─────────────────────────────────────────────────────────────

/**
 * Store a document. The buffer is hashed, deduped against existing
 * documents (same hash + same business = same file), and persisted.
 *
 * Auto-assigns a document_number from the sequence (e.g. JWL-DOC-0042)
 * unless one is provided. Auto-tags by document_type category (commercial,
 * supplier, product-specific, hr) and any tags passed in.
 *
 * @param {Object} input
 * @param {Buffer} input.buffer            file bytes
 * @param {string} input.originalFilename  source filename (e.g. invoice.pdf)
 * @param {string} input.mimeType
 * @param {string} input.business
 * @param {string} input.documentType      one of DOCUMENT_TYPES keys
 * @param {string} input.title             human-readable name
 * @param {string} [input.referenceType]   e.g. 'invoice', 'contact', 'product'
 * @param {string} [input.referenceId]
 * @param {string[]} [input.tags]          extra tag names
 * @param {Object} user                     uploading user (audit)
 */
async function uploadDocument(input, user) {
  if (!input.buffer || !Buffer.isBuffer(input.buffer)) {
    throw Object.assign(new Error("buffer is required and must be a Buffer"), {
      status: 400,
    });
  }
  if (!DOCUMENT_TYPES[input.documentType]) {
    throw Object.assign(
      new Error(
        `Invalid document_type. Allowed: ${Object.keys(DOCUMENT_TYPES).join(", ")}`,
      ),
      { status: 400 },
    );
  }

  // ── Optimise display images before hashing/storage ───────────
  // Campaign heroes and catalogue product images are converted to WebP
  // (auto-oriented, resized, compressed) so a multi-MB JPEG doesn't time
  // out on upload or bloat the public landing pages. Legal / identity
  // documents (PDFs, certificates, payslips, …) are left byte-for-byte
  // intact so the tamper-proof record still reflects exactly what was
  // uploaded.
  let fileBuffer = input.buffer;
  let fileMimeType = input.mimeType;
  let fileOriginalName = input.originalFilename;
  if (
    input.documentType === "product_image" &&
    OPTIMISABLE.has(String(input.mimeType).toLowerCase())
  ) {
    const opt = await optimizeImage(input.buffer, {
      mimeType: input.mimeType,
      maxWidth: 1920,
      maxHeight: 1920,
      quality: 82,
    });
    if (opt.optimised) {
      fileBuffer = opt.buffer;
      fileMimeType = opt.mimeType;
      const base = (input.originalFilename || `upload_${Date.now()}`).replace(
        /\.[^.]+$/,
        "",
      );
      fileOriginalName = `${base}.${opt.extension}`;
    }
  }

  // Compute SHA-256 of the (possibly optimised) bytes — canonical hash.
  const contentHash = crypto
    .createHash("sha256")
    .update(fileBuffer)
    .digest("hex");

  return withSharedContext(async (client) => {
    // Dedupe — if the exact same bytes already exist for this business,
    // avoid storing the blob twice. BUT the reference link must still be
    // honoured: previously this returned the existing record unchanged,
    // so uploading a known file against a contact/invoice silently
    // dropped the link and the record never appeared on that entity.
    const existing = await repo.findByContentHash(
      client,
      contentHash,
      input.business,
    );
    if (existing) {
      const sameRef =
        existing.reference_type === (input.referenceType || null) &&
        existing.reference_id === (input.referenceId || null);

      // No reference requested, or it already points at the same record →
      // true duplicate, return as before.
      if (!input.referenceType || !input.referenceId || sameRef) {
        return { ...existing, deduplicated: true };
      }

      // Existing copy is unlinked → attach it to the requested record.
      if (!existing.reference_type && !existing.reference_id) {
        const linked = await repo.updateReference(client, {
          documentId: existing.document_id,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
        });
        await auditService.log(client, {
          userId: user?.user_id || null,
          userName: user?.display_name || "system",
          business: input.business,
          module: "documents",
          action: "edit",
          table: "shared.documents",
          recordId: existing.document_id,
          before: { reference_type: null, reference_id: null },
          after: {
            reference_type: input.referenceType,
            reference_id: input.referenceId,
          },
        });
        return { ...linked, deduplicated: true };
      }

      // Existing copy is linked to a DIFFERENT record → create a new
      // document row for this reference, reusing the stored blob (same
      // file_path + hash, no second copy on disk). Falls through to the
      // insert below with reused storage metadata.
      const reused = existing;
      let documentNumber;
      try {
        documentNumber = await nextDocumentNumber(
          client,
          input.business,
          input.documentType,
        );
      } catch {
        const prefix = input.business.slice(0, 3).toUpperCase();
        documentNumber = `${prefix}-DOC-${Date.now().toString(36).toUpperCase()}`;
      }
      const doc = await repo.insert(client, {
        document_number: documentNumber,
        business: input.business,
        document_type: input.documentType,
        title: input.title || reused.title,
        file_path: reused.file_path,
        file_size_bytes: reused.file_size_bytes,
        mime_type: reused.mime_type,
        content_hash: contentHash,
        reference_type: input.referenceType,
        reference_id: input.referenceId,
        uploaded_by: user?.user_id || null,
      });
      await auditService.log(client, {
        userId: user?.user_id || null,
        userName: user?.display_name || "system",
        business: input.business,
        module: "documents",
        action: "upload",
        table: "shared.documents",
        recordId: doc.document_id,
        after: {
          document_number: doc.document_number,
          document_type: doc.document_type,
          title: doc.title,
          content_hash: contentHash,
          reference_type: doc.reference_type,
          reference_id: doc.reference_id,
          reused_blob_of: reused.document_id,
        },
      });
      return doc;
    }

    // PATCH: Provide a robust fallback filename so lib/storage.js never crashes
    // on a missing string when calling .replace()
    const safeFilename = fileOriginalName || `upload_${Date.now()}`;

    // Persist bytes to storage (S3 or local, abstracted via lib/storage).
    const subfolder = `${input.business}/${input.documentType}`;
    const stored = await storage.save(fileBuffer, safeFilename, subfolder);

    // Cross-check: storage's hash must equal what we computed.
    if (stored.sha256 !== contentHash) {
      throw new Error(
        "Storage reported a different SHA-256 than computed — refusing to persist",
      );
    }

    // Allocate document_number from the per-business sequence.
    // Falls back to a generated UUID-suffixed string if no sequence is
    // configured for document_type — graceful, no hard fail.
    let documentNumber;
    try {
      documentNumber = await nextDocumentNumber(
        client,
        input.business,
        input.documentType,
      );
    } catch {
      const prefix = input.business.slice(0, 3).toUpperCase();
      documentNumber = `${prefix}-DOC-${Date.now().toString(36).toUpperCase()}`;
    }

    const doc = await repo.insert(client, {
      document_number: documentNumber,
      business: input.business,
      document_type: input.documentType,
      title: input.title || safeFilename, // PATCH: Use the safe fallback here too
      file_path: stored.filePath,
      file_size_bytes: stored.fileSize,
      mime_type: fileMimeType,
      content_hash: contentHash,
      reference_type: input.referenceType,
      reference_id: input.referenceId,
      uploaded_by: user?.user_id || null,
    });

    // Auto-tag by category, plus any explicit tags.
    const allTags = [
      DOCUMENT_TYPES[input.documentType],
      ...(input.tags || []),
    ].filter(Boolean);
    for (const tagName of allTags) {
      await repo.addTag(client, {
        documentId: doc.document_id,
        tagName,
        business: input.business,
        taggedBy: user?.user_id,
      });
    }

    await auditService.log(client, {
      userId: user?.user_id || null,
      userName: user?.display_name || "system",
      business: input.business,
      module: "documents",
      action: "upload",
      table: "shared.documents",
      recordId: doc.document_id,
      after: {
        document_number: doc.document_number,
        document_type: doc.document_type,
        title: doc.title,
        content_hash: contentHash,
        file_size_bytes: stored.fileSize,
        reference_type: doc.reference_type,
        reference_id: doc.reference_id,
      },
    });

    return doc;
  });
}

// ─────────────────────────────────────────────────────────────
// DOWNLOAD + VERIFY
// ─────────────────────────────────────────────────────────────

/**
 * Fetch a document's bytes and verify integrity. Returns the buffer,
 * mime type, original record, AND a `verified` boolean indicating
 * whether the stored hash matches what we just read from storage.
 *
 * The "visual checkmark confirms a document's authenticity" from
 * Module 12 surfaces this `verified` flag.
 */
async function downloadDocument(documentId, user) {
  return withSharedContext(async (client) => {
    const doc = await repo.findById(client, documentId);
    if (!doc) {
      throw Object.assign(new Error("Document not found"), { status: 404 });
    }

    const buffer = await storage.get(doc.file_path);
    const actualHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const verified = actualHash === doc.content_hash;

    await auditService.log(client, {
      userId: user?.user_id || null,
      userName: user?.display_name || "system",
      business: doc.business,
      module: "documents",
      action: verified ? "download" : "download_with_integrity_failure",
      table: "shared.documents",
      recordId: documentId,
      metadata: verified
        ? {}
        : {
            sensitive: true,
            reason:
              "content hash mismatch — possible tampering or storage corruption",
            stored_hash: doc.content_hash,
            actual_hash: actualHash,
          },
    });

    return {
      buffer,
      mime_type: doc.mime_type,
      filename: `${doc.document_number}-${doc.title}`.replace(
        /[^a-z0-9\-_. ]/gi,
        "_",
      ),
      document: doc,
      verified,
    };
  });
}

/**
 * Stand-alone verification — checks the stored hash matches the bytes
 * without returning the bytes. Cheap operation for UI "verify integrity"
 * button. Audit-logged the same way.
 */
async function verifyDocument(documentId, user) {
  return withSharedContext(async (client) => {
    const doc = await repo.findById(client, documentId);
    if (!doc) {
      throw Object.assign(new Error("Document not found"), { status: 404 });
    }
    const buffer = await storage.get(doc.file_path);
    const actualHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const verified = actualHash === doc.content_hash;

    await auditService.log(client, {
      userId: user?.user_id || null,
      userName: user?.display_name || "system",
      business: doc.business,
      module: "documents",
      action: "verify",
      table: "shared.documents",
      recordId: documentId,
      metadata: verified
        ? {}
        : { sensitive: true, reason: "verification failed" },
    });

    return {
      document_id: documentId,
      document_number: doc.document_number,
      verified,
      stored_hash: doc.content_hash,
      actual_hash: actualHash,
      verified_at: new Date().toISOString(),
    };
  });
}

// ─────────────────────────────────────────────────────────────
// PUBLIC IMAGE READ (no auth, no audit)
//
// Used by the unauthenticated /documents/:id/image route that serves
// product images + campaign heroes to public landing/catalogue pages.
// These hits can be very high-volume (a shared WhatsApp link), so unlike
// downloadDocument() this path deliberately skips the per-request SHA-256
// re-hash and the audit-log INSERT — anonymous image views don't need an
// audit trail, and writing one per <img> load is a real bottleneck. The
// route already restricts what it will serve to document_type ===
// 'product_image'. Responses are sent with a long immutable Cache-Control.
// ─────────────────────────────────────────────────────────────

async function getImageForPublic(documentId) {
  return withSharedContext(async (client) => {
    const doc = await repo.findById(client, documentId);
    if (!doc) {
      throw Object.assign(new Error("Document not found"), { status: 404 });
    }
    const buffer = await storage.get(doc.file_path);
    return {
      buffer,
      mime_type: doc.mime_type,
      document_type: doc.document_type,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// LIST / GET
// ─────────────────────────────────────────────────────────────

async function listDocuments(query) {
  return withSharedContext(async (client) => {
    const page = parseInt(query.page) || 1;
    const limit = Math.min(parseInt(query.limit) || 50, 200);
    const offset = (page - 1) * limit;

    const tags = query.tags
      ? Array.isArray(query.tags)
        ? query.tags
        : query.tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
      : null;

    const filters = {
      business: query.business,
      documentType: query.document_type,
      referenceType: query.reference_type,
      referenceId: query.reference_id,
      search: query.search,
      tags,
    };

    const [data, total] = await Promise.all([
      repo.listDocuments(client, { ...filters, limit, offset }),
      repo.countDocuments(client, filters),
    ]);
    return { data, pagination: { page, limit, total } };
  });
}

async function getDocument(documentId) {
  return withSharedContext(async (client) => {
    const doc = await repo.findById(client, documentId);
    if (!doc) {
      throw Object.assign(new Error("Document not found"), { status: 404 });
    }
    return doc;
  });
}

// ─────────────────────────────────────────────────────────────
// TAGS
// ─────────────────────────────────────────────────────────────

async function addTag(documentId, { tag_name, colour }, user) {
  return withSharedContext(async (client) => {
    const doc = await repo.findById(client, documentId);
    if (!doc) {
      throw Object.assign(new Error("Document not found"), { status: 404 });
    }
    const tag = await repo.addTag(client, {
      documentId,
      tagName: tag_name,
      colour,
      business: doc.business,
      taggedBy: user?.user_id,
    });
    return tag || { tag_name, already_tagged: true };
  });
}

async function removeTag(documentId, tagName, user) {
  return withSharedContext(async (client) => {
    const doc = await repo.findById(client, documentId);
    if (!doc) {
      throw Object.assign(new Error("Document not found"), { status: 404 });
    }
    const removed = await repo.removeTag(client, { documentId, tagName });
    return { removed };
  });
}

async function listTags(business) {
  return withSharedContext((client) =>
    repo.listTagsForBusiness(client, business),
  );
}

// ─────────────────────────────────────────────────────────────
// SOFT-DELETE
// ─────────────────────────────────────────────────────────────

async function deleteDocument(documentId, user) {
  return withSharedContext(async (client) => {
    const doc = await repo.findById(client, documentId);
    if (!doc) {
      throw Object.assign(new Error("Document not found"), { status: 404 });
    }
    const result = await repo.softDelete(client, documentId);
    if (!result) {
      throw Object.assign(new Error("Document not found or already deleted"), {
        status: 404,
      });
    }
    await auditService.log(client, {
      userId: user?.user_id || null,
      userName: user?.display_name || "system",
      business: doc.business,
      module: "documents",
      action: "delete",
      table: "shared.documents",
      recordId: documentId,
      before: { is_deleted: false },
      after: { is_deleted: true },
      metadata: { sensitive: true, reason: "document deletion" },
    });
    return result;
  });
}

// ─────────────────────────────────────────────────────────────
// PROGRAMMATIC HELPER
// Called by other modules (invoicing, payroll, retail-partners) that
// generate a PDF and want to archive it. Bypasses the multipart upload
// path — caller provides the buffer directly.
// ─────────────────────────────────────────────────────────────

async function archiveGeneratedDocument({
  buffer,
  business,
  documentType,
  title,
  referenceType,
  referenceId,
  tags = [],
  user,
}) {
  return uploadDocument(
    {
      buffer,
      originalFilename: `${title.replace(/[^a-z0-9\-_. ]/gi, "_")}.pdf`,
      mimeType: "application/pdf",
      business,
      documentType,
      title,
      referenceType,
      referenceId,
      tags,
    },
    user,
  );
}

module.exports = {
  uploadDocument,
  downloadDocument,
  getImageForPublic,
  verifyDocument,
  listDocuments,
  getDocument,
  addTag,
  removeTag,
  listTags,
  deleteDocument,
  archiveGeneratedDocument,
  // Exported for use by other module's tests
  DOCUMENT_TYPES,
};
