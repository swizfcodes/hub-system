"use strict";

/**
 * Expenses Unit Tests
 * Tests the real expenses service: validation guards, category→COA
 * mapping completeness, auto-approve threshold, and type whitelists.
 * (Full lifecycle — approve/pay/receipts/RBAC — is covered by the
 * end-to-end suite against a live server + database.)
 */

const service = require("../../modules/expenses/expenses.service");

describe("Expenses Service", () => {
  const user = { user_id: "00000000-0000-0000-0000-000000000001", email: "t@t" };
  const base = {
    amount: 100000,
    description: "test",
    expense_date: "2026-06-01",
    vendor_name: "Vendor X",
  };

  describe("Validation guards (fail before any DB access)", () => {
    it("rejects an unknown category with HTTP 400", async () => {
      await expect(
        service.create("diffusers", { ...base, category: "bribes" }, user),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("rejects an unknown expense_type with HTTP 400", async () => {
      await expect(
        service.create(
          "diffusers",
          { ...base, category: "other", expense_type: "wire_fraud" },
          user,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("Category → chart-of-accounts mapping", () => {
    it("maps every valid category to a COA code", () => {
      for (const cat of service.VALID_CATEGORIES) {
        expect(service.CATEGORY_ACCOUNT_MAP[cat]).toMatch(/^6\d{3}$/);
      }
    });

    it("covers all categories offered by the UI", () => {
      const uiCategories = [
        "rent", "transport", "office_supplies", "meals",
        "client_entertainment", "utilities", "maintenance", "marketing",
        "insurance", "professional_fees", "software_subscriptions", "other",
      ];
      for (const cat of uiCategories) {
        expect(service.VALID_CATEGORIES).toContain(cat);
      }
    });
  });

  describe("Expense types", () => {
    it("accepts the three UI types plus advance retirement", () => {
      expect(service.VALID_EXPENSE_TYPES).toEqual(
        expect.arrayContaining([
          "reimbursement", "petty_cash", "direct_payment",
          "cash_advance_retirement",
        ]),
      );
    });
  });

  describe("Auto-approve threshold", () => {
    it("defaults to ₦5,000 (matches client constant)", () => {
      expect(service.AUTO_APPROVE_THRESHOLD).toBe(5000);
    });
  });
});
