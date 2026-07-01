"use strict";

const { withSharedContext } = require("../../config/db");
const { getActiveBusinesses } = require("../../config/businesses");
const auditService = require("../audit/audit.service");
const repo = require("./contacts.repository");

async function list(
  { business, search = "", type, location, page = 1, limit = 50 },
  user,
) {
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
      location,
      limit: parseInt(limit),
      offset,
    });
    // Use countFiltered so the total reflects the same search/type filter
    // as the list query — raw count() returns the unfiltered total which
    // produces incorrect pagination when filtering is active.
    const total = await repo.countFiltered(client, biz, {
      search,
      type,
      location,
    });
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
      birthday_month: data.birthday_month,
      birthday_day: data.birthday_day,
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

/**
 * Which stakeholder records hang off this contact? Used to (a) stop the
 * type tags drifting out of sync on edit and (b) protect deletes.
 */
async function getLinkedRecords(client, contactId) {
  const links = { staff: false, supplier: [], retail_partner: [], login: false };
  const {
    rows: [profile],
  } = await client.query(
    `SELECT sp.profile_id, u.user_id
     FROM shared.staff_profiles sp
     LEFT JOIN shared.users u ON u.staff_profile_id = sp.profile_id
     WHERE sp.contact_id = $1 AND sp.is_deleted = false
     LIMIT 1`,
    [contactId],
  );
  if (profile) {
    links.staff = true;
    links.login = !!profile.user_id;
  }
  for (const biz of getActiveBusinesses()) {
    try {
      const { rows: sup } = await client.query(
        `SELECT 1 FROM ${biz}.suppliers WHERE contact_id = $1 AND is_active = true LIMIT 1`,
        [contactId],
      );
      if (sup.length) links.supplier.push(biz);
    } catch { /* schema may lack table */ }
    try {
      const { rows: rp } = await client.query(
        `SELECT 1 FROM ${biz}.retail_partners WHERE contact_id = $1 AND is_active = true LIMIT 1`,
        [contactId],
      );
      if (rp.length) links.retail_partner.push(biz);
    } catch { /* schema may lack table */ }
  }
  return links;
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
      "birthday_month",
      "birthday_day",
    ];
    // The type tags must never drift from reality: if an employee
    // profile / supplier / partner record exists, its tag survives any
    // edit — the UI can't accidentally untag a linked stakeholder.
    if (data.contact_type !== undefined) {
      const links = await getLinkedRecords(client, contactId);
      const required = [
        ...(links.staff ? ["staff"] : []),
        ...(links.supplier.length ? ["supplier"] : []),
        ...(links.retail_partner.length ? ["retail_partner"] : []),
      ];
      data.contact_type = [...new Set([...(data.contact_type || []), ...required])];
    }

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
    // Refuse to delete a contact with live stakeholder records — that
    // would orphan an employee profile/login, supplier or partner file.
    const links = await getLinkedRecords(client, contactId);
    const blockers = [];
    if (links.staff)
      blockers.push(
        links.login
          ? "an employee profile and a login account"
          : "an employee profile",
      );
    if (links.supplier.length)
      blockers.push(`a supplier record (${links.supplier.join(", ")})`);
    if (links.retail_partner.length)
      blockers.push(
        `a retail partner record (${links.retail_partner.join(", ")})`,
      );
    if (blockers.length) {
      throw Object.assign(
        new Error(
          `This contact has ${blockers.join(" and ")}. End the employment / deactivate the record first, then archive the contact.`,
        ),
        { status: 409 },
      );
    }
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
    const address = await repo.insertAddress(client, {
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

    // Addresses are a sub-resource of the contact — log against the
    // contact record so the edit shows up on its audit trail. (This was
    // previously missing entirely: address changes left no audit entry.)
    await auditService.log(client, {
      userId: user.user_id,
      userName: user.display_name || "System",
      business: user.current_business || "shared",
      module: "crm",
      action: "update",
      table: "contacts",
      recordId: contactId,
      after: { address_added: address },
    });

    return address;
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
