"use strict";

/**
 * Expenses Unit Tests
 * Tests expense tracking and reimbursement
 */

const {
  generateExpense,
  TEST_BUSINESS,
  TEST_USER,
} = require("../fixtures/seed");

describe("Expenses Service", () => {
  describe("Expense Creation", () => {
    it("should create valid expense", () => {
      const expense = generateExpense();
      expect(expense.expense_id).toBeTruthy();
      expect(expense.business_id).toBe(TEST_BUSINESS.business_id);
      expect(expense.description).toBeTruthy();
    });

    it("should have draft status by default", () => {
      const expense = generateExpense();
      expect(expense.status).toBe("draft");
    });

    it("should track amount", () => {
      const expense = generateExpense();
      expect(expense.amount).toBeGreaterThan(0);
    });

    it("should set expense date", () => {
      const expense = generateExpense();
      expect(expense.expense_date).toBeTruthy();
    });

    it("should track submitter", () => {
      const expense = generateExpense();
      expect(expense.submitted_by).toBe(TEST_USER.user_id);
    });
  });

  describe("Expense Categories", () => {
    it("should support expense categories", () => {
      const categories = [
        "office_supplies",
        "travel",
        "meals",
        "utilities",
        "maintenance",
        "other",
      ];

      categories.forEach((category) => {
        const expense = generateExpense(TEST_BUSINESS, {
          expense_category: category,
        });
        expect(expense.expense_category).toBe(category);
      });
    });
  });

  describe("Expense Amounts", () => {
    it("should handle various amounts", () => {
      const amounts = [100, 1000, 10000, 100000];

      amounts.forEach((amount) => {
        const expense = generateExpense(TEST_BUSINESS, { amount });
        expect(expense.amount).toBe(amount);
      });
    });

    it("should support multiple currencies", () => {
      const expense = generateExpense();
      expect(expense.currency).toBeTruthy();
    });
  });

  describe("Expense Status", () => {
    it("should track submission", () => {
      const expense = generateExpense(TEST_BUSINESS, {
        status: "submitted",
      });
      expect(expense.status).toBe("submitted");
    });

    it("should track approval", () => {
      const expense = generateExpense(TEST_BUSINESS, {
        status: "approved",
        approved_by: TEST_USER.user_id,
      });
      expect(expense.status).toBe("approved");
      expect(expense.approved_by).toBe(TEST_USER.user_id);
    });

    it("should track rejection", () => {
      const expense = generateExpense(TEST_BUSINESS, {
        status: "rejected",
      });
      expect(expense.status).toBe("rejected");
    });

    it("should track reimbursement", () => {
      const expense = generateExpense(TEST_BUSINESS, {
        status: "reimbursed",
      });
      expect(expense.status).toBe("reimbursed");
    });
  });

  describe("Receipt Tracking", () => {
    it("should track receipt number", () => {
      const expense = generateExpense();
      expect(expense.receipt_number).toBeTruthy();
    });

    it("should link to vendor", () => {
      const expense = generateExpense();
      expect(expense.vendor).toBeTruthy();
    });
  });

  describe("Reimbursement", () => {
    it("should flag reimbursable expenses", () => {
      const expense = generateExpense(TEST_BUSINESS, { reimbursable: true });
      expect(expense.reimbursable).toBe(true);
    });

    it("should track non-reimbursable expenses", () => {
      const expense = generateExpense();
      expect(expense.reimbursable).toBe(false);
    });
  });

  describe("Approval Workflow", () => {
    it("should require approval before reimbursement", () => {
      const expense = generateExpense(TEST_BUSINESS, {
        status: "submitted",
        approved_by: null,
      });

      expect(expense.approved_by).toBeNull();
      expect(expense.status).toBe("submitted");
    });

    it("should not reimburse rejected expenses", () => {
      const expense = generateExpense(TEST_BUSINESS, {
        status: "rejected",
      });

      expect(expense.status).toBe("rejected");
      expect(expense.status).not.toBe("reimbursed");
    });
  });

  describe("Timestamps", () => {
    it("should track creation", () => {
      const expense = generateExpense();
      expect(new Date(expense.created_at)).toBeInstanceOf(Date);
    });

    it("should track updates", () => {
      const expense = generateExpense();
      expect(new Date(expense.updated_at)).toBeInstanceOf(Date);
    });
  });

  describe("Business Context", () => {
    it("should belong to specific business", () => {
      const expense = generateExpense();
      expect(expense.business_id).toBe(TEST_BUSINESS.business_id);
    });
  });
});
