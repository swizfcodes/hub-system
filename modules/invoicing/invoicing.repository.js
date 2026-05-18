"use strict";

async function list(
  client,
  { status, contactId, scope, userId, limit, offset },
) {
  const { rows } = await client.query(
    `SELECT i.invoice_id, i.invoice_number, i.invoice_type, i.status,
            i.total_amount, i.amount_paid, i.amount_outstanding,
            i.issue_date, i.due_date,
            c.display_name AS contact_name, c.contact_id
     FROM invoices i
     JOIN shared.contacts c ON c.contact_id = i.contact_id
     WHERE i.is_deleted = false
       AND ($1::TEXT IS NULL OR i.status = $1)
       AND ($2::UUID IS NULL OR i.contact_id = $2)
       AND ($3::TEXT = 'all' OR i.created_by = $4)
     ORDER BY i.created_at DESC
     LIMIT $5 OFFSET $6`,
    [status || null, contactId || null, scope, userId, limit, offset],
  );
  return rows;
}

async function findById(client, invoiceId) {
  const {
    rows: [inv],
  } = await client.query(
    `SELECT i.*,
            c.display_name AS contact_name, c.email, c.primary_phone, c.whatsapp_number,
            json_agg(il.* ORDER BY il.display_order) AS lines,
            json_agg(ip.*) FILTER (WHERE ip.payment_id IS NOT NULL) AS payments
     FROM invoices i
     JOIN shared.contacts c ON c.contact_id = i.contact_id
     LEFT JOIN invoice_lines il ON il.invoice_id = i.invoice_id
     LEFT JOIN invoice_payments ip ON ip.invoice_id = i.invoice_id
     WHERE i.invoice_id = $1 AND i.is_deleted = false
     GROUP BY i.invoice_id, c.display_name, c.email, c.primary_phone, c.whatsapp_number`,
    [invoiceId],
  );
  return inv || null;
}

async function insert(
  client,
  {
    invoiceNumber,
    invoice_type,
    contact_id,
    order_id,
    due_date,
    subtotal,
    discount_total,
    vatTotal,
    total,
    currency,
    notes,
    payment_instructions,
    userId,
  },
) {
  const {
    rows: [inv],
  } = await client.query(
    `INSERT INTO invoices
       (invoice_number, invoice_type, contact_id, order_id, status,
        issue_date, due_date, subtotal, discount_total, vat_amount,
        total_amount, currency, notes, payment_instructions, created_by)
     VALUES ($1,$2,$3,$4,'draft',CURRENT_DATE,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      invoiceNumber,
      invoice_type || "standard",
      contact_id,
      order_id || null,
      due_date,
      subtotal,
      discount_total || 0,
      vatTotal,
      total,
      currency || "NGN",
      notes || null,
      payment_instructions || null,
      userId,
    ],
  );
  return inv;
}

async function insertLine(
  client,
  {
    invoice_id,
    product_id,
    description,
    quantity,
    unit_price,
    discount_amount,
    vat_rate,
    vatAmt,
    lineTotal,
    order,
  },
) {
  await client.query(
    `INSERT INTO invoice_lines
       (invoice_id, product_id, description, quantity, unit_price,
        discount_amount, vat_rate, vat_amount, line_total, display_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      invoice_id,
      product_id || null,
      description,
      quantity,
      unit_price,
      discount_amount || 0,
      vat_rate || 0.075,
      vatAmt,
      lineTotal,
      order,
    ],
  );
}

