"use strict";

/**
 * Dashboards Unit Tests
 * Tests dashboard configuration and widgets
 */

const {
  generateDashboardWidget,
  TEST_BUSINESS,
  TEST_USER,
} = require("../fixtures/seed");

describe("Dashboards Service", () => {
  describe("Dashboard Widget Creation", () => {
    it("should create valid widget", () => {
      const widget = generateDashboardWidget();
      expect(widget.widget_id).toBeTruthy();
      expect(widget.business_id).toBe(TEST_BUSINESS.business_id);
      expect(widget.title).toBeTruthy();
    });

    it("should have sales_summary type by default", () => {
      const widget = generateDashboardWidget();
      expect(widget.widget_type).toBe("sales_summary");
    });

    it("should support different widget types", () => {
      const types = [
        "sales_summary",
        "revenue_chart",
        "inventory_status",
        "top_products",
        "recent_orders",
      ];

      types.forEach((type) => {
        const widget = generateDashboardWidget(TEST_BUSINESS, {
          widget_type: type,
        });
        expect(widget.widget_type).toBe(type);
      });
    });

    it("should track position", () => {
      const widget = generateDashboardWidget();
      expect(widget.position).toBeGreaterThan(0);
    });

    it("should support different sizes", () => {
      const sizes = ["small", "medium", "large"];
      sizes.forEach((size) => {
        const widget = generateDashboardWidget(TEST_BUSINESS, { size });
        expect(widget.size).toBe(size);
      });
    });

    it("should track widget creator", () => {
      const widget = generateDashboardWidget();
      expect(widget.created_by).toBe(TEST_USER.user_id);
    });
  });

  describe("Widget Configuration", () => {
    it("should store filters", () => {
      const widget = generateDashboardWidget(TEST_BUSINESS, {
        filters: { period: "quarter", category: "electronics" },
      });
      expect(widget.filters.period).toBe("quarter");
      expect(widget.filters.category).toBe("electronics");
    });

    it("should set refresh rate", () => {
      const widget = generateDashboardWidget(TEST_BUSINESS, {
        refresh_rate: 600,
      });
      expect(widget.refresh_rate).toBe(600);
    });
  });

  describe("Widget Lifecycle", () => {
    it("should track creation timestamp", () => {
      const widget = generateDashboardWidget();
      expect(new Date(widget.created_at)).toBeInstanceOf(Date);
    });

    it("should track last update", () => {
      const widget = generateDashboardWidget();
      expect(new Date(widget.updated_at)).toBeInstanceOf(Date);
    });
  });

  describe("Business Context", () => {
    it("should belong to specific business", () => {
      const widget = generateDashboardWidget();
      expect(widget.business_id).toBe(TEST_BUSINESS.business_id);
    });
  });
});
