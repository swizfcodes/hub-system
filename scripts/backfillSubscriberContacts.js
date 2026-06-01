#!/usr/bin/env node
"use strict";

/* ============================================================
 * Backfill — tag existing newsletter subscribers as `subscriber`
 * contacts in shared.contacts.
 *
 * New/re-subscribes are tagged automatically by subscribeNewsletter,
 * but subscribers collected BEFORE that change exist only in
 * store.newsletter_subscribers and aren't reachable by the campaign
 * engine. This walks every ACTIVE (non-unsubscribed) subscriber and
 * runs tagContactAsSubscriber, which:
 *   - adds 'subscriber' to an existing contact's type array, or
 *   - creates a new subscriber contact.
 *
 * Fully idempotent — re-running tags nothing twice. Unsubscribed
 * subscribers are skipped (they shouldn't be campaign-reachable).
 *
 * Usage (from the hub-system folder):
 *   node scripts/backfillSubscriberContacts.js
 *   node scripts/backfillSubscriberContacts.js --dry-run
 * ============================================================ */

const { withStoreContext } = require("../config/db");
const repo = require("../modules/store/store.repository");

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log("Backfill newsletter subscribers → contacts");
  console.log("=".repeat(56));
  if (dryRun) console.log("(dry run — no writes)\n");

  const result = await withStoreContext(async (client) => {
    const { rows: subs } = await client.query(
      `SELECT email FROM store.newsletter_subscribers
       WHERE unsubscribed_at IS NULL
       ORDER BY subscribed_at ASC`,
    );

    let tagged = 0;
    let failed = 0;
    for (const sub of subs) {
      if (dryRun) {
        console.log(`  would tag: ${sub.email}`);
        continue;
      }
      try {
        await repo.tagContactAsSubscriber(client, { email: sub.email });
        tagged += 1;
        console.log(`  ✓ ${sub.email}`);
      } catch (err) {
        failed += 1;
        console.log(`  ✗ ${sub.email} — ${err.message}`);
      }
    }
    return { total: subs.length, tagged, failed };
  });

  console.log("\n" + "=".repeat(56));
  if (dryRun) {
    console.log(`${result.total} active subscriber(s) would be tagged.`);
  } else {
    console.log(
      `Done. ${result.tagged}/${result.total} tagged` +
        (result.failed ? `, ${result.failed} failed.` : "."),
    );
    console.log(
      "They're now reachable via Campaigns → audience → Newsletter subscribers.",
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
