"use strict";

const repo = require("./accounting.repository");

async function listUnreconciled(client) {
  return repo.findBankStatements(client, { reconciled: "false" });
}

async function reconcileItem(client, { statementId, paymentId }) {
  await repo.reconcileStatement(client, { statementId, paymentId });
  return { message: "Reconciled" };
}

// Previously had raw SQL inline — now delegates to repo
async function getReconciliationSummary(client, bankAccountId) {
  return repo.getReconciliationSummary(client, bankAccountId);
}

module.exports = { listUnreconciled, reconcileItem, getReconciliationSummary };
