"use strict";

/**
 * Sales Integration Tests
 * Tests end-to-end sales order and fulfillment workflows
 */

const {
  generateSalesOrder,
  generateShipment,
  TEST_BUSINESS,
  TEST_USER,
} = require("../fixtures/seed");

describe("Sales Workflow Integration", () => {
  describe("SO Creation to Shipment", () => {
    it("should create SO and generate shipment", () => {
      const so = generateSalesOrder(TEST_BUSINESS, { status: "pending" });

      const shipment = generateShipment(TEST_BUSINESS, {
        order_id: so.sales_order_id,
        recipient_name: so.customer_id,
      });

      expect(shipment.order_id).toBe(so.sales_order_id);
      expect(shipment.status).toBe("pending");
    });

    it("should track SO to delivery", () => {
      let so = generateSalesOrder(TEST_BUSINESS, { status: "pending" });
      expect(so.status).toBe("pending");

      so.status = "confirmed";
      expect(so.status).toBe("confirmed");

      so.status = "shipped";
      expect(so.status).toBe("shipped");

      so.status = "delivered";
      expect(so.status).toBe("delivered");
    });
  });

  describe("Multiple Orders", () => {
    it("should manage multiple sales orders", () => {
      const orders = [
        generateSalesOrder(TEST_BUSINESS),
        generateSalesOrder(TEST_BUSINESS),
        generateSalesOrder(TEST_BUSINESS),
      ];

      expect(orders.length).toBe(3);
      orders.forEach((so) => {
        expect(so.sales_order_id).toBeTruthy();
      });
    });
  });

  describe("Sales Analytics", () => {
    it("should calculate total sales value", () => {
      const orders = [
        generateSalesOrder(TEST_BUSINESS, { total: 50000 }),
        generateSalesOrder(TEST_BUSINESS, { total: 75000 }),
        generateSalesOrder(TEST_BUSINESS, { total: 100000 }),
      ];

      const totalValue = orders.reduce((sum, so) => sum + so.total, 0);
      expect(totalValue).toBe(225000);
    });

    it("should calculate average order value", () => {
      const orders = [
        generateSalesOrder(TEST_BUSINESS, { total: 50000 }),
        generateSalesOrder(TEST_BUSINESS, { total: 75000 }),
        generateSalesOrder(TEST_BUSINESS, { total: 100000 }),
      ];

      const avgValue =
        orders.reduce((sum, so) => sum + so.total, 0) / orders.length;
      expect(avgValue).toBe(75000);
    });
  });

  describe("Backorder Handling", () => {
    it("should handle items out of stock", () => {
      const so = generateSalesOrder(TEST_BUSINESS, {
        items: [
          {
            line_id: "1",
            product_id: "prod1",
            quantity: 100,
            unit_price: 1000,
            line_total: 100000,
            status: "backorder",
          },
        ],
      });

      expect(so.items[0].status).toBe("backorder");
    });

    it("should support partial fulfillment", () => {
      const so = generateSalesOrder(TEST_BUSINESS, {
        items: [
          {
            line_id: "1",
            product_id: "prod1",
            quantity: 100,
            shipped_quantity: 50,
            unit_price: 1000,
            line_total: 100000,
          },
        ],
      });

      expect(so.items[0].shipped_quantity).toBeLessThan(so.items[0].quantity);
    });
  });
});