async function insertPayment(
  client,
  {
    invoiceId,
    payment_date,
    amount,
    payment_method,
    reference,
    paystack_reference,
    is_confirmed,
    userId,
    notes,
  },
) {
  const {
    rows: [payment],
  } = await client.query(
    `INSERT INTO invoice_payments
       (invoice_id, payment_date, amount, payment_method, reference,
        paystack_reference, is_confirmed, recorded_by, notes)
     VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      invoiceId,
      payment_date || null,
      amount,
      payment_method,
      reference || null,
      paystack_reference || null,
      is_confirmed !== undefined ? is_confirmed : true,
      userId,
      notes || null,
    ],
  );
  return payment;
}

async function getInvoiceNumberAndContact(client, invoiceId) {
  const {
    rows: [inv],
  } = await client.query(
    `SELECT invoice_number, contact_id FROM invoices WHERE invoice_id = $1`,
    [invoiceId],
  );
  return inv || null;
}

async function setSent(client, invoiceId) {
  await client.query(
    `UPDATE invoices SET status = 'sent', sent_at = now() WHERE invoice_id = $1 AND status = 'draft'`,
    [invoiceId],
  );
}

async function setVoided(client, invoiceId) {
  const {
    rows: [inv],
  } = await client.query(
    `UPDATE invoices SET status = 'voided', updated_at = now()
     WHERE invoice_id = $1 AND status NOT IN ('paid','voided')
     RETURNING *`,
    [invoiceId],
  );
  return inv || null;
}

// ── CREDIT NOTES ─────────────────────────────────────────────
// A credit note is issued against an invoice — a refund/return
// document. Lifecycle: draft → issued → applied | refunded.

async function listCreditNotes(
  client,
  { invoiceId, status, limit = 50, offset = 0 },
) {
  const params = [];
  const where = [];
  if (invoiceId) {
    params.push(invoiceId);
    where.push(`cn.invoice_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`cn.status = $${params.length}`);
  }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.push(limit, offset);
  const { rows } = await client.query(
    `SELECT cn.credit_note_id, cn.credit_note_number, cn.invoice_id,
            cn.contact_id, cn.reason, cn.total_amount, cn.status,
            cn.issued_at, cn.created_at, cn.updated_at,
            c.display_name AS contact_name,
            i.invoice_number
     FROM credit_notes cn
     JOIN shared.contacts c ON c.contact_id = cn.contact_id
     JOIN invoices i ON i.invoice_id = cn.invoice_id
     ${whereClause}
     ORDER BY cn.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows;
}

async function findCreditNoteById(client, creditNoteId) {
  const {
    rows: [cn],
  } = await client.query(
    `SELECT cn.*, c.display_name AS contact_name, i.invoice_number
     FROM credit_notes cn
     JOIN shared.contacts c ON c.contact_id = cn.contact_id
     JOIN invoices i ON i.invoice_id = cn.invoice_id
     WHERE cn.credit_note_id = $1`,
    [creditNoteId],
  );
  if (!cn) return null;
  const { rows: lines } = await client.query(
    `SELECT line_id, product_id, description, quantity, unit_price, line_total
     FROM credit_note_lines
     WHERE credit_note_id = $1`,
    [creditNoteId],
  );
  return { ...cn, lines };
}

async function insertCreditNote(
  client,
  { creditNoteNumber, invoiceId, contactId, reason, totalAmount, createdBy },
) {
  const {
    rows: [cn],
  } = await client.query(
    `INSERT INTO credit_notes
       (credit_note_number, invoice_id, contact_id, reason, total_amount, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      creditNoteNumber,
      invoiceId,
      contactId,
      reason,
      totalAmount || 0,
      createdBy || null,
    ],
  );
  return cn;
}

async function insertCreditNoteLine(
  client,
  { creditNoteId, productId, description, quantity, unitPrice, lineTotal },
) {
  const {
    rows: [line],
  } = await client.query(
    `INSERT INTO credit_note_lines
       (credit_note_id, product_id, description, quantity, unit_price, line_total)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      creditNoteId,
      productId || null,
      description,
      quantity,
      unitPrice,
      lineTotal,
    ],
  );
  return line;
}

async function setCreditNoteStatus(client, creditNoteId, status) {
  const {
    rows: [cn],
  } = await client.query(
    `UPDATE credit_notes SET
       status     = $2,
       issued_at  = CASE WHEN $2 = 'issued' AND issued_at IS NULL
                         THEN now() ELSE issued_at END,
       updated_at = now()
     WHERE credit_note_id = $1
     RETURNING *`,
    [creditNoteId, status],
  );
  return cn || null;
}

module.exports = {
  list,
  findById,
  insert,
  insertLine,
  insertPayment,
  getInvoiceNumberAndContact,
  setSent,
  setVoided,
  // credit notes
  listCreditNotes,
  findCreditNoteById,
  insertCreditNote,
  insertCreditNoteLine,
  setCreditNoteStatus,
};
