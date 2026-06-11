"use strict";

const { withBusinessContext } = require("../../config/db");
const notifService = require("../../shared/notifications/notifications.service");
const auditService = require("../../shared/audit/audit.service");
const logger = require("../../config/logger");
const repo = require("./loyalty.repository");

// Fallback defaults — used when business_config has no loyalty_settings row.
const DEFAULT_POINTS_PER_NAIRA = 1 / 1000;
const DEFAULT_EXPIRY_MONTHS = 12;

function calcPointsForAmount(amount, pointsPerNaira) {
  return Math.floor(parseFloat(amount) * pointsPerNaira);
}

function pointsExpiryDate(expiryMonths) {
  const d = new Date();
  d.setMonth(d.getMonth() + expiryMonths);
  return d;
}

// ── INTERNAL ─────────────────────────────────────────────────

// Called after every award to notify the customer if they crossed a tier.
async function _notifyTierUpgrade(
  client,
  business,
  contactId,
  oldTier,
  newTier,
  userId,
) {
  if (!newTier || !oldTier) return;
  if (newTier.tier_id === oldTier.tier_id) return;
  if (newTier.min_points <= oldTier.min_points) return;

  const cfg = await repo.getLoyaltyConfig(client, business);
  if (cfg.notify_on_tier_upgrade === false) return;

  await notifService.create(client, {
    userId,
    business,
    type: "loyalty_tier_upgrade",
    title: `Customer reached ${newTier.tier_name}`,
    body: `A customer just upgraded to the ${newTier.tier_name} loyalty tier.`,
    referenceType: "contact",
    referenceId: contactId,
    actionUrl: `/contacts/${contactId}`,
  });
}

// ── PUBLIC ────────────────────────────────────────────────────

async function getTiers(business) {
  return withBusinessContext(business, async (client) => {
    return repo.listTiers(client);
  });
}

async function getBalance(business, contactId) {
  return withBusinessContext(business, async (client) => {
    const balance = await repo.getBalance(client, contactId);
    const tier = await repo.getTierForBalance(client, balance);
    return { contact_id: contactId, balance, tier };
  });
}

async function getHistory(business, contactId, { page = 1, limit = 50 } = {}) {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  return withBusinessContext(business, async (client) => {
    const transactions = await repo.listTransactions(client, contactId, {
      limit: parseInt(limit),
      offset,
    });
    const balance = await repo.getBalance(client, contactId);
    const tier = await repo.getTierForBalance(client, balance);
    return { contact_id: contactId, balance, tier, transactions };
  });
}

// Called after a POS transaction or invoice payment. Fire-and-forget
// friendly — callers wrap this in .catch() so a loyalty failure never
// blocks the core sale.
async function awardPoints(
  business,
  contactId,
  amount,
  referenceType,
  referenceId,
  user,
) {
  return withBusinessContext(business, async (client) => {
    const cfg = await repo.getLoyaltyConfig(client, business);
    const pointsPerNaira = cfg.points_per_naira ?? DEFAULT_POINTS_PER_NAIRA;
    const expiryMonths = cfg.expiry_months ?? DEFAULT_EXPIRY_MONTHS;

    const points = calcPointsForAmount(amount, pointsPerNaira);
    if (points <= 0) return null;

    const balanceBefore = await repo.getBalance(client, contactId);
    const tierBefore = await repo.getTierForBalance(client, balanceBefore);

    const row = await repo.insertTransaction(client, {
      contactId,
      transactionType: "earned",
      points,
      referenceType,
      referenceId,
      notes: `Earned from ₦${Number(amount).toLocaleString()} purchase`,
      expiresAt: pointsExpiryDate(expiryMonths),
    });

    const balanceAfter = balanceBefore + points;
    const tierAfter = await repo.getTierForBalance(client, balanceAfter);

    if (user) {
      await _notifyTierUpgrade(
        client,
        business,
        contactId,
        tierBefore,
        tierAfter,
        user.user_id,
      );
    }

    logger.info(
      `[loyalty] awarded ${points}pts to contact ${contactId} ` +
        `(${referenceType}=${referenceId}) balance now ${balanceAfter}`,
    );

    return { ...row, balance_after: balanceAfter, tier: tierAfter };
  });
}

