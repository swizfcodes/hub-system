"use strict";

/**
 * Contacts visibility regression tests
 *
 * A contact created with an empty visible_to array ('{}') is invisible in
 * every business directory, because the list query filters on
 * `$business = ANY(visible_to) OR visible_to IS NULL`. The onboarding form
 * sends visible_to: [], and `[] || getActiveBusinesses()` keeps the empty
 * array — so newly onboarded employees never appeared under the Employees
 * tab. repo.insert must coerce an empty array to all active businesses.
 */

// Mock the businesses cache so getActiveBusinesses() is deterministic
// without loading config/db or hitting a database.
jest.mock("../../config/businesses", () => ({
  getActiveBusinesses: () => ["jewelry", "diffusers"],
}));

const repo = require("../../shared/contacts/contacts.repository");

// visible_to is the 11th positional parameter of the INSERT (index 10).
const VISIBLE_TO_PARAM = 10;

function makeClient() {
  const calls = [];
  return {
    calls,
    query: async (_sql, params) => {
      calls.push(params);
      return { rows: [{ contact_id: "c1" }] };
    },
  };
}

const baseContact = {
  contact_type: ["staff"],
  display_name: "Jane Doe",
  primary_phone: "08000000000",
  userId: "u1",
};

describe("contacts.repository.insert — visible_to coercion", () => {
  it("defaults an empty visible_to array to all active businesses", async () => {
    const client = makeClient();
    await repo.insert(client, { ...baseContact, visible_to: [] });
    expect(client.calls[0][VISIBLE_TO_PARAM]).toEqual(["jewelry", "diffusers"]);
  });

  it("defaults a missing visible_to to all active businesses", async () => {
    const client = makeClient();
    await repo.insert(client, { ...baseContact });
    expect(client.calls[0][VISIBLE_TO_PARAM]).toEqual(["jewelry", "diffusers"]);
  });

  it("preserves an explicit visible_to selection", async () => {
    const client = makeClient();
    await repo.insert(client, { ...baseContact, visible_to: ["jewelry"] });
    expect(client.calls[0][VISIBLE_TO_PARAM]).toEqual(["jewelry"]);
  });
});
