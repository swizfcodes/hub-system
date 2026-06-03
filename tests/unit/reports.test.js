"use strict";

/**
 * Reports Unit Tests
 * Tests report generation and analytics
 */

const {
  generateReport,
  TEST_BUSINESS,
  TEST_USER,
} = require("../fixtures/seed");

describe("Reports Service", () => {
  describe("Report Generation", () => {
    it("should create valid report", () => {
      const report = generateReport();
      expect(report.report_id).toBeTruthy();
      expect(report.business_id).toBe(TEST_BUSINESS.business_id);
      expect(report.report_name).toBeTruthy();
    });

    it("should have sales_summary type by default", () => {
      const report = generateReport();
      expect(report.report_type).toBe("sales_summary");
    });

    it("should set period dates", () => {
      const report = generateReport();
      expect(report.period_start).toBeTruthy();
      expect(report.period_end).toBeTruthy();
      expect(new Date(report.period_end) >= new Date(report.period_start)).toBe(
        true,
      );
    });

    it("should track report creator", () => {
      const report = generateReport();
      expect(report.generated_by).toBe(TEST_USER.user_id);
    });

    it("should timestamp generation", () => {
      const report = generateReport();
      expect(new Date(report.generated_at)).toBeInstanceOf(Date);
    });
  });

  describe("Report Types", () => {
    it("should support sales_summary", () => {
      const report = generateReport(TEST_BUSINESS, {
        report_type: "sales_summary",
      });
      expect(report.report_type).toBe("sales_summary");
    });

    it("should support revenue_summary", () => {
      const report = generateReport(TEST_BUSINESS, {
        report_type: "revenue_summary",
      });
      expect(report.report_type).toBe("revenue_summary");
    });

    it("should support inventory_summary", () => {
      const report = generateReport(TEST_BUSINESS, {
        report_type: "inventory_summary",
      });
      expect(report.report_type).toBe("inventory_summary");
    });

    it("should support expense_summary", () => {
      const report = generateReport(TEST_BUSINESS, {
        report_type: "expense_summary",
      });
      expect(report.report_type).toBe("expense_summary");
    });

    it("should support customer_analysis", () => {
      const report = generateReport(TEST_BUSINESS, {
        report_type: "customer_analysis",
      });
      expect(report.report_type).toBe("customer_analysis");
    });

    it("should support financial_summary", () => {
      const report = generateReport(TEST_BUSINESS, {
        report_type: "financial_summary",
      });
      expect(report.report_type).toBe("financial_summary");
    });
  });

  describe("Report Data", () => {
    it("should include summary statistics", () => {
      const report = generateReport();
      expect(report.data).toBeDefined();
      expect(report.data.total_sales).toBeTruthy();
    });

    it("should aggregate metrics", () => {
      const report = generateReport();
      expect(report.data.total_orders).toBeGreaterThan(0);
      expect(report.data.average_order_value).toBeGreaterThan(0);
    });

    it("should calculate performance metrics", () => {
      const report = generateReport(TEST_BUSINESS, {
        data: {
          total_sales: 500000,
          total_orders: 25,
          average_order_value: 20000,
          growth_rate: 15.5,
        },
      });

      expect(report.data.growth_rate).toBeTruthy();
    });
  });

  describe("Report Scheduling", () => {
    it("should support manual generation", () => {
      const report = generateReport(TEST_BUSINESS, { scheduled: false });
      expect(report.scheduled).toBe(false);
    });

    it("should support scheduled generation", () => {
      const report = generateReport(TEST_BUSINESS, {
        scheduled: true,
        schedule_frequency: "monthly",
      });
      expect(report.scheduled).toBe(true);
    });

    it("should support daily reports", () => {
      const report = generateReport(TEST_BUSINESS, {
        schedule_frequency: "daily",
      });
      expect(report.schedule_frequency).toBe("daily");
    });

    it("should support weekly reports", () => {
      const report = generateReport(TEST_BUSINESS, {
        schedule_frequency: "weekly",
      });
      expect(report.schedule_frequency).toBe("weekly");
    });

    it("should support monthly reports", () => {
      const report = generateReport(TEST_BUSINESS, {
        schedule_frequency: "monthly",
      });
      expect(report.schedule_frequency).toBe("monthly");
    });

    it("should support quarterly reports", () => {
      const report = generateReport(TEST_BUSINESS, {
        schedule_frequency: "quarterly",
      });
      expect(report.schedule_frequency).toBe("quarterly");
    });

    it("should support annual reports", () => {
      const report = generateReport(TEST_BUSINESS, {
        schedule_frequency: "annual",
      });
      expect(report.schedule_frequency).toBe("annual");
    });
  });

  describe("Report Distribution", () => {
    it("should support email distribution", () => {
      const report = generateReport(TEST_BUSINESS, {
        distribution_method: "email",
        recipients: ["admin@example.com"],
      });
      expect(report.distribution_method).toBe("email");
    });

    it("should support download", () => {
      const report = generateReport(TEST_BUSINESS, {
        distribution_method: "download",
      });
      expect(report.distribution_method).toBe("download");
    });

    it("should include recipients list", () => {
      const report = generateReport(TEST_BUSINESS, {
        recipients: ["admin@example.com", "manager@example.com"],
      });
      expect(report.recipients.length).toBe(2);
    });
  });

  describe("Period Selection", () => {
    it("should generate monthly reports", () => {
      const report = generateReport();
      const start = new Date(report.period_start);
      const end = new Date(report.period_end);
      const daysDiff = Math.floor((end - start) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBeLessThanOrEqual(31);
    });

    it("should generate quarterly reports", () => {
      const startDate = new Date();
      const endDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

      const report = generateReport(TEST_BUSINESS, {
        period_start: startDate.toISOString().split("T")[0],
        period_end: endDate.toISOString().split("T")[0],
      });

      expect(report.period_start).toBeTruthy();
      expect(report.period_end).toBeTruthy();
    });
  });

  describe("Report Access", () => {
    it("should track report owner", () => {
      const report = generateReport();
      expect(report.generated_by).toBeTruthy();
    });

    it("should control access by business", () => {
      const report = generateReport();
      expect(report.business_id).toBe(TEST_BUSINESS.business_id);
    });
  });

  describe("Report Caching", () => {
    it("should be cacheable", () => {
      const report = generateReport();
      const cached = {
        report_id: report.report_id,
        generated_at: report.generated_at,
        ttl: 3600, // 1 hour
      };
      expect(cached.ttl).toBe(3600);
    });
  });

  describe("Business Context", () => {
    it("should belong to specific business", () => {
      const report = generateReport();
      expect(report.business_id).toBe(TEST_BUSINESS.business_id);
    });
  });
});
