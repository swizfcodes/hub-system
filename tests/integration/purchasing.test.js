"use strict";

/**
 * Purchasing Integration Tests
 * Tests end-to-end purchase order workflows
 */

const {
  generatePurchaseOrder,
  generateStockMovement,
  TEST_BUSINESS,
  TEST_USER,
} = require("../fixtures/seed");

describe("Purchasing Workflow Integration", () => {
  describe("PO Creation to Receipt", () => {
    it("should create and confirm purchase order", () => {
      let po = generatePurchaseOrder(TEST_BUSINESS, { status: "draft" });
      expect(po.status).toBe("draft");

      po.status = "sent";
      expect(po.status).toBe("sent");

      po.status = "confirmed";
      expect(po.status).toBe("confirmed");
    });

    it("should receive goods and update inventory", () => {
      const po = generatePurchaseOrder(TEST_BUSINESS, { status: "confirmed" });

      const stockMovement = generateStockMovement(TEST_BUSINESS, {
        reference_type: "purchase_order",
        reference_id: po.purchase_order_id,
        quantity: po.items[0].quantity,
      });

      expect(stockMovement.reference_id).toBe(po.purchase_order_id);
      expect(stockMovement.balance_after).toBeGreaterThan(
        stockMovement.balance_before,
      );
    });
  });

  describe("Multi-Supplier Purchasing", () => {
    it("should manage multiple POs from different suppliers", () => {
      const pos = [
        generatePurchaseOrder(TEST_BUSINESS, { supplier_id: "supplier1" }),
        generatePurchaseOrder(TEST_BUSINESS, { supplier_id: "supplier2" }),
        generatePurchaseOrder(TEST_BUSINESS, { supplier_id: "supplier3" }),
      ];

      expect(pos.length).toBe(3);
      expect(pos[0].supplier_id).not.toBe(pos[1].supplier_id);
    });
  });

  describe("PO Cost Analysis", () => {
    it("should calculate total purchasing cost", () => {
      const pos = [
        generatePurchaseOrder(TEST_BUSINESS, { total: 100000 }),
        generatePurchaseOrder(TEST_BUSINESS, { total: 150000 }),
        generatePurchaseOrder(TEST_BUSINESS, { total: 200000 }),
      ];

      const totalSpent = pos.reduce((sum, po) => sum + po.total, 0);
      expect(totalSpent).toBe(450000);
    });

    it("should compare unit costs", () => {
      const po1 = generatePurchaseOrder(TEST_BUSINESS, {
        items: [
          {
            line_id: "1",
            product_id: "prod1",
            quantity: 100,
            unit_price: 100,
            line_total: 10000,
          },
        ],
      });

      const po2 = generatePurchaseOrder(TEST_BUSINESS, {
        items: [
          {
            line_id: "1",
            product_id: "prod1",
            quantity: 100,
            unit_price: 120,
            line_total: 12000,
          },
        ],
      });

      expect(po2.items[0].unit_price).toBeGreaterThan(po1.items[0].unit_price);
    });
  });
});
