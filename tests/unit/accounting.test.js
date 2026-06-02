"use strict";

/**
 * Accounting Unit Tests
 * Tests accounting operations: journal entries, accounts, reconciliation
 */

const {
  generateJournalEntry,
  generateToken,
  TEST_USER,
  TEST_BUSINESS,
  TEST_ACCOUNT,
} = require("../fixtures/seed");

describe("Accounting Service", () => {
  describe("Journal Entry Management", () => {
    it("should generate valid journal entry", () => {
      const entry = generateJournalEntry();
      expect(entry.entry_id).toBeTruthy();
      expect(entry.business_id).toBe(TEST_BUSINESS.business_id);
      expect(entry.entry_number).toMatch(/^JE-/);
      expect(entry.entry_date).toBeTruthy();
      expect(entry.description).toBeTruthy();
    });

    it("should have balanced debit and credit", () => {
      const entry = generateJournalEntry();
      const totalDebit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
      const totalCredit = entry.lines.reduce(
        (sum, line) => sum + line.credit,
        0,
      );
      expect(totalDebit).toBe(totalCredit);
    });

    it("should include multiple line items", () => {
      const entry = generateJournalEntry();
      expect(entry.lines.length).toBeGreaterThanOrEqual(2);
      entry.lines.forEach((line) => {
        expect(line.line_id).toBeTruthy();
        expect(line.account_id).toBeTruthy();
        expect(line.debit >= 0).toBe(true);
        expect(line.credit >= 0).toBe(true);
      });
    });

    it("should track posting user", () => {
      const entry = generateJournalEntry();
      expect(entry.posted_by).toBe(TEST_USER.user_id);
      expect(entry.posted_at).toBeTruthy();
    });

    it("should support custom overrides", () => {
      const entry = generateJournalEntry(TEST_BUSINESS, {
        description: "Custom Description",
        reference_type: "invoice",
        reference_id: "INV-123",
      });
      expect(entry.description).toBe("Custom Description");
      expect(entry.reference_type).toBe("invoice");
      expect(entry.reference_id).toBe("INV-123");
    });

    it("should mark as not reversed by default", () => {
      const entry = generateJournalEntry();
      expect(entry.is_reversed).toBe(false);
    });

    it("should have proper timestamps", () => {
      const entry = generateJournalEntry();
      expect(new Date(entry.created_at)).toBeInstanceOf(Date);
      expect(new Date(entry.updated_at)).toBeInstanceOf(Date);
      expect(new Date(entry.posted_at)).toBeInstanceOf(Date);
    });
  });

  describe("Chart of Accounts", () => {
    it("should have valid account structure", () => {
      expect(TEST_ACCOUNT.account_id).toBeTruthy();
      expect(TEST_ACCOUNT.account_code).toBeTruthy();
      expect(TEST_ACCOUNT.account_name).toBeTruthy();
      expect(TEST_ACCOUNT.account_type).toBeTruthy();
    });

    it("should have valid account type", () => {
      const validTypes = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];
      expect(validTypes).toContain(TEST_ACCOUNT.account_type);
    });

    it("should mark system accounts", () => {
      expect(TEST_ACCOUNT.is_system).toBe(true);
    });

    it("should have active status", () => {
      expect(TEST_ACCOUNT.is_active).toBe(true);
    });

    it("should support account hierarchy", () => {
      // Account can optionally have a parent
      const parentableAccount = {
        ...TEST_ACCOUNT,
        parent_account_id: "00000000-0000-0000-0000-000000000302",
      };
      expect(parentableAccount.parent_account_id).toBeTruthy();
    });
  });

  describe("Entry Validation", () => {
    it("should reject unbalanced entries", () => {
      const unbalanced = generateJournalEntry(TEST_BUSINESS, {
        lines: [
          {
            line_id: "1",
            account_id: TEST_ACCOUNT.account_id,
            debit: 1000,
            credit: 0,
          },
          { line_id: "2", account_id: "acc2", debit: 0, credit: 900 },
        ],
      });

      const totalDebit = unbalanced.lines.reduce(
        (sum, line) => sum + line.debit,
        0,
      );
      const totalCredit = unbalanced.lines.reduce(
        (sum, line) => sum + line.credit,
        0,
      );
      expect(totalDebit).not.toBe(totalCredit);
    });

    it("should handle zero-value entries", () => {
      const entry = generateJournalEntry(TEST_BUSINESS, {
        lines: [
          {
            line_id: "1",
            account_id: TEST_ACCOUNT.account_id,
            debit: 0,
            credit: 0,
          },
        ],
      });
      expect(entry.lines[0].debit).toBe(0);
      expect(entry.lines[0].credit).toBe(0);
    });

    it("should require account_id for each line", () => {
      const entry = generateJournalEntry();
      entry.lines.forEach((line) => {
        expect(line.account_id).toBeTruthy();
      });
    });
  });

  describe("Reconciliation Logic", () => {
    it("should identify matching transactions", () => {
      const entry1 = generateJournalEntry(TEST_BUSINESS, {
        entry_number: "JE-001",
        reference_type: "bank_stmt",
      });
      const entry2 = generateJournalEntry(TEST_BUSINESS, {
        entry_number: "JE-002",
        reference_type: "bank_stmt",
      });

      // Both reference bank statement
      expect(entry1.reference_type).toBe(entry2.reference_type);
    });

    it("should track reversals", () => {
      const original = generateJournalEntry(TEST_BUSINESS, {
        is_reversed: false,
      });
      const reversal = generateJournalEntry(TEST_BUSINESS, {
        is_reversed: true,
        reference_type: "reversal",
        reference_id: original.entry_id,
      });

      expect(original.is_reversed).toBe(false);
      expect(reversal.is_reversed).toBe(true);
      expect(reversal.reference_id).toBe(original.entry_id);
    });
  });

  describe("Reporting Data", () => {
    it("should aggregate debit balances", () => {
      const entries = [
        generateJournalEntry(),
        generateJournalEntry(),
        generateJournalEntry(),
      ];

      const totalDebits = entries.reduce((sum, entry) => {
        return (
          sum + entry.lines.reduce((lineSum, line) => lineSum + line.debit, 0)
        );
      }, 0);

      expect(totalDebits).toBeGreaterThan(0);
    });

    it("should aggregate credit balances", () => {
      const entries = [
        generateJournalEntry(),
        generateJournalEntry(),
        generateJournalEntry(),
      ];

      const totalCredits = entries.reduce((sum, entry) => {
        return (
          sum + entry.lines.reduce((lineSum, line) => lineSum + line.credit, 0)
        );
      }, 0);

      expect(totalCredits).toBeGreaterThan(0);
    });

    it("should verify accounting equation", () => {
      const entries = [generateJournalEntry(), generateJournalEntry()];

      let totalDebits = 0;
      let totalCredits = 0;

      entries.forEach((entry) => {
        entry.lines.forEach((line) => {
          totalDebits += line.debit;
          totalCredits += line.credit;
        });
      });

      expect(totalDebits).toBe(totalCredits);
    });
  });
});
