"use strict";

const { withSharedContext } = require("../../config/db");
const auditService = require("../audit/audit.service");
const repo = require("./contacts.repository");

async function list({ business, search = "", type, page = 1, limit = 50 }, user) {
  return withSharedContext(async (client) => {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    // Prefer the explicit business passed by the route (sourced from
    // req.business, which honours the X-Business-Line header). Fall back
    // to the JWT's current_business. Never fall back to a hardcoded key —
    // that would silently expose the wrong business's contacts.
    const biz = business || user.current_business;
    if (!biz) {
      throw Object.assign(
        new Error("Business context required — include X-Business-Line header"),
        { status: 400 },
      );
    }
    const rows = await repo.list(client, {
      business: biz,
      search,
      type,
      limit: parseInt(limit),
      offset,
    });
    // Use countFiltered so the total reflects the same search/type filter
    // as the list query — raw count() returns the unfiltered total which
    // produces incorrect pagination when filtering is active.
    const total = await repo.countFiltered(client, biz, { search, type });
    return { data: rows, total, page: parseInt(page), limit: parseInt(limit) };
  });
}

async function getById(contactId) {
  return withSharedContext(async (client) => repo.findById(client, contactId));
}

async function create(data, user) {
  return withSharedContext(async (client) => {
    const contact = await repo.insert(client, {
      contact_type: data.contact_type,
      display_name: data.display_name,
      first_name: data.first_name,
      last_name: data.last_name,
      company_name: data.company_name,
      primary_phone: data.primary_phone,
      whatsapp_number: data.whatsapp_number,
      email: data.email,
      priority_level: data.priority_level,
      source: data.source,
      visible_to: data.visible_to,
      notes: data.notes,
      userId: user.user_id,
    });

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "System",
      business: user.current_business || "shared",
      module: "crm",
      action: "create",
      table: "contacts",
      recordId: contact.contact_id,
      after: contact,
    });
    return contact;
  });
}

async function update(contactId, data, user) {
  return withSharedContext(async (client) => {
    const before = await repo.findForUpdate(client, contactId);
    if (!before)
      throw Object.assign(new Error("Contact not found"), { status: 404 });

    const fields = [
      "display_name",
      "first_name",
      "last_name",
      "company_name",
      "primary_phone",
      "whatsapp_number",
      "email",
      "priority_level",
      "source",
      "notes",
      "addresses",
      // contact_type and visible_to were previously missing — contacts
      // could be created with a type but never reclassified after creation.
      "contact_type",
      "visible_to",
    ];
    const sets = [],
      values = [];
    for (const field of fields) {
      if (data[field] !== undefined) {
        values.push(data[field]);
        sets.push(`${field} = $${values.length}`);
      }
    }
    if (!sets.length) return before;

    values.push(contactId);
    const after = await repo.update(client, contactId, sets, values);

    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "System",
      business: user.current_business || "shared",
      module: "crm",
      action: "update",
      table: "contacts",
      recordId: contactId,
      before,
      after,
    });
    return after;
  });
}

async function softDelete(contactId, user) {
  return withSharedContext(async (client) => {
    const before = await repo.softDelete(client, contactId);
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "System",
      business: user.current_business || "shared",
      module: "crm",
      action: "delete",
      table: "contacts",
      recordId: contactId,
      before,
    });
  });
}

async function getTimeline(contactId, business) {
  return withSharedContext(async (client) => {
    const [activities, invoices, deals] = await Promise.all([
      repo.getActivities(client, contactId, business),
      repo.getInvoices(client, contactId, business),
      repo.getDeals(client, contactId, business),
    ]);
    return { activities, invoices, deals };
  });
}

async function addAddress(contactId, data, user) {
  return withSharedContext(async (client) => {
    if (data.is_default)
      await repo.clearDefaultAddresses(client, {
        contactId,
        address_type: data.address_type,
      });
    return repo.insertAddress(client, {
      contactId,
      address_type: data.address_type,
      line1: data.line1,
      line2: data.line2,
      area: data.area,
      city: data.city,
      state: data.state,
      country: data.country,
      landmark: data.landmark,
      recipient_name: data.recipient_name,
      recipient_phone: data.recipient_phone,
      is_default: data.is_default,
      userId: user.user_id,
    });
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  softDelete,
  getTimeline,
  addAddress,
};
