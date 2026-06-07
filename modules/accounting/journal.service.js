"use strict";

const repo = require("./accounting.repository");

/**
 * Post any journal entry from within or outside this module.
 * The canonical write path — every other module (payroll, sales, purchasing)
 * calls this instead of touching journal_entries / journal_lines directly.
 *
 * Must be called inside an active withBusinessContext block so that
 * the journal and its parent record (payroll run, invoice, PO receipt)
 * commit or roll back together.
 */
async function postEntry(
  client,
  { entryDate, description, referenceType, referenceId, postedBy, lines },
) {
  const totalDebit = lines.reduce((s, l) => s + parseFloat(l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + parseFloat(l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      `Journal out of balance: DR=${totalDebit} CR=${totalCredit}`,
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const period = await repo.findActivePeriod(client, entryDate || today);

  const entry = await repo.insertJournalEntry(client, {
    entryDate: entryDate || today,
    description,
    referenceType,
    referenceId: referenceId || null,
    periodId: period?.period_id || null,
    postedBy,
  });

  for (const l of lines) {
    await repo.insertJournalLine(client, {
      entryId: entry.entry_id,
      accountId: l.account_id,
      debit: l.debit || 0,
      credit: l.credit || 0,
      description: l.description || null,
      contactId: l.contact_id || null,
    });
  }

  return entry;
}

/**
 * Reverse an existing journal entry — swaps DR/CR on every line
 * and marks the original as reversed.
 */
async function reverseEntry(client, { entryId, postedBy }) {
  const original = await repo.findJournalById(client, entryId);
  if (!original)
    throw Object.assign(new Error("Journal entry not found"), { status: 404 });
  if (original.is_reversed)
    throw Object.assign(new Error("Entry already reversed"), { status: 400 });

  // Create reversal — swap DR and CR
  const reversalLines = original.lines.map((l) => ({
    account_id: l.account_id,
    debit: l.credit, // swap
    credit: l.debit, // swap
    description: `Reversal: ${l.description || ""}`,
  }));

  const reversal = await postEntry(client, {
    description: `REVERSAL of ${original.entry_number}: ${original.description}`,
    referenceType: "manual",
    postedBy,
    lines: reversalLines,
  });

  // Mark original as reversed
  await client.query(
    `UPDATE journal_entries SET is_reversed=true, reversal_of=$1 WHERE entry_id=$2`,
    [entryId, reversal.entry_id],
  );

  return reversal;
}

/**
 * Resolve an account_id from a chart-of-accounts code.
 * Used by external modules that post journals by code rather than UUID.
 */
async function getAccountId(client, accountCode) {
  const {
    rows: [acc],
  } = await client.query(
    `SELECT account_id FROM chart_of_accounts
     WHERE account_code=$1 AND is_active=true LIMIT 1`,
    [accountCode],
  );
  return acc?.account_id || null;
}

module.exports = { postEntry, reverseEntry, getAccountId };
