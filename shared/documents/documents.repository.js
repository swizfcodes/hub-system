"use strict";

// ─────────────────────────────────────────────────────────────
// DOCUMENTS REPOSITORY
//
// Two tables:
//   - shared.documents      master record + SHA-256 content_hash
//                           for tamper detection
//   - shared.document_tags  freeform tagging per business
//
// Documents are immutable from the application layer: there is no
// UPDATE on the file_path, file_size_bytes, or content_hash. Once
// stored, the record is the canonical reference. Deletes are soft
// (is_deleted = true) and the original audit trail in shared.audit_log
// preserves who deleted what.
// ─────────────────────────────────────────────────────────────

// ── LIST / SEARCH ────────────────────────────────────────────

async function listDocuments(
  client,
  {
    business,
    documentType,
    referenceType,
    referenceId,
    search,
    tags,
    limit,
    offset,
  },
) {
  const params = [];
  const conditions = ["d.is_deleted = false"];

  if (business) {
    params.push(business);
    conditions.push(`d.business = $${params.length}`);
  }
  if (documentType) {
    params.push(documentType);
    conditions.push(`d.document_type = $${params.length}`);
  }
  if (referenceType) {
    params.push(referenceType);
    conditions.push(`d.reference_type = $${params.length}`);
  }
  if (referenceId) {
    params.push(referenceId);
    conditions.push(`d.reference_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(
      `(d.title ILIKE $${params.length} OR d.document_number ILIKE $${params.length})`,
    );
  }
  if (Array.isArray(tags) && tags.length) {
    params.push(tags);
    conditions.push(
      `EXISTS (SELECT 1 FROM shared.document_tags dt
               WHERE dt.document_id = d.document_id
                 AND dt.tag_name = ANY($${params.length}::text[]))`,
    );
  }

  params.push(limit, offset);
  const limitIdx = params.length - 1;
  const offsetIdx = params.length;

  const { rows } = await client.query(
    `SELECT d.document_id, d.document_number, d.business, d.document_type,
            d.title, d.file_path, d.file_size_bytes, d.mime_type,
            d.content_hash, d.reference_type, d.reference_id,
            d.uploaded_by, d.created_at,
            uploaded_by_contact.display_name AS uploaded_by_name,
            COALESCE(
              (SELECT json_agg(json_build_object('tag_name', dt.tag_name, 'colour', dt.colour))
               FROM shared.document_tags dt
               WHERE dt.document_id = d.document_id),
              '[]'::json
            ) AS tags
     FROM shared.documents d
     LEFT JOIN shared.users uploaded_by_user
       ON uploaded_by_user.user_id = d.uploaded_by
     LEFT JOIN shared.staff_profiles uploaded_by_profile
       ON uploaded_by_profile.profile_id = uploaded_by_user.staff_profile_id
     LEFT JOIN shared.contacts uploaded_by_contact
       ON uploaded_by_contact.contact_id = uploaded_by_profile.contact_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY d.created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );
  return rows;
}

async function countDocuments(
  client,
  { business, documentType, referenceType, referenceId, search, tags },
) {
  const params = [];
  const conditions = ["d.is_deleted = false"];

  if (business) {
    params.push(business);
    conditions.push(`d.business = $${params.length}`);
  }
  if (documentType) {
    params.push(documentType);
    conditions.push(`d.document_type = $${params.length}`);
  }
  if (referenceType) {
    params.push(referenceType);
    conditions.push(`d.reference_type = $${params.length}`);
  }
  if (referenceId) {
    params.push(referenceId);
    conditions.push(`d.reference_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    conditions.push(
      `(d.title ILIKE $${params.length} OR d.document_number ILIKE $${params.length})`,
    );
  }
  if (Array.isArray(tags) && tags.length) {
    params.push(tags);
    conditions.push(
      `EXISTS (SELECT 1 FROM shared.document_tags dt
               WHERE dt.document_id = d.document_id
                 AND dt.tag_name = ANY($${params.length}::text[]))`,
    );
  }

  const {
    rows: [{ count }],
  } = await client.query(
    `SELECT COUNT(*)::int FROM shared.documents d WHERE ${conditions.join(" AND ")}`,
    params,
  );
  return parseInt(count, 10);
}

async function findById(client, documentId) {
  const {
    rows: [row],
  } = await client.query(
    `SELECT d.*,
            uploaded_by_contact.display_name AS uploaded_by_name,
            COALESCE(
              (SELECT json_agg(json_build_object('tag_name', dt.tag_name, 'colour', dt.colour))
               FROM shared.document_tags dt
               WHERE dt.document_id = d.document_id),
              '[]'::json
            ) AS tags
     FROM shared.documents d
     LEFT JOIN shared.users uploaded_by_user
       ON uploaded_by_user.user_id = d.uploaded_by
     LEFT JOIN shared.staff_profiles uploaded_by_profile
       ON uploaded_by_profile.profile_id = uploaded_by_user.staff_profile_id
     LEFT JOIN shared.contacts uploaded_by_contact
       ON uploaded_by_contact.contact_id = uploaded_by_profile.contact_id
     WHERE d.document_id = $1 AND d.is_deleted = false`,
    [documentId],
  );
  return row || null;
}

async function findByContentHash(client, contentHash, business) {
  // Used for dedupe — if the same file is uploaded twice, return the
  // existing record instead of creating a duplicate.
  const {
    rows: [row],
  } = await client.query(
    `SELECT * FROM shared.documents
     WHERE content_hash = $1 AND business = $2 AND is_deleted = false
     LIMIT 1`,
    [contentHash, business],
  );
  return row || null;
}

async function insert(client, data) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.documents
       (document_number, business, document_type, title,
        file_path, file_size_bytes, mime_type, content_hash,
        reference_type, reference_id, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      data.document_number,
      data.business,
      data.document_type,
      data.title,
      data.file_path,
      data.file_size_bytes,
      data.mime_type || "application/pdf",
      data.content_hash,
      data.reference_type || null,
      data.reference_id || null,
      data.uploaded_by || null,
    ],
  );
  return row;
}

async function softDelete(client, documentId) {
  const {
    rows: [row],
  } = await client.query(
    `UPDATE shared.documents
     SET is_deleted = true, deleted_at = now()
     WHERE document_id = $1 AND is_deleted = false
     RETURNING document_id, is_deleted, deleted_at`,
    [documentId],
  );
  return row || null;
}

// ── TAGS ─────────────────────────────────────────────────────

async function addTag(
  client,
  { documentId, tagName, colour, business, taggedBy },
) {
  const {
    rows: [row],
  } = await client.query(
    `INSERT INTO shared.document_tags
       (document_id, tag_name, business, colour, tagged_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING
     RETURNING tag_id, tag_name, colour`,
    [documentId, tagName, business, colour || "#64748B", taggedBy || null],
  );
  return row || null;
}

async function removeTag(client, { documentId, tagName }) {
  const result = await client.query(
    `DELETE FROM shared.document_tags
     WHERE document_id = $1 AND tag_name = $2`,
    [documentId, tagName],
  );
  return result.rowCount > 0;
}

async function listTagsForBusiness(client, business) {
  const { rows } = await client.query(
    `SELECT tag_name, colour, COUNT(*)::int AS usage_count
     FROM shared.document_tags
     WHERE business = $1
     GROUP BY tag_name, colour
     ORDER BY usage_count DESC, tag_name ASC`,
    [business],
  );
  return rows;
}

module.exports = {
  // documents
  listDocuments,
  countDocuments,
  findById,
  findByContentHash,
  insert,
  softDelete,
  // tags
  addTag,
  removeTag,
  listTagsForBusiness,
};