// Called at POS when customer wants to spend points against a purchase.
async function redeemPoints(
  business,
  contactId,
  points,
  referenceType,
  referenceId,
  user,
) {
  if (!points || parseInt(points) <= 0) {
    throw Object.assign(new Error("points must be a positive integer"), {
      status: 400,
    });
  }
  const pointsInt = parseInt(points);

  return withBusinessContext(business, async (client) => {
    const balance = await repo.getBalance(client, contactId);
    if (balance < pointsInt) {
      throw Object.assign(
        new Error(
          `Insufficient points. Balance: ${balance}, requested: ${pointsInt}`,
        ),
        { status: 400 },
      );
    }

    const row = await repo.insertTransaction(client, {
      contactId,
      transactionType: "redeemed",
      points: -pointsInt,
      referenceType,
      referenceId,
      notes: `Redeemed ${pointsInt} points`,
    });

    if (user) {
      await auditService.log(client, {
        userId: user.user_id,
        userName: user.display_name || "staff",
        business,
        module: "loyalty",
        action: "create",
        table: "loyalty_points",
        recordId: row.transaction_id,
        after: row,
      });
    }

    logger.info(
      `[loyalty] redeemed ${pointsInt}pts for contact ${contactId} ` +
        `(${referenceType}=${referenceId}) balance now ${balance - pointsInt}`,
    );

    return { ...row, balance_after: balance - pointsInt };
  });
}

// Manual award or adjustment by a manager (bonus, correction, etc.).
async function manualAward(
  business,
  contactId,
  { points, transaction_type, notes },
  user,
) {
  const allowed = ["bonus", "adjustment"];
  if (!allowed.includes(transaction_type)) {
    throw Object.assign(
      new Error(`transaction_type must be one of: ${allowed.join(", ")}`),
      { status: 400 },
    );
  }
  if (!points || points === 0) {
    throw Object.assign(new Error("points cannot be zero"), { status: 400 });
  }

  return withBusinessContext(business, async (client) => {
    const balanceBefore = await repo.getBalance(client, contactId);
    const tierBefore = await repo.getTierForBalance(client, balanceBefore);

    const row = await repo.insertTransaction(client, {
      contactId,
      transactionType: transaction_type,
      points,
      notes:
        notes ||
        `Manual ${transaction_type} by ${user.display_name || "manager"}`,
    });

    const balanceAfter = balanceBefore + points;
    const tierAfter = await repo.getTierForBalance(client, balanceAfter);

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "manager",
      business,
      module: "loyalty",
      action: "create",
      table: "loyalty_points",
      recordId: row.transaction_id,
      after: row,
    });

    await _notifyTierUpgrade(
      client,
      business,
      contactId,
      tierBefore,
      tierAfter,
      user.user_id,
    );

    return { ...row, balance_after: balanceAfter, tier: tierAfter };
  });
}

// Called by the daily expiry job.
async function expirePoints(business) {
  return withBusinessContext(business, async (client) => {
    const count = await repo.expireOldPoints(client);
    logger.info(
      `[loyalty] expired ${count} point rows for business ${business}`,
    );
    return { expired: count };
  });
}

// ── TIER MANAGEMENT ──────────────────────────────────────────

async function getTier(business, tierId) {
  return withBusinessContext(business, async (client) => {
    const tier = await repo.getTierById(client, tierId);
    if (!tier) {
      throw Object.assign(new Error("Tier not found"), { status: 404 });
    }
    return tier;
  });
}

async function createTier(
  business,
  {
    tierName,
    minPoints,
    maxPoints,
    benefits = {},
    colour = "#64748B",
    displayOrder = 0,
  },
  user,
) {
  if (!tierName || typeof tierName !== "string") {
    throw Object.assign(new Error("tier_name is required"), { status: 400 });
  }
  if (minPoints === undefined || minPoints === null) {
    throw Object.assign(new Error("min_points is required"), { status: 400 });
  }
  if (typeof minPoints !== "number" || minPoints < 0) {
    throw Object.assign(new Error("min_points must be a non-negative number"), {
      status: 400,
    });
  }
  if (
    maxPoints !== null &&
    (typeof maxPoints !== "number" || maxPoints < minPoints)
  ) {
    throw Object.assign(new Error("max_points must be >= min_points"), {
      status: 400,
    });
  }

  return withBusinessContext(business, async (client) => {
    const tier = await repo.createTier(client, {
      tierName,
      minPoints,
      maxPoints,
      benefits,
      colour,
      displayOrder,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "admin",
      business,
      module: "loyalty",
      action: "create",
      table: "loyalty_tiers",
      recordId: tier.tier_id,
      after: tier,
      metadata: { sensitive: true },
    });

    logger.info(
      `[loyalty] created tier "${tier.tier_name}" (${tier.min_points}-${tier.max_points} pts)`,
    );
    return tier;
  });
}

