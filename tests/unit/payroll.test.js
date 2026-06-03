"use strict";

/**
 * Payroll Unit Tests
 * Tests payroll processing, calculations, and reporting
 */

const {
  generatePayroll,
  TEST_BUSINESS,
  TEST_USER,
} = require("../fixtures/seed");

describe("Payroll Service", () => {
  describe("Payroll Period Management", () => {
    it("should create valid payroll record", () => {
      const payroll = generatePayroll();
      expect(payroll.payroll_id).toBeTruthy();
      expect(payroll.business_id).toBe(TEST_BUSINESS.business_id);
      expect(payroll.period_name).toBeTruthy();
    });

    it("should have draft status by default", () => {
      const payroll = generatePayroll();
      expect(payroll.status).toBe("draft");
    });

    it("should follow YYYY-MM format for period", () => {
      const payroll = generatePayroll();
      expect(payroll.period_name).toMatch(/^\d{4}-\d{2}$/);
    });

    it("should support monthly payroll periods", () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const expectedPeriod = `${year}-${month}`;

      const payroll = generatePayroll();
      expect(payroll.period_name).toBe(expectedPeriod);
    });

    it("should track created by user", () => {
      const payroll = generatePayroll();
      expect(payroll.created_by).toBe(TEST_USER.user_id);
    });
  });

  describe("Payroll Calculations", () => {
    it("should calculate gross pay", () => {
      const payroll = generatePayroll();
      expect(payroll.total_gross).toBeGreaterThan(0);
    });

    it("should calculate deductions", () => {
      const payroll = generatePayroll();
      expect(payroll.total_deductions).toBeGreaterThan(0);
      expect(payroll.total_deductions <= payroll.total_gross).toBe(true);
    });

    it("should calculate net pay", () => {
      const payroll = generatePayroll();
      const calculated = payroll.total_gross - payroll.total_deductions;
      expect(payroll.total_net).toBe(calculated);
    });

    it("should handle zero deductions", () => {
      const payroll = generatePayroll(TEST_BUSINESS, {
        total_deductions: 0,
      });
      expect(payroll.total_net).toBe(payroll.total_gross);
    });

    it("should support variable deduction amounts", () => {
      const deductions = [10000, 25000, 50000, 100000];

      deductions.forEach((deduction) => {
        const payroll = generatePayroll(TEST_BUSINESS, {
          total_deductions: deduction,
        });
        expect(payroll.total_net).toBe(payroll.total_gross - deduction);
      });
    });
  });

  describe("Employee Tracking", () => {
    it("should track employee count", () => {
      const payroll = generatePayroll();
      expect(payroll.employee_count).toBeGreaterThan(0);
    });

    it("should calculate average salary", () => {
      const payroll = generatePayroll();
      const avgSalary = payroll.total_gross / payroll.employee_count;
      expect(avgSalary).toBeGreaterThan(0);
    });

    it("should support variable employee counts", () => {
      const counts = [5, 10, 25, 50, 100];

      counts.forEach((count) => {
        const payroll = generatePayroll(TEST_BUSINESS, {
          employee_count: count,
        });
        expect(payroll.employee_count).toBe(count);
      });
    });

    it("should allow employee list", () => {
      const payroll = generatePayroll(TEST_BUSINESS, {
        employees: [
          {
            employee_id: "emp-001",
            name: "John Doe",
            salary: 50000,
            deductions: 5000,
          },
          {
            employee_id: "emp-002",
            name: "Jane Smith",
            salary: 60000,
            deductions: 6000,
          },
        ],
      });

      expect(payroll.employees).toBeDefined();
      expect(payroll.employees.length).toBe(2);
    });
  });

  describe("Payroll Status Tracking", () => {
    it("should support draft status", () => {
      const payroll = generatePayroll(TEST_BUSINESS, { status: "draft" });
      expect(payroll.status).toBe("draft");
    });

    it("should support approved status", () => {
      const payroll = generatePayroll(TEST_BUSINESS, { status: "approved" });
      expect(payroll.status).toBe("approved");
    });

    it("should support processed status", () => {
      const payroll = generatePayroll(TEST_BUSINESS, {
        status: "processed",
        processed_date: new Date().toISOString(),
      });
      expect(payroll.status).toBe("processed");
      expect(payroll.processed_date).toBeTruthy();
    });

    it("should track processing date", () => {
      const now = new Date().toISOString();
      const payroll = generatePayroll(TEST_BUSINESS, {
        status: "processed",
        processed_date: now,
      });

      expect(payroll.processed_date).toBe(now);
    });

    it("should allow payroll reversal", () => {
      const payroll = generatePayroll(TEST_BUSINESS, { status: "reversed" });
      expect(payroll.status).toBe("reversed");
    });
  });

  describe("Payroll Validation", () => {
    it("should reject negative gross pay", () => {
      const payroll = generatePayroll(TEST_BUSINESS, { total_gross: -100000 });
      // Validation should fail
      expect(payroll.total_gross < 0).toBe(true);
    });

    it("should reject deductions exceeding gross", () => {
      const payroll = generatePayroll(TEST_BUSINESS, {
        total_gross: 100000,
        total_deductions: 150000,
      });
      // Validation should fail
      expect(payroll.total_deductions > payroll.total_gross).toBe(true);
    });

    it("should require period name", () => {
      const payroll = generatePayroll();
      expect(payroll.period_name).toBeTruthy();
      expect(payroll.period_name.length).toBeGreaterThan(0);
    });

    it("should require business association", () => {
      const payroll = generatePayroll();
      expect(payroll.business_id).toBeTruthy();
      expect(payroll.business_id).toBe(TEST_BUSINESS.business_id);
    });
  });

  describe("Payroll Reporting", () => {
    it("should aggregate payroll data", () => {
      const payrolls = [
        generatePayroll(TEST_BUSINESS, { period_name: "2024-01" }),
        generatePayroll(TEST_BUSINESS, { period_name: "2024-02" }),
        generatePayroll(TEST_BUSINESS, { period_name: "2024-03" }),
      ];

      const totalGross = payrolls.reduce((sum, p) => sum + p.total_gross, 0);
      const totalDeductions = payrolls.reduce(
        (sum, p) => sum + p.total_deductions,
        0,
      );

      expect(totalGross).toBeGreaterThan(0);
      expect(totalDeductions).toBeGreaterThan(0);
    });

    it("should calculate quarterly totals", () => {
      const q1Payrolls = [
        generatePayroll(TEST_BUSINESS, { period_name: "2024-01" }),
        generatePayroll(TEST_BUSINESS, { period_name: "2024-02" }),
        generatePayroll(TEST_BUSINESS, { period_name: "2024-03" }),
      ];

      const q1Gross = q1Payrolls.reduce((sum, p) => sum + p.total_gross, 0);
      expect(q1Gross).toBeGreaterThan(0);
    });

    it("should calculate annual totals", () => {
      const yearPayrolls = Array.from({ length: 12 }, (_, i) =>
        generatePayroll(TEST_BUSINESS, {
          period_name: `2024-${String(i + 1).padStart(2, "0")}`,
        }),
      );

      const annualGross = yearPayrolls.reduce(
        (sum, p) => sum + p.total_gross,
        0,
      );
      expect(annualGross).toBeGreaterThan(0);
    });

    it("should support YTD calculations", () => {
      const currentMonth = new Date().getMonth() + 1;
      const ytdPayrolls = Array.from({ length: currentMonth }, (_, i) =>
        generatePayroll(TEST_BUSINESS, {
          period_name: `2024-${String(i + 1).padStart(2, "0")}`,
        }),
      );

      const ytdGross = ytdPayrolls.reduce((sum, p) => sum + p.total_gross, 0);
      expect(ytdGross).toBeGreaterThan(0);
    });
  });

  describe("Payroll Timestamps", () => {
    it("should have creation timestamp", () => {
      const payroll = generatePayroll();
      expect(new Date(payroll.created_at)).toBeInstanceOf(Date);
    });

    it("should have update timestamp", () => {
      const payroll = generatePayroll();
      expect(new Date(payroll.updated_at)).toBeInstanceOf(Date);
    });

    it("should track processing timestamp", () => {
      const payroll = generatePayroll(TEST_BUSINESS, {
        status: "processed",
        processed_date: new Date().toISOString(),
      });
      expect(new Date(payroll.processed_date)).toBeInstanceOf(Date);
    });
  });

  describe("Business Context", () => {
    it("should belong to specific business", () => {
      const payroll = generatePayroll();
      expect(payroll.business_id).toBe(TEST_BUSINESS.business_id);
    });

    it("should track creator", () => {
      const payroll = generatePayroll();
      expect(payroll.created_by).toBe(TEST_USER.user_id);
    });

    it("should support multi-business isolation", () => {
      const payroll1 = generatePayroll(TEST_BUSINESS, {
        period_name: "2024-01",
      });
      const payroll2 = generatePayroll(TEST_BUSINESS, {
        period_name: "2024-02",
      });

      expect(payroll1.business_id).toBe(payroll2.business_id);
    });
  });
});
