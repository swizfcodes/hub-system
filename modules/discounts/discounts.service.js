"use strict";

const { withBusinessContext } = require("../../config/db");
const auditService = require("../../shared/audit/audit.service");
const repo = require("./discounts.repository");

// ─────────────────────────────────────────────────────────────
// modules/discounts/discounts.service
//
// The promotions catalogue. An admin defines reusable discount
// rules ("Black Friday 20%", "₦5,000 off orders over ₦100k"); POS
// and quotations apply them by id and the catalogue tracks usage.
// ─────────────────────────────────────────────────────────────

const DISCOUNT_TYPES = ["percentage", "fixed"];
const APPLIES_TO = ["all", "product", "category"];

async function list(business, query) {
  return withBusinessContext(business, async (client) => {
    const data = await repo.list(client, {
      activeOnly: query.active_only === "true",
      validNow: query.valid_now === "true",
    });
    return { data };
  });
}

async function getById(business, discountId) {
  return withBusinessContext(business, async (client) => {
    const row = await repo.findById(client, discountId);
    if (!row) {
      throw Object.assign(new Error("Discount not found"), { status: 404 });
    }
    return row;
  });
}

function validate(data) {
  if (!data.discount_name || !data.discount_name.trim()) {
    throw Object.assign(new Error("discount_name is required"), {
      status: 400,
    });
  }
  if (!DISCOUNT_TYPES.includes(data.discount_type)) {
    throw Object.assign(
      new Error(`discount_type must be one of: ${DISCOUNT_TYPES.join(", ")}`),
      { status: 400 },
    );
  }
  if (data.value == null || data.value <= 0) {
    throw Object.assign(new Error("value must be a positive number"), {
      status: 400,
    });
  }
  // A percentage discount over 100% is almost certainly a mistake.
  if (data.discount_type === "percentage" && data.value > 100) {
    throw Object.assign(new Error("percentage discount cannot exceed 100"), {
      status: 400,
    });
  }
  if (data.applies_to && !APPLIES_TO.includes(data.applies_to)) {
    throw Object.assign(
      new Error(`applies_to must be one of: ${APPLIES_TO.join(", ")}`),
      { status: 400 },
    );
  }
  if (data.valid_from && data.valid_to) {
    if (new Date(data.valid_to) < new Date(data.valid_from)) {
      throw Object.assign(new Error("valid_to cannot be before valid_from"), {
        status: 400,
      });
    }
  }
}

async function create(business, data, user) {
  validate(data);
  return withBusinessContext(business, async (client) => {
    const dupe = await repo.findByName(client, data.discount_name.trim());
    if (dupe) {
      throw Object.assign(
        new Error(`A discount named "${data.discount_name}" already exists`),
        { status: 409 },
      );
    }
    const row = await repo.insert(client, {
      discountName: data.discount_name.trim(),
      discountType: data.discount_type,
      value: data.value,
      appliesTo: data.applies_to,
      validFrom: data.valid_from,
      validTo: data.valid_to,
      minOrderValue: data.min_order_value,
      usageLimit: data.usage_limit,
      createdBy: user.user_id,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "discounts",
      action: "create",
      table: "discounts",
      recordId: row.discount_id,
      after: row,
    });
    return row;
  });
}

async function update(business, discountId, data, user) {
  // Partial validation — only check fields that are being changed.
  if (data.discount_type && !DISCOUNT_TYPES.includes(data.discount_type)) {
    throw Object.assign(
      new Error(`discount_type must be one of: ${DISCOUNT_TYPES.join(", ")}`),
      { status: 400 },
    );
  }
  if (data.applies_to && !APPLIES_TO.includes(data.applies_to)) {
    throw Object.assign(
      new Error(`applies_to must be one of: ${APPLIES_TO.join(", ")}`),
      { status: 400 },
    );
  }
  return withBusinessContext(business, async (client) => {
    const before = await repo.findById(client, discountId);
    if (!before) {
      throw Object.assign(new Error("Discount not found"), { status: 404 });
    }
    const row = await repo.update(client, discountId, {
      discountName: data.discount_name ? data.discount_name.trim() : null,
      discountType: data.discount_type,
      value: data.value,
      appliesTo: data.applies_to,
      validFrom: data.valid_from,
      validTo: data.valid_to,
      minOrderValue: data.min_order_value,
      usageLimit: data.usage_limit,
      isActive: data.is_active,
    });
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "discounts",
      action: "edit",
      table: "discounts",
      recordId: discountId,
      before,
      after: row,
    });
    return row;
  });
}

async function remove(business, discountId, user) {
  return withBusinessContext(business, async (client) => {
    const before = await repo.findById(client, discountId);
    if (!before) {
      throw Object.assign(new Error("Discount not found"), { status: 404 });
    }
    await repo.softDelete(client, discountId);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "staff",
      business,
      module: "discounts",
      action: "delete",
      table: "discounts",
      recordId: discountId,
      before,
    });
    return { deleted: true };
  });
}

module.exports = { list, getById, create, update, remove };