async function updateTier(business, tierId, updates, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.getTierById(client, tierId);
    if (!before) {
      throw Object.assign(new Error("Tier not found"), { status: 404 });
    }

    const after = await repo.updateTier(client, tierId, {
      ...updates,
      updatedBy: user.user_id,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "admin",
      business,
      module: "loyalty",
      action: "edit",
      table: "loyalty_tiers",
      recordId: tierId,
      before,
      after,
      metadata: { sensitive: true },
    });

    logger.info(`[loyalty] updated tier "${after.tier_name}"`);
    return after;
  });
}

async function deleteTier(business, tierId, user) {
  return withBusinessContext(business, async (client) => {
    const tier = await repo.getTierById(client, tierId);
    if (!tier) {
      throw Object.assign(new Error("Tier not found"), { status: 404 });
    }

    // Count distinct contacts whose CURRENT balance falls inside this
    // tier's points band. A balance is the sum of all non-expired
    // ledger rows for that contact — so we aggregate per contact in a
    // subquery, then filter the aggregated result with HAVING. (Using
    // SUM() directly in WHERE is invalid SQL — that was the previous
    // bug here: deleteTier threw a 500 on every call.)
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS count FROM (
         SELECT contact_id
         FROM loyalty_points
         WHERE expires_at IS NULL OR expires_at > now()
         GROUP BY contact_id
         HAVING COALESCE(SUM(points), 0)
                  BETWEEN $1 AND COALESCE($2, 999999999)
       ) AS members_in_band`,
      [tier.min_points, tier.max_points],
    );

    if (rows[0].count > 0) {
      throw Object.assign(
        new Error(
          `Cannot delete tier "${tier.tier_name}" — it has ${rows[0].count} active member(s). ` +
            `Reassign members to another tier first or move them manually.`,
        ),
        { status: 400 },
      );
    }

    const deleted = await repo.deleteTier(client, tierId);

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "admin",
      business,
      module: "loyalty",
      action: "delete",
      table: "loyalty_tiers",
      recordId: tierId,
      before: tier,
      metadata: { sensitive: true },
    });

    logger.info(`[loyalty] deleted tier "${tier.tier_name}"`);
    return { deleted };
  });
}

async function reorderTiers(business, tiers, user) {
  // tiers is an array of { tier_id, display_order }
  if (!Array.isArray(tiers) || !tiers.length) {
    throw Object.assign(new Error("tiers array is required"), { status: 400 });
  }

  return withBusinessContext(business, async (client) => {
    const results = [];

    for (const { tier_id, display_order } of tiers) {
      if (typeof display_order !== "number" || display_order < 0) {
        throw Object.assign(
          new Error(`Invalid display_order for tier ${tier_id}`),
          { status: 400 },
        );
      }

      const tier = await repo.reorderTiers(client, tier_id, display_order);
      if (!tier) {
        throw Object.assign(new Error(`Tier ${tier_id} not found`), {
          status: 404,
        });
      }
      results.push(tier);
    }

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "admin",
      business,
      module: "loyalty",
      action: "edit",
      table: "loyalty_tiers",
      recordId: "bulk",
      after: { reordered_tiers: results.length },
      metadata: { sensitive: true },
    });

    logger.info(`[loyalty] reordered ${results.length} tiers`);
    return results;
  });
}

async function getStats(business) {
  return withBusinessContext(business, async (client) => {
    const { totals, tierDistribution } = await repo.getStats(client);
    const config = await repo.getLoyaltyConfig(client, business);
    return {
      total_issued: totals.total_issued || 0,
      total_redeemed: totals.total_redeemed || 0,
      active_contacts: totals.active_contacts || 0,
      tier_distribution: tierDistribution,
      config: config || {},
    };
  });
}

async function getLeaderboard(business, limit = 20) {
  return withBusinessContext(business, async (client) => {
    return repo.getLeaderboard(client, limit);
  });
}

module.exports = {
  getTiers,
  getBalance,
  getHistory,
  getStats,
  getLeaderboard,
  awardPoints,
  redeemPoints,
  manualAward,
  expirePoints,
  getTier,
  createTier,
  updateTier,
  deleteTier,
  reorderTiers,
};
